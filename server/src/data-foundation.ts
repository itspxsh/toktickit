import type { PrismaClient } from "@prisma/client";

export const REFERENCE_SEED = {
  categories: [
    "Account and Access",
    "Hardware",
    "Software",
    "Network",
  ],
  relatedSystems: [
    "Corporate Laptop",
    "Email",
    "VPN",
    "Payroll Portal",
    "Student Information System",
    "Network File Share",
    "Wi-Fi Network",
  ],
  requesters: [
    { name: "Jennifer Anderson", email: "jennifer@example.test", isActive: true },
    { name: "Michael Chen", email: "michael@example.test", isActive: true },
    { name: "Priya Shah", email: "priya@example.test", isActive: true },
    { name: "Luis Gomez", email: "luis@example.test", isActive: true },
    { name: "Taylor Morgan", email: "taylor@example.test", isActive: false },
  ],
} as const;

/** Seed stable reference data without creating duplicates on rerun. */
export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const name of REFERENCE_SEED.categories) {
      await tx.category.upsert({
        where: { name },
        update: {},
        create: { name, isActive: true },
      });
    }

    for (const name of REFERENCE_SEED.relatedSystems) {
      await tx.relatedSystem.upsert({
        where: { name },
        update: {},
        create: { name, isActive: true },
      });
    }

    for (const requester of REFERENCE_SEED.requesters) {
      await tx.requester.upsert({
        where: { email: requester.email },
        update: {},
        create: requester,
      });
    }
  });
}
