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

    const hasDbSpike = recentEvents.some((e) => e.type === "db_connections");
    const hasErrorSpike = recentEvents.some((e) => e.type === "error_rate");

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
          data: recentEvents.map((e) => ({ incidentId: incident.id, message: e.message })),
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

console.log("Worker started, listening for events...");