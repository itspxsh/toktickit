import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerTicketRoutes } from "../../src/routes/tickets.js";
import { registerStaffTicketDetailRoutes } from "../../src/routes/staff-ticket-detail.js";

const requester = { id: 1, name: "Regression Requester", isActive: true };
const category = { id: 2, name: "Hardware", isActive: true };
const relatedSystem = { id: 7, name: "Corporate Laptop", isActive: true };
const ticketKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const adminAuth: RequestHandler = (req, _res, next) => {
  (req as any).auth = {
    user: { id: 42, name: "Active Administrator", email: "admin@example.test", role: "ADMIN", isActive: true, mustChangePassword: false },
    session: { id: 5, userId: 42, tokenHash: "redacted-hash", expiresAt: new Date(Date.now() + 60_000), invalidatedAt: null },
    tokenHash: "redacted-hash",
  };
  next();
};

describe("T-REG-01 / AC-02, AC-13, AC-17, AC-18: inherited Lab 1–3 regressions", () => {
  it("copies requester priority into the new Ticket IT priority and persists both", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 10,
      ticketNumber: data.ticketNumber,
      ticketDate: new Date("2026-10-08T00:00:00.000Z"),
      requester,
      category,
      relatedSystem,
      summary: data.summary,
      requestedPriority: data.requestedPriority,
      description: data.description,
      itPriority: data.itPriority,
      currentStatus: data.currentStatus,
      createdAt: new Date("2026-10-08T00:00:00.000Z"),
      updatedAt: new Date("2026-10-08T00:00:00.000Z"),
    }));
    const app = express();
    app.use(express.json());
    registerTicketRoutes(app, () => ({
      requester: { findUnique: vi.fn(async () => requester) },
      category: { findUnique: vi.fn(async () => category) },
      relatedSystem: { findUnique: vi.fn(async () => relatedSystem) },
      ticket: { findUnique: vi.fn(async () => null), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create },
      $queryRaw: vi.fn(async () => [{ sequence: 101n }]),
    }) as never);

    const response = await request(app)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", ticketKey)
      .send({
        categoryId: 2,
        relatedSystemId: 7,
        summary: "New laptop request",
        requestedPriority: "URGENT",
        description: "The laptop is needed for an urgent customer issue.",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ requestedPriority: "URGENT", itPriority: "URGENT" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ requestedPriority: "URGENT", itPriority: "URGENT" }),
    }));
  });

  it("allows an active Admin to own a Ticket while still scoping the write to the Ticket", async () => {
    const ticket = { id: 77, ticketNumber: "TKT-2026-000077", currentStatus: "OPEN", itPriority: "MEDIUM" };
    const findFirst = vi.fn(async () => ticket);
    const findAdmin = vi.fn(async () => ({ id: 42, name: "Active Administrator", role: "ADMIN", isActive: true }));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const app = express();
    app.use(express.json());
    registerStaffTicketDetailRoutes(app, () => ({
      ticket: { findFirst, findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany },
      user: { findFirst: findAdmin },
      publicComment: { create: vi.fn() },
      internalNote: { create: vi.fn() },
    }) as never, adminAuth, ((_req, _res, next) => next()) as RequestHandler);

    const claimed = await request(app)
      .post("/api/staff/tickets/TKT-2026-000077/claim")
      .send({});
    expect(claimed.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: ticket.id, assignedStaffId: null },
      data: { assignedStaffId: 42 },
    });

    const response = await request(app)
      .patch("/api/staff/tickets/TKT-2026-000077/assignment")
      .send({ assignedStaffId: 42 });

    expect(response.status).toBe(200);
    expect(findAdmin).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42, role: { in: ["IT_STAFF", "ADMIN"] }, isActive: true },
    }));
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticketNumber: "TKT-2026-000077", requester: { isActive: true } },
    }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ticket.id },
      data: { assignedStaffId: 42 },
    }));
  });
});
