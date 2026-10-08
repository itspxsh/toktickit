import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
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
        select: { id: true },
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
    }
    for (const requester of REFERENCE_SEED.requesters) {
      const user = requesterUsers.find(({ email }) => email === requester.email);
      if (!user) throw new Error("Lab 3 requester user is incomplete");
      await tx.requester.upsert({
        where: { email: requester.email },
        update: {},
        create: { ...requester, userId: user.id },
        select: { id: true, userId: true },
      });
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
      { key: "lab3-seed-vpn", requester: requesterOne, requesterUserId: requesterUsers[0].id, categoryId: hardware.id, relatedSystemId: vpn.id, summary: "VPN access request", description: "Seeded staff workflow ticket.", requestedPriority: "HIGH" as const, itPriority: "HIGH" as const, currentStatus: "NEW" as const, assignedStaffId: staffUsers[0]?.id ?? null },
      { key: "lab3-seed-email", requester: requesterTwo, requesterUserId: requesterUsers[1].id, categoryId: software.id, relatedSystemId: emailSystem.id, summary: "Email client issue", description: "Seeded requester communication ticket.", requestedPriority: "MEDIUM" as const, itPriority: "MEDIUM" as const, currentStatus: "IN_PROGRESS" as const, assignedStaffId: staffUsers[1]?.id ?? null },
    ];
    for (const seed of ticketSeeds) {
      let ticket = await tx.ticket.findUnique({
        where: { clientRequestId: seed.key },
        select: { id: true },
      });
      if (!ticket) {
        const allocated = await allocateTicketNumber(tx);
        const created = await tx.$queryRaw<Array<{ id: number }>>`
          INSERT INTO "Ticket" (
            "ticketNumber", "ticketSequence", "requesterId", "requesterUserId",
            "assignedStaffId", "categoryId", "relatedSystemId", "summary",
            "requestedPriority", "description", "itPriority", "currentStatus", "clientRequestId"
          ) VALUES (
            ${allocated.ticketNumber}, ${allocated.ticketSequence}, ${seed.requester.id},
            ${seed.requesterUserId}, ${seed.assignedStaffId}, ${seed.categoryId},
            ${seed.relatedSystemId}, ${seed.summary}, ${seed.requestedPriority}::"RequestedPriority", ${seed.description},
            ${seed.itPriority}::"ItPriority", ${seed.currentStatus}::"CurrentStatus", ${seed.key}
          ) RETURNING "id"
        `;
        ticket = created[0]!;
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

type Lab4SeedAction = {
  key: string;
  description: string;
  state: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  result?: string;
  cancellationReason?: string;
  assigneeId: number;
  performedById?: number;
};

/**
 * Add deterministic Lab 4 workflow fixtures without changing existing work.
 * Every seed Ticket and Action is create-only; retries never reactivate users
 * or rewrite Ticket ownership/status or Action content.
 */
export async function seedLab4Data(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const requesterSeeds = await Promise.all([
      tx.requester.findUnique({ where: { email: "jennifer@example.test" } }),
      tx.requester.findUnique({ where: { email: "michael@example.test" } }),
    ]);
    const requesters = requesterSeeds.filter((requester) => requester !== null);
    const supportUsers = await tx.user.findMany({
      where: { role: { in: ["IT_STAFF", "ADMIN"] }, isActive: true },
      orderBy: [{ email: "asc" }, { id: "asc" }],
    });
    const categories = await tx.category.findMany({ orderBy: { name: "asc" } });
    const systems = await tx.relatedSystem.findMany({ orderBy: { name: "asc" } });
    if (requesters.length < 2 || supportUsers.length < 2 || categories.length === 0 || systems.length === 0) {
      throw new Error("Lab 4 seed requires Lab 3 requester, support, and reference fixtures");
    }

    const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
    const statuses = [
      "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
      "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
    ] as const;
    const tickets = new Map<string, { id: number; status: (typeof statuses)[number] }>();

    for (let index = 0; index < statuses.length; index += 1) {
      const status = statuses[index]!;
      const key = `lab4-seed-ticket-${status.toLowerCase()}`;
      const requester = requesters[index % requesters.length]!;
      const existing = await tx.ticket.findUnique({ where: { clientRequestId: key } });
      let ticket = existing;
      if (!ticket) {
        const allocated = await allocateTicketNumber(tx);
        ticket = await tx.ticket.create({
          data: {
            ticketNumber: allocated.ticketNumber,
            ticketSequence: allocated.ticketSequence,
            requesterId: requester.id,
            requesterUserId: requester.userId,
            assignedStaffId: supportUsers[index % supportUsers.length]!.id,
            categoryId: categories[index % categories.length]!.id,
            relatedSystemId: systems[index % systems.length]!.id,
            summary: `Lab 4 ${status.toLowerCase().replaceAll("_", " ")} workflow fixture`,
            requestedPriority: priorities[index % priorities.length]!,
            description: "Deterministic, create-only Lab 4 workflow fixture.",
            itPriority: index === statuses.length - 1 ? null : priorities[index % priorities.length]!,
            currentStatus: status,
            clientRequestId: key,
            resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date("2026-01-02T03:04:05.000Z") : null,
          },
        });
      }
      tickets.set(status, { id: ticket.id, status });
    }

    const openTicket = tickets.get("OPEN")!;
    const inProgressTicket = tickets.get("IN_PROGRESS")!;
    const actionFixtures: Array<{ ticketId: number; key: string; data: Lab4SeedAction }> = [
      { ticketId: openTicket.id, key: "lab4-seed-action-planned", data: { key: "lab4-seed-action-planned", description: "Inspect the reported workstation configuration.", state: "PLANNED", assigneeId: supportUsers[0]!.id } },
      { ticketId: openTicket.id, key: "lab4-seed-action-active", data: { key: "lab4-seed-action-active", description: "Confirm network reachability from the affected workstation.", state: "IN_PROGRESS", assigneeId: supportUsers[1]!.id } },
      { ticketId: openTicket.id, key: "lab4-seed-action-completed", data: { key: "lab4-seed-action-completed", description: "Review the available diagnostic details.", state: "COMPLETED", result: "The diagnostic details were reviewed.", assigneeId: supportUsers[0]!.id, performedById: supportUsers[1]!.id } },
      { ticketId: inProgressTicket.id, key: "lab4-seed-action-cancelled", data: { key: "lab4-seed-action-cancelled", description: "Prepare the superseded troubleshooting step.", state: "CANCELLED", cancellationReason: "Superseded by a safer diagnostic step.", assigneeId: supportUsers[1]!.id } },
    ];

    for (const fixture of actionFixtures) {
      const existing = await tx.actionTaken.findUnique({
        where: { ticketId_clientRequestId: { ticketId: fixture.ticketId, clientRequestId: seedUuid(fixture.key) } },
      });
      if (existing) continue;

      const payloadFingerprint = createHash("sha256")
        .update(JSON.stringify(fixture.data))
        .digest("hex");
      const created = await tx.actionTaken.create({
        data: {
          ticketId: fixture.ticketId,
          clientRequestId: seedUuid(fixture.key),
          payloadFingerprint,
          createdById: supportUsers[0]!.id,
          assigneeId: fixture.data.assigneeId,
          performedById: fixture.data.performedById ?? null,
          description: fixture.data.description,
          result: fixture.data.result ?? "",
          followUpRequired: false,
          followUpNote: "",
          attachmentNotes: "",
          state: fixture.data.state,
          cancellationReason: fixture.data.cancellationReason ?? null,
          completedAt: fixture.data.state === "COMPLETED" ? new Date("2026-01-02T03:04:05.000Z") : null,
          cancelledAt: fixture.data.state === "CANCELLED" ? new Date("2026-01-02T03:04:05.000Z") : null,
        },
      });
      await tx.actionRevision.create({
        data: {
          actionId: created.id,
          version: 1,
          actorId: supportUsers[0]!.id,
          kind: "CREATE",
          snapshot: {
            id: created.id,
            ticketId: fixture.ticketId,
            createdById: created.createdById,
            assigneeId: created.assigneeId,
            performedById: created.performedById,
            description: created.description,
            result: created.result,
            followUpRequired: created.followUpRequired,
            followUpNote: created.followUpNote,
            attachmentNotes: created.attachmentNotes,
            state: created.state,
            cancellationReason: created.cancellationReason,
            completedAt: created.completedAt?.toISOString() ?? null,
            cancelledAt: created.cancelledAt?.toISOString() ?? null,
            version: created.version,
          },
        },
      });
    }
  });
}

function seedUuid(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
