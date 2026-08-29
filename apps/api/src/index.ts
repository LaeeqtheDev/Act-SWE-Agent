import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { eventQueue } from "./queue.js";

const app = express();
const prisma = new PrismaClient();
const PORT = 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/services", async (req, res) => {
  const services = await prisma.service.findMany();
  res.json(services);
});

app.get("/incidents", async (req, res) => {
  const incidents = await prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(incidents);
});

app.get("/incidents/:id/events", async (req, res) => {
  const events = await prisma.incidentEvent.findMany({
    where: { incidentId: req.params.id },
    orderBy: { timestamp: "asc" },
  });
  res.json(events);
});

// --- Simulator ---

app.post("/simulate/database-overload", async (req, res) => {
  const { serviceName = "payments-api" } = req.body ?? {};

  const service = await prisma.service.findFirst({ where: { name: serviceName } });
  if (!service) {
    return res.status(404).json({ error: `Service '${serviceName}' not found` });
  }

  const rawEvents = [
    { type: "deployment", message: "Deployment v43 started" },
    { type: "db_connections", message: "Database connections +38%" },
    { type: "latency", message: `${service.name} latency +210%` },
    { type: "error_rate", message: "5xx rate exceeds threshold" },
  ];

  // Push each event onto the queue instead of writing directly to the DB.
  // A separate worker process picks these up and processes them.
  for (const e of rawEvents) {
    await eventQueue.add("service-event", {
      serviceId: service.id,
      serviceName: service.name,
      type: e.type,
      message: e.message,
    });
  }

  res.json({ queued: rawEvents.length, serviceId: service.id });
});

app.post("/simulate/pod-crash-loop", async (req, res) => {
  const { serviceName = "auth-api" } = req.body ?? {};

  const service = await prisma.service.findFirst({ where: { name: serviceName } });
  if (!service) {
    return res.status(404).json({ error: `Service '${serviceName}' not found` });
  }

  const rawEvents = [
    { type: "pod_restart", message: `${service.name} pod entered CrashLoopBackOff` },
    { type: "pod_restart", message: `${service.name} pod restarted (attempt 2)` },
    { type: "pod_restart", message: `${service.name} pod restarted (attempt 3)` },
  ];

  for (const e of rawEvents) {
    await prisma.event.create({
      data: { serviceId: service.id, type: e.type, message: e.message },
    });
  }

  await prisma.service.update({ where: { id: service.id }, data: { status: "degraded" } });

  const recentRestarts = await prisma.event.count({
    where: {
      serviceId: service.id,
      type: "pod_restart",
      timestamp: { gte: new Date(Date.now() - 60_000) },
    },
  });

  let incident = null;
  if (recentRestarts >= 3) {
    incident = await prisma.incident.create({
      data: {
        serviceId: service.id,
        title: "Pod crash loop",
        severity: "medium",
        status: "investigating",
      },
    });

    await prisma.incidentEvent.createMany({
      data: rawEvents.map((e) => ({ incidentId: incident!.id, message: e.message })),
    });
  }

  res.json({ triggeredEvents: rawEvents.length, incidentCreated: !!incident, incident });
});

app.post("/incidents/:id/resolve", async (req, res) => {
  const incident = await prisma.incident.update({
    where: { id: req.params.id },
    data: { status: "resolved", resolvedAt: new Date() },
  });

  await prisma.service.update({
    where: { id: incident.serviceId },
    data: { status: "healthy" },
  });

  await prisma.incidentEvent.create({
    data: { incidentId: incident.id, message: "Incident marked resolved" },
  });

  res.json(incident);
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});