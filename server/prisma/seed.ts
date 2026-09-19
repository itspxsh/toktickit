import { getPrisma } from "../src/prisma.js";
import { seedLab3Data } from "../src/data-foundation.js";

async function main() {
  const prisma = getPrisma();
  await seedLab3Data(prisma);
  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
