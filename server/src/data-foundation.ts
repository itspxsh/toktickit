import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { allocateTicketNumber } from "./ticket-number.js";

/** Hash inserted by the migration until the environment-backed seed runs. */
export const MIGRATION_BOOTSTRAP_HASH =
  "$scrypt$N=16384,r=8,p=1$3lEAAE84MtKq36w8VGKvaA$vwum5eXwdKdoJd7CCRvF/t5FFstx6da3QHcfhK02+HQ";

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

const LAB3_STAFF_SEED = [
  { name: "Support One", email: "support.one@example.test", role: "IT_STAFF" as const, isActive: true },
  { name: "Support Two", email: "support.two@example.test", role: "IT_STAFF" as const, isActive: true },
  { name: "Support Three", email: "support.three@example.test", role: "IT_STAFF" as const, isActive: true },
  { name: "Support Reserve", email: "support.reserve@example.test", role: "IT_STAFF" as const, isActive: false },
];

const LAB3_ADMIN_SEED = {
  name: "System Administrator",
  email: "admin@example.test",
  role: "ADMIN" as const,
  isActive: true,
};

type SeedClient = PrismaClient | Prisma.TransactionClient;

async function hashInitialPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 32, { N: 16_384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
  return `$scrypt$N=16384,r=8,p=1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

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

/**
 * Seed the Lab 3 identity/workflow foundation. Initial passwords are supplied
 * only through the environment and are immediately converted to salted hashes.
 */
export async function seedLab3Data(prisma: PrismaClient): Promise<void> {
  const initialPassword = process.env.LAB3_INITIAL_PASSWORD ?? process.env.LAB3_TEST_INITIAL_PASSWORD;
  if (!initialPassword) {
    throw new Error("LAB3_INITIAL_PASSWORD is required for Lab 3 seed");
  }
  const passwordHash = await hashInitialPassword(initialPassword);

  await prisma.$transaction(async (tx) => {
    for (const name of REFERENCE_SEED.categories) {
      await tx.category.upsert({ where: { name }, update: {}, create: { name, isActive: true } });
    }
    for (const name of REFERENCE_SEED.relatedSystems) {
      await tx.relatedSystem.upsert({ where: { name }, update: {}, create: { name, isActive: true } });
    }
    for (const requester of REFERENCE_SEED.requesters) {
      await tx.requester.upsert({ where: { email: requester.email }, update: {}, create: requester });
    }

    const ensureUser = async (seed: { name: string; email: string; role: "REQUESTER" | "IT_STAFF" | "ADMIN"; isActive: boolean }) => {
      const email = seed.email.trim().toLowerCase();
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            name: seed.name,
            email,
            passwordHash,
            role: seed.role,
            isActive: seed.isActive,
            mustChangePassword: true,
          },
        });
      } else if (user.passwordHash === MIGRATION_BOOTSTRAP_HASH) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { passwordHash, mustChangePassword: true },
        });
      }
      return user;
    };

    const requesterUsers = [] as Array<{ id: number; email: string }>;
    for (const requester of REFERENCE_SEED.requesters) {
      const user = await ensureUser({ ...requester, role: "REQUESTER" });
      requesterUsers.push({ id: user.id, email: user.email });
      await tx.requester.update({ where: { email: requester.email }, data: { userId: user.id } });
    }
    const staffUsers = [] as Array<{ id: number; email: string }>;
    for (const staff of LAB3_STAFF_SEED) {
      const user = await ensureUser(staff);
      staffUsers.push({ id: user.id, email: user.email });
    }
    const admin = await ensureUser(LAB3_ADMIN_SEED);

    const hardware = await tx.category.findUnique({ where: { name: "Hardware" } });
    const software = await tx.category.findUnique({ where: { name: "Software" } });
    const vpn = await tx.relatedSystem.findUnique({ where: { name: "VPN" } });
    const emailSystem = await tx.relatedSystem.findUnique({ where: { name: "Email" } });
    if (!hardware || !software || !vpn || !emailSystem || !requesterUsers[0] || !requesterUsers[1]) {
      throw new Error("Lab 3 seed reference rows are incomplete");
    }

    const requesterOne = await tx.requester.findUnique({ where: { email: requesterUsers[0].email } });
    const requesterTwo = await tx.requester.findUnique({ where: { email: requesterUsers[1].email } });
    if (!requesterOne || !requesterTwo) throw new Error("Lab 3 requester mapping is incomplete");

    const ticketSeeds = [
      { key: "lab3-seed-vpn", requester: requesterOne, requesterUserId: requesterUsers[0].id, categoryId: hardware.id, relatedSystemId: vpn.id, summary: "VPN access request", description: "Seeded staff workflow ticket.", requestedPriority: "HIGH" as const, itPriority: "HIGH" as const, currentStatus: "OPEN" as const, assignedStaffId: staffUsers[0]?.id ?? null },
      { key: "lab3-seed-email", requester: requesterTwo, requesterUserId: requesterUsers[1].id, categoryId: software.id, relatedSystemId: emailSystem.id, summary: "Email client issue", description: "Seeded requester communication ticket.", requestedPriority: "MEDIUM" as const, itPriority: "MEDIUM" as const, currentStatus: "IN_PROGRESS" as const, assignedStaffId: staffUsers[1]?.id ?? null },
    ];
    for (const seed of ticketSeeds) {
      let ticket = await tx.ticket.findUnique({ where: { clientRequestId: seed.key } });
      if (!ticket) {
        const allocated = await allocateTicketNumber(tx);
        ticket = await tx.ticket.create({
          data: {
            ticketNumber: allocated.ticketNumber,
            ticketSequence: allocated.ticketSequence,
            requesterId: seed.requester.id,
            requesterUserId: seed.requesterUserId,
            assignedStaffId: seed.assignedStaffId,
            categoryId: seed.categoryId,
            relatedSystemId: seed.relatedSystemId,
            summary: seed.summary,
            requestedPriority: seed.requestedPriority,
            description: seed.description,
            itPriority: seed.itPriority,
            currentStatus: seed.currentStatus,
            clientRequestId: seed.key,
          },
        });
      }
      if (ticket && (await tx.publicComment.count({ where: { ticketId: ticket.id } })) === 0) {
        await tx.publicComment.create({
          data: { ticketId: ticket.id, authorUserId: seed.requesterUserId, body: "Seeded public comment." },
        });
      }
      if (ticket && (await tx.internalNote.count({ where: { ticketId: ticket.id } })) === 0) {
        await tx.internalNote.create({
          data: { ticketId: ticket.id, authorUserId: admin.id, body: "Seeded internal note." },
        });
      }
    }
  });
}
