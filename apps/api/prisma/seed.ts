import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.incidentEvent.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.service.deleteMany();

  const payments = await prisma.service.create({
    data: { name: "payments-api", status: "healthy" },
  });
  const orders = await prisma.service.create({
    data: { name: "orders-api", status: "healthy" },
  });
  await prisma.service.create({
    data: { name: "auth-api", status: "healthy" },
  });
  const notifications = await prisma.service.create({
    data: { name: "notification-api", status: "degraded" },
  });

  const incident1042 = await prisma.incident.create({
    data: {
      serviceId: payments.id,
      title: "Database connection exhaustion",
      severity: "high",
      status: "investigating",
      errorRate: 18.4,
    },
  });

  await prisma.incident.create({
    data: {
      serviceId: orders.id,
      title: "Pod crash loop",
      severity: "medium",
      status: "resolved",
      resolvedAt: new Date(),
    },
  });

  await prisma.incident.create({
    data: {
      serviceId: notifications.id,
      title: "API latency spike",
      severity: "low",
      status: "resolved",
      resolvedAt: new Date(),
    },
  });

  await prisma.incidentEvent.createMany({
    data: [
      { incidentId: incident1042.id, message: "Deployment v43 started" },
      { incidentId: incident1042.id, message: "Database connections +38%" },
      { incidentId: incident1042.id, message: "payments-api latency +210%" },
      { incidentId: incident1042.id, message: "5xx rate exceeds threshold" },
    ],
  });

  console.log("Seeded services, incidents, and events.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });