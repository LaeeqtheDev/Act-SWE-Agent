import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.service.createMany({
    data: [
      { name: "payments-api", status: "healthy" },
      { name: "orders-api", status: "healthy" },
      { name: "auth-api", status: "healthy" },
      { name: "notification-api", status: "degraded" },
    ],
  });

  console.log("Seeded services.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });