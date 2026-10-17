import { randomBytes } from "node:crypto";
import express from "express";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedLab3Data, seedLab4Data } from "../../src/data-foundation.js";
import { ActionRuleError } from "../../src/lab-04/action-rules.js";
import { createAction, updateAction } from "../../src/lab-04/action-service.js";
import { assignTicket, claimTicket, updateTicketPriority, updateTicketStatus } from "../../src/lab-04/workflow-service.js";
import type { Request } from "express";
import { assertTestDatabaseUrl, createTestPrisma } from "../helpers/test-database.js";
import { deployMigrationHistory, resetGuardedTestDatabase } from "../helpers/lab4-migration-fixture.js";
import { registerAttachmentRoutes } from "../../src/routes/attachments.js";

function synchronizeTransactions(clients: PrismaClient[]): PrismaClient[] {
  let entered = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  return clients.map((client) => new Proxy(client, {
    get(target, property) {
      if (property === "$transaction") return async (...args: unknown[]) => {
        entered += 1;
        if (entered === clients.length) release();
        await ready;
        return (target.$transaction as (...values: unknown[]) => Promise<unknown>)(...args);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PrismaClient);
}

describe.sequential("L4-04/06 PostgreSQL workflow concurrency", () => {
  let url: string;
  let prisma: PrismaClient;
  let previousPassword: string | undefined;

  beforeAll(async () => {
    // Fail before any reset/deploy unless the configured DB is explicitly
    // test-scoped; this suite never falls back to DATABASE_URL.
    url = assertTestDatabaseUrl();
    previousPassword = process.env.LAB3_TEST_INITIAL_PASSWORD;
    process.env.LAB3_TEST_INITIAL_PASSWORD ??= randomBytes(32).toString("base64url");
    await resetGuardedTestDatabase();
    deployMigrationHistory(url, true);
    prisma = createTestPrisma();
    await seedLab3Data(prisma);
    await seedLab4Data(prisma);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (previousPassword === undefined) delete process.env.LAB3_TEST_INITIAL_PASSWORD;
    else process.env.LAB3_TEST_INITIAL_PASSWORD = previousPassword;
  });

  it("T-ACT-08 rolls back Action and Ticket versions when revision insertion fails", async () => {
    const ticket = await prisma.ticket.findUnique({
      where: { clientRequestId: "lab4-seed-ticket-open" },
      select: { id: true, ticketNumber: true, workflowVersion: true, currentStatus: true, assignedStaffId: true },
    });
    expect(ticket).not.toBeNull();
    const action = await prisma.actionTaken.findFirst({ where: { ticketId: ticket!.id, state: "PLANNED" }, orderBy: { id: "asc" } });
    expect(action).not.toBeNull();
    const beforeRevisionCount = await prisma.actionRevision.count({ where: { actionId: action!.id } });
    const ctx = {
      ticket: ticket!,
      ticketNumber: ticket!.ticketNumber,
      // Stay within PostgreSQL INT4 while using an ID guaranteed not to exist.
      actorId: 2_147_483_647,
    };

    await expect(updateAction(prisma, ctx, action!.id, {
      expectedTicketVersion: ticket!.workflowVersion,
      expectedVersion: action!.version,
      changes: { description: "This edit must roll back with its revision" },
    })).rejects.toMatchObject({ code: "P2003" });

    const [afterAction, afterTicket, afterRevisionCount] = await Promise.all([
      prisma.actionTaken.findUnique({ where: { id: action!.id } }),
      prisma.ticket.findUnique({ where: { id: ticket!.id }, select: { workflowVersion: true } }),
      prisma.actionRevision.count({ where: { actionId: action!.id } }),
    ]);
    expect(afterAction).toMatchObject({ description: action!.description, version: action!.version });
    expect(afterTicket?.workflowVersion).toBe(ticket!.workflowVersion);
    expect(afterRevisionCount).toBe(beforeRevisionCount);
  });

  it("T-RACE-01 serializes concurrent edits to one Action across independent PostgreSQL connections", async () => {
    const ticket = await prisma.ticket.findUnique({
      where: { clientRequestId: "lab4-seed-ticket-open" },
      select: { id: true, ticketNumber: true, workflowVersion: true, currentStatus: true, assignedStaffId: true },
    });
    expect(ticket).not.toBeNull();
    const action = await prisma.actionTaken.findFirst({ where: { ticketId: ticket!.id, state: "PLANNED" }, orderBy: { id: "asc" } });
    expect(action).not.toBeNull();
    const actor = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
    expect(actor).not.toBeNull();

    const connectionA = new PrismaClient({ datasources: { db: { url } } });
    const connectionB = new PrismaClient({ datasources: { db: { url } } });
    const context = {
      ticket: ticket!,
      ticketNumber: ticket!.ticketNumber,
      actorId: actor!.id,
    };
    const revisionsBefore = await prisma.actionRevision.count({ where: { actionId: action!.id } });
    try {
      const outcomes = await Promise.allSettled([
        updateAction(connectionA, context, action!.id, {
          expectedTicketVersion: ticket!.workflowVersion,
          expectedVersion: action!.version,
          changes: { description: "Concurrent edit from connection A" },
        }),
        updateAction(connectionB, context, action!.id, {
          expectedTicketVersion: ticket!.workflowVersion,
          expectedVersion: action!.version,
          changes: { description: "Concurrent edit from connection B" },
        }),
      ]);
      expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find(({ status }) => status === "rejected");
      expect(rejected?.status).toBe("rejected");
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(ActionRuleError);
        expect(rejected.reason).toMatchObject({ status: 409, code: "STALE_WRITE" });
      }

      const [afterAction, afterTicket, revisionsAfter] = await Promise.all([
        prisma.actionTaken.findUnique({ where: { id: action!.id } }),
        prisma.ticket.findUnique({ where: { id: ticket!.id }, select: { workflowVersion: true } }),
        prisma.actionRevision.count({ where: { actionId: action!.id } }),
      ]);
      expect(afterAction?.version).toBe(action!.version + 1);
      expect(["Concurrent edit from connection A", "Concurrent edit from connection B"]).toContain(afterAction?.description);
      expect(afterTicket?.workflowVersion).toBe(ticket!.workflowVersion + 1);
      expect(revisionsAfter).toBe(revisionsBefore + 1);
    } finally {
      await Promise.all([connectionA.$disconnect(), connectionB.$disconnect()]);
    }
  });

  it("T-RACE-02 never commits a resolved Ticket with an unfinished Action in a barrier-synchronized race", async () => {
    const actor = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true, name: true, role: true } });
    const seeded = await prisma.ticket.findUnique({ where: { clientRequestId: "lab4-seed-ticket-resolved" }, select: { id: true, ticketNumber: true } });
    expect(actor).not.toBeNull();
    expect(seeded).not.toBeNull();
    const ticket = await prisma.ticket.update({
      where: { id: seeded!.id },
      data: { currentStatus: "OPEN", workflowVersion: 20, resolvedAt: null, assignedStaffId: null },
      select: { id: true, ticketNumber: true, workflowVersion: true, currentStatus: true, assignedStaffId: true },
    });
    const support = await prisma.user.findFirst({ where: { role: "IT_STAFF", isActive: true }, select: { id: true } });
    expect(support).not.toBeNull();
    await prisma.actionTaken.create({ data: {
      ticketId: ticket.id, clientRequestId: randomBytes(16).toString("hex"), payloadFingerprint: "c".repeat(64),
      createdById: actor!.id, assigneeId: support!.id, performedById: actor!.id,
      description: "Verified the test fixture service recovery", result: "Service recovery confirmed before concurrent operations.",
      followUpRequired: false, followUpNote: "", attachmentNotes: "", state: "COMPLETED", completedAt: new Date(), version: 1,
    } });

    const connectionA = new PrismaClient({ datasources: { db: { url } } });
    const connectionB = new PrismaClient({ datasources: { db: { url } } });
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const synchronized = (client: PrismaClient) => new Proxy(client, {
      get(target, property) {
        if (property === "$transaction") return async (...args: unknown[]) => {
          arrived += 1;
          if (arrived === 2) release();
          await barrier;
          return (target.$transaction as (...values: unknown[]) => Promise<unknown>)(...args);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as PrismaClient;
    const requestContext = { auth: { user: { id: actor!.id, role: "ADMIN" } } } as unknown as Request;
    try {
      const outcomes = await Promise.allSettled([
        createAction(synchronized(connectionA), { ticket, ticketNumber: ticket.ticketNumber, actorId: actor!.id }, {
          clientRequestId: "8eb61c24-2ad6-4cb1-9124-9314dbbe9d01", expectedTicketVersion: ticket.workflowVersion,
          assigneeId: support!.id, content: { description: "Create concurrent diagnostic work", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" },
        }),
        updateTicketStatus(synchronized(connectionB), requestContext, {
          ticketNumber: ticket.ticketNumber,
          currentStatus: "RESOLVED", confirm: true, role: "ADMIN", actorId: actor!.id, expectedTicketVersion: ticket.workflowVersion,
        }),
      ]);
      expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const after = await prisma.ticket.findUnique({ where: { id: ticket.id }, select: { currentStatus: true, workflowVersion: true } });
      const actions = await prisma.actionTaken.findMany({ where: { ticketId: ticket.id }, select: { state: true, result: true } });
      if (after?.currentStatus === "RESOLVED") {
        expect(actions.every((action) => action.state === "COMPLETED" || action.state === "CANCELLED")).toBe(true);
      } else {
        expect(after?.currentStatus).toBe("OPEN");
        expect(actions.some((action) => action.state === "PLANNED")).toBe(true);
      }
    } finally {
      await Promise.all([connectionA.$disconnect(), connectionB.$disconnect()]);
    }
  });

  it("T-RACE-03 allows only one barrier-synchronized claim for the same Ticket version", async () => {
    const actors = await prisma.user.findMany({ where: { role: { in: ["IT_STAFF", "ADMIN"] }, isActive: true }, orderBy: { id: "asc" }, take: 2, select: { id: true, role: true } });
    const seeded = await prisma.ticket.findUnique({ where: { clientRequestId: "lab4-seed-ticket-open" }, select: { id: true, ticketNumber: true } });
    expect(actors).toHaveLength(2);
    expect(seeded).not.toBeNull();
    const ticket = await prisma.ticket.update({ where: { id: seeded!.id }, data: { currentStatus: "OPEN", workflowVersion: 30, resolvedAt: null, assignedStaffId: null }, select: { id: true, ticketNumber: true, workflowVersion: true } });
    const connectionA = new PrismaClient({ datasources: { db: { url } } });
    const connectionB = new PrismaClient({ datasources: { db: { url } } });
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const synchronized = (client: PrismaClient) => new Proxy(client, {
      get(target, property) {
        if (property === "$transaction") return async (...args: unknown[]) => {
          arrived += 1;
          if (arrived === 2) release();
          await barrier;
          return (target.$transaction as (...values: unknown[]) => Promise<unknown>)(...args);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as PrismaClient;
    const makeRequest = (user: { id: number; role: string }) => ({ auth: { user } } as unknown as Request);
    try {
      const outcomes = await Promise.allSettled(actors.map((user, index) => claimTicket(
        synchronized(index === 0 ? connectionA : connectionB), makeRequest(user),
        { ticketNumber: ticket.ticketNumber, actorId: user.id, role: user.role as "ADMIN" | "IT_STAFF", expectedTicketVersion: ticket.workflowVersion },
      )));
      expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find(({ status }) => status === "rejected");
      expect(rejected?.status).toBe("rejected");
      if (rejected?.status === "rejected") expect(rejected.reason).toMatchObject({ status: 409, code: "STALE_WRITE" });
      const after = await prisma.ticket.findUnique({ where: { id: ticket.id }, select: { assignedStaffId: true, workflowVersion: true } });
      expect(after?.assignedStaffId).toBeTruthy();
      expect(after?.workflowVersion).toBe(ticket.workflowVersion + 1);
    } finally {
      await Promise.all([connectionA.$disconnect(), connectionB.$disconnect()]);
    }
  });

  it("T-RACE-03 serializes competing assignment, priority, and status writes and rejects an ABA version", async () => {
    const users = await prisma.user.findMany({ where: { role: { in: ["IT_STAFF", "ADMIN"] }, isActive: true }, orderBy: { id: "asc" }, take: 2, select: { id: true, role: true } });
    const seed = await prisma.ticket.findUnique({ where: { clientRequestId: "lab4-seed-ticket-open" }, select: { id: true, ticketNumber: true } });
    expect(users).toHaveLength(2);
    expect(seed).not.toBeNull();
    const first = new PrismaClient({ datasources: { db: { url } } });
    const second = new PrismaClient({ datasources: { db: { url } } });
    const makeRequest = (user: { id: number; role: string }) => ({ auth: { user } } as unknown as Request);
    const race = async <T>(left: () => Promise<T>, right: () => Promise<T>) => Promise.allSettled([left(), right()]);
    try {
      const assignmentTicket = await prisma.ticket.update({ where: { id: seed!.id }, data: { currentStatus: "OPEN", assignedStaffId: null, workflowVersion: 50 }, select: { id: true, ticketNumber: true, workflowVersion: true } });
      const [assignmentA, assignmentB] = synchronizeTransactions([first, second]);
      const assignmentOutcomes = await race(
        () => assignTicket(assignmentA, makeRequest(users[0]!), { ticketNumber: assignmentTicket.ticketNumber, assignedStaffId: users[0]!.id, role: users[0]!.role, expectedTicketVersion: assignmentTicket.workflowVersion }),
        () => assignTicket(assignmentB, makeRequest(users[1]!), { ticketNumber: assignmentTicket.ticketNumber, assignedStaffId: users[1]!.id, role: users[1]!.role, expectedTicketVersion: assignmentTicket.workflowVersion }),
      );
      expect(assignmentOutcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(assignmentOutcomes.filter(({ status }) => status === "rejected").map((result) => result.status === "rejected" && result.reason.code)).toEqual(["STALE_WRITE"]);

      const priorityTicket = await prisma.ticket.update({ where: { id: seed!.id }, data: { currentStatus: "OPEN", assignedStaffId: null, itPriority: "LOW", workflowVersion: 60 }, select: { id: true, ticketNumber: true, workflowVersion: true } });
      const [priorityA, priorityB] = synchronizeTransactions([first, second]);
      const priorityOutcomes = await race(
        () => updateTicketPriority(priorityA, makeRequest(users[0]!), { ticketNumber: priorityTicket.ticketNumber, itPriority: "HIGH", role: users[0]!.role, expectedTicketVersion: priorityTicket.workflowVersion }),
        () => updateTicketPriority(priorityB, makeRequest(users[1]!), { ticketNumber: priorityTicket.ticketNumber, itPriority: "URGENT", role: users[1]!.role, expectedTicketVersion: priorityTicket.workflowVersion }),
      );
      expect(priorityOutcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(priorityOutcomes.filter(({ status }) => status === "rejected").map((result) => result.status === "rejected" && result.reason.code)).toEqual(["STALE_WRITE"]);

      const statusTicket = await prisma.ticket.update({ where: { id: seed!.id }, data: { currentStatus: "OPEN", assignedStaffId: null, workflowVersion: 70, resolvedAt: null }, select: { id: true, ticketNumber: true, workflowVersion: true } });
      const beforeEvents = await prisma.ticketStatusEvent.count({ where: { ticketId: statusTicket.id } });
      const [statusA, statusB] = synchronizeTransactions([first, second]);
      const statusOutcomes = await race(
        () => updateTicketStatus(statusA, makeRequest(users[0]!), { ticketNumber: statusTicket.ticketNumber, currentStatus: "IN_PROGRESS", role: users[0]!.role, actorId: users[0]!.id, expectedTicketVersion: statusTicket.workflowVersion }),
        () => updateTicketStatus(statusB, makeRequest(users[1]!), { ticketNumber: statusTicket.ticketNumber, currentStatus: "WAITING_FOR_REQUESTER", role: users[1]!.role, actorId: users[1]!.id, expectedTicketVersion: statusTicket.workflowVersion }),
      );
      expect(statusOutcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(statusOutcomes.filter(({ status }) => status === "rejected").map((result) => result.status === "rejected" && result.reason.code)).toEqual(["STALE_WRITE"]);
      expect(await prisma.ticketStatusEvent.count({ where: { ticketId: statusTicket.id } })).toBe(beforeEvents + 1);

      const abaTicket = await prisma.ticket.update({ where: { id: seed!.id }, data: { currentStatus: "OPEN", assignedStaffId: null, workflowVersion: 80, resolvedAt: null }, select: { id: true, ticketNumber: true, workflowVersion: true } });
      await updateTicketStatus(prisma, makeRequest(users[0]!), { ticketNumber: abaTicket.ticketNumber, currentStatus: "WAITING_FOR_REQUESTER", role: users[0]!.role, actorId: users[0]!.id, expectedTicketVersion: abaTicket.workflowVersion });
      await updateTicketStatus(prisma, makeRequest(users[0]!), { ticketNumber: abaTicket.ticketNumber, currentStatus: "OPEN", role: users[0]!.role, actorId: users[0]!.id, expectedTicketVersion: abaTicket.workflowVersion + 1 });
      await expect(updateTicketStatus(prisma, makeRequest(users[0]!), { ticketNumber: abaTicket.ticketNumber, currentStatus: "IN_PROGRESS", role: users[0]!.role, actorId: users[0]!.id, expectedTicketVersion: abaTicket.workflowVersion })).rejects.toMatchObject({ status: 409, code: "STALE_WRITE" });
      const afterAba = await prisma.ticket.findUnique({ where: { id: abaTicket.id }, select: { currentStatus: true, workflowVersion: true } });
      expect(afterAba).toEqual({ currentStatus: "OPEN", workflowVersion: abaTicket.workflowVersion + 2 });
    } finally {
      await Promise.all([first.$disconnect(), second.$disconnect()]);
    }
  });

  it("T-RACE-04 permits only one concurrent upload to claim the fifth active attachment slot", async () => {
    const ticket = await prisma.ticket.findUnique({
      where: { clientRequestId: "lab4-seed-ticket-open" },
      select: { id: true, ticketNumber: true, requesterId: true },
    });
    expect(ticket).not.toBeNull();
    await prisma.attachment.deleteMany({ where: { ticketId: ticket!.id } });
    await prisma.attachment.createMany({ data: Array.from({ length: 4 }, (_, index) => ({
      ticketId: ticket!.id,
      originalName: `existing-${index}.png`,
      storageKey: `existing-${index}.png`,
      mimeType: "image/png",
      sizeBytes: 8,
      status: "ACTIVE" as const,
    })) });

    const storage = await mkdtemp(path.join(os.tmpdir(), "toktickit-lab4-race-"));
    const previousStorage = process.env.ATTACHMENT_STORAGE_DIR;
    process.env.ATTACHMENT_STORAGE_DIR = storage;
    const firstClient = new PrismaClient({ datasources: { db: { url } } });
    const secondClient = new PrismaClient({ datasources: { db: { url } } });
    let countArrivals = 0;
    let releaseCounts!: () => void;
    const countsReady = new Promise<void>((resolve) => { releaseCounts = resolve; });
    const synchronizeCount = (client: PrismaClient) => new Proxy(client, {
      get(target, property) {
        if (property === "attachment") {
          const attachment = Reflect.get(target, property, target) as Record<string, unknown>;
          return new Proxy(attachment, {
            get(model, method) {
              const value = Reflect.get(model, method, model);
              if (method !== "count" || typeof value !== "function") return value;
              return async (...args: unknown[]) => {
                const count = await (value as (...items: unknown[]) => Promise<number>).apply(model, args);
                countArrivals += 1;
                if (countArrivals === 2) releaseCounts();
                await countsReady;
                return count;
              };
            },
          });
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as PrismaClient;
    const makeApp = (client: PrismaClient) => {
      const app = express();
      app.use(express.json());
      registerAttachmentRoutes(app, () => client as never);
      return app;
    };
    const apps = [makeApp(synchronizeCount(firstClient)), makeApp(synchronizeCount(secondClient))];
    const png = Buffer.from("89504e470d0a1a0a", "hex");

    try {
      const responses = await Promise.all(apps.map((app, index) => request(app)
        .post(`/api/tickets/${encodeURIComponent(ticket!.ticketNumber)}/attachments`)
        .set("X-Development-Requester-Id", String(ticket!.requesterId))
        .attach("file", png, { filename: `race-${index}.png`, contentType: "image/png" })));
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(await prisma.attachment.count({ where: { ticketId: ticket!.id, status: "ACTIVE" } })).toBe(5);
      expect(await readdir(storage)).toHaveLength(1);
    } finally {
      await prisma.attachment.deleteMany({ where: { ticketId: ticket!.id } });
      if (previousStorage === undefined) delete process.env.ATTACHMENT_STORAGE_DIR;
      else process.env.ATTACHMENT_STORAGE_DIR = previousStorage;
      await rm(storage, { recursive: true, force: true });
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
    }
  });
});
