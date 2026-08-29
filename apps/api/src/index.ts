import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

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

  // Simulate a burst of raw events, spaced a few seconds apart
  const rawEvents = [
    { type: "deployment", message: "Deployment v43 started" },
    { type: "db_connections", message: "Database connections +38%" },
    { type: "latency", message: `${service.name} latency +210%` },
    { type: "error_rate", message: "5xx rate exceeds threshold" },
  ];

  for (const e of rawEvents) {
    await prisma.event.create({
      data: { serviceId: service.id, type: e.type, message: e.message },
    });
  }

  await prisma.service.update({
    where: { id: service.id },
    data: { status: "degraded" },
  });

  // --- Rule-based detection ---
  // Rule: if a service has both a "db_connections" and "error_rate" event
  // within the last 60 seconds, open a HIGH incident.
  const recentEvents = await prisma.event.findMany({
    where: {
      serviceId: service.id,
      timestamp: { gte: new Date(Date.now() - 60_000) },
    },
  });

  const hasDbSpike = recentEvents.some((e) => e.type === "db_connections");
  const hasErrorSpike = recentEvents.some((e) => e.type === "error_rate");

  let incident = null;
  if (hasDbSpike && hasErrorSpike) {
    incident = await prisma.incident.create({
      data: {
        serviceId: service.id,
        title: "Database connection exhaustion",
        severity: "high",
        status: "investigating",
        errorRate: 18.4,
      },
    });

    // Copy the raw events into the incident's timeline
    await prisma.incidentEvent.createMany({
      data: rawEvents.map((e) => ({ incidentId: incident!.id, message: e.message })),
    });
  }

  res.json({ triggeredEvents: rawEvents.length, incidentCreated: !!incident, incident });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});