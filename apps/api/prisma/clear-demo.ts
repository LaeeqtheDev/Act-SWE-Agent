import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Removes the seeded demo services and incidents (payments-api, orders-api,
// auth-api, notification-api and their incidents) while leaving everything
// real untouched: your conversations, workflows, agent-detected incidents,
// saved profile, and provider settings all stay.
//
// Run when you want the dashboard to show only real activity:
//   pnpm clear-demo
//
// Note: the landing page's try-it-now demo widget reads these services, so
// clearing them leaves that widget with nothing interesting to say. Re-seed
// any time with `pnpm exec prisma db seed`.
async function main() {
  const deletedEvents = await prisma.event.deleteMany({});
  const deletedIncidentEvents = await prisma.incidentEvent.deleteMany({});
  await prisma.agentAction.updateMany({ where: { incidentId: { not: null } }, data: { incidentId: null } });
  const deletedIncidents = await prisma.incident.deleteMany({});
  const deletedServices = await prisma.service.deleteMany({});

  console.log(`Cleared demo data:
  ${deletedServices.count} services
  ${deletedIncidents.count} incidents
  ${deletedIncidentEvents.count} incident events
  ${deletedEvents.count} telemetry events

Your conversations, workflows, agent incidents, and profile were not touched.
Re-seed any time with: pnpm exec prisma db seed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
