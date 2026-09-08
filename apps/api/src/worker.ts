import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { connection } from "./queue.js";

const prisma = new PrismaClient();

const worker = new Worker(
  "events",
  async (job) => {
    const { serviceId, serviceName, type, message } = job.data;

    // Write the raw event to the database
    await prisma.event.create({
      data: { serviceId, type, message },
    });

    await prisma.service.update({
      where: { id: serviceId },
      data: { status: "degraded" },
    });

    console.log(`[worker] processed event: ${type} for ${serviceName}`);

    // Rule-based detection: check for the same db_connections + error_rate pattern
    const recentEvents = await prisma.event.findMany({
      where: {
        serviceId,
        timestamp: { gte: new Date(Date.now() - 60_000) },
      },
    });

    const hasDbSpike = recentEvents.some((e: { type: string }) => e.type === "db_connections");
    const hasErrorSpike = recentEvents.some((e: { type: string }) => e.type === "error_rate");

    if (hasDbSpike && hasErrorSpike) {
      const existingOpenIncident = await prisma.incident.findFirst({
        where: { serviceId, status: { not: "resolved" } },
      });

      if (!existingOpenIncident) {
        const incident = await prisma.incident.create({
          data: {
            serviceId,
            title: "Database connection exhaustion",
            severity: "high",
            status: "investigating",
            errorRate: 18.4,
          },
        });

        await prisma.incidentEvent.createMany({
          data: recentEvents.map((e: { message: string }) => ({ incidentId: incident.id, message: e.message })),
        });

        console.log(`[worker] incident created: ${incident.id} for ${serviceName}`);
      }
    }
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

// Without this the Worker prints a full ECONNREFUSED stack trace on every
// single reconnect attempt — thousands of identical traces that bury every
// other log line. The worker only drives the simulated incident pipeline,
// so a missing Redis is a one-line notice, not a crash.
let warnedNoRedis = false;
worker.on("error", (err: Error & { code?: string }) => {
  const isConnRefused = err?.code === "ECONNREFUSED" || err?.message?.includes("ECONNREFUSED");
  if (isConnRefused) {
    if (warnedNoRedis) return;
    warnedNoRedis = true;
    console.warn(
      `[worker] Redis isn't reachable at ${connection.host}:${connection.port}. ` +
        "This worker only powers the simulated incident pipeline — the agent itself is unaffected. " +
        "Start Redis with `docker compose up redis -d`, or just stop this worker process."
    );
    return;
  }
  console.error("[worker]", err.message);
});

// Same reason: exiting cleanly beats an unhandled rejection stack trace.
process.on("SIGTERM", () => void worker.close().then(() => process.exit(0)));
process.on("SIGINT", () => void worker.close().then(() => process.exit(0)));

console.log("Worker started, listening for events...");