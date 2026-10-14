import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerStaffTicketDetailRoutes } from "../../src/routes/staff-ticket-detail.js";

const db = vi.hoisted(() => ({
  ticket: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  user: { findFirst: vi.fn() },
  actionTaken: { findMany: vi.fn() },
  ticketStatusEvent: { create: vi.fn(), findMany: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));

const ticket = {
  id: 51,
  ticketNumber: "TKT-2026-000051",
  workflowVersion: 3,
  currentStatus: "OPEN",
  assignedStaffId: null,
  resolvedAt: null,
  itPriority: "LOW",
};
const actor = { id: 41, name: "Support Agent", email: "agent@example.test", role: "IT_STAFF", isActive: true, mustChangePassword: false };

function createTestApp(role = "IT_STAFF") {
  const app = express();
  app.use(express.json());
  const auth = (req: Request, _res: Response, next: NextFunction) => {
    req.auth = { user: { ...actor, role } } as never;
    next();
  };
  const csrf = (_req: Request, _res: Response, next: NextFunction) => next();
  registerStaffTicketDetailRoutes(app, () => db as never, auth, csrf);
  return app;
}

describe("L4-06 Ticket workflow API (T-WF-01..04)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.update.mockResolvedValue({ itPriority: "HIGH" });
    db.ticket.updateMany.mockResolvedValue({ count: 1 });
    db.user.findFirst.mockResolvedValue({ id: 77, name: "Second Support Agent" });
    db.actionTaken.findMany.mockResolvedValue([{ state: "COMPLETED", result: "Verified service recovery", followUpRequired: false }]);
    db.ticketStatusEvent.create.mockResolvedValue({ id: 9 });
    db.ticketStatusEvent.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValue([{ id: ticket.id }]);
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  });

  it("rejects unversioned workflow writes and unknown fields before mutation", async () => {
    const app = createTestApp();
    const missingVersion = await request(app).patch(`/api/staff/tickets/${ticket.ticketNumber}/priority`).send({ itPriority: "HIGH" });
    const unknown = await request(app).patch(`/api/staff/tickets/${ticket.ticketNumber}/assignment`).send({ expectedTicketVersion: 3, assignedStaffId: 77, assignedById: 2 });
    expect(missingVersion.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(db.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("T-WF-03 claims atomically from the authenticated actor and increments workflowVersion", async () => {
    const app = createTestApp();
    db.user.findFirst.mockResolvedValue({ id: actor.id, name: actor.name });
    const response = await request(app).post(`/api/staff/tickets/${ticket.ticketNumber}/claim`).send({ expectedTicketVersion: 3 });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ assignedStaff: { id: 41 }, ticketVersion: 4 });
    expect(db.ticket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ticket.id, workflowVersion: 3, assignedStaffId: null },
      data: { assignedStaffId: actor.id, workflowVersion: { increment: 1 } },
    }));
  });

  it("T-WF-01 enforces the Admin-only cancelled reopen transition", async () => {
    db.ticket.findFirst.mockResolvedValue({ ...ticket, currentStatus: "CANCELLED" });
    const response = await request(createTestApp("IT_STAFF"))
      .patch(`/api/staff/tickets/${ticket.ticketNumber}/status`)
      .send({ expectedTicketVersion: 3, currentStatus: "REOPENED" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(db.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("T-WF-02 requires the Action resolution gate and explicit resolve confirmation", async () => {
    const app = createTestApp();
    db.actionTaken.findMany.mockResolvedValue([]);
    const blocked = await request(app).patch(`/api/staff/tickets/${ticket.ticketNumber}/status`)
      .send({ expectedTicketVersion: 3, currentStatus: "RESOLVED", confirm: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("RESOLUTION_REQUIREMENTS_NOT_MET");
    expect(db.ticket.updateMany).not.toHaveBeenCalled();

    db.actionTaken.findMany.mockResolvedValue([{ state: "COMPLETED", result: "Verified service recovery", followUpRequired: false }]);
    const noConfirm = await request(app).patch(`/api/staff/tickets/${ticket.ticketNumber}/status`)
      .send({ expectedTicketVersion: 3, currentStatus: "RESOLVED" });
    expect(noConfirm.status).toBe(409);
    expect(noConfirm.body.error.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("T-WF-04 records only effective transitions and updates resolvedAt", async () => {
    const app = createTestApp();
    const response = await request(app).patch(`/api/staff/tickets/${ticket.ticketNumber}/status`)
      .send({ expectedTicketVersion: 3, currentStatus: "RESOLVED", confirm: true });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ currentStatus: "RESOLVED", ticketVersion: 4, noOp: false });
    expect(db.ticketStatusEvent.create).toHaveBeenCalledWith({ data: { ticketId: ticket.id, fromStatus: "OPEN", toStatus: "RESOLVED", actorId: actor.id } });
    expect(db.ticket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentStatus: "RESOLVED", workflowVersion: { increment: 1 }, resolvedAt: expect.any(Date) }) }));
  });

  it("retains a resolved timestamp on close, clears it on reopen, and never emits an event for a no-op", async () => {
    const app = createTestApp("ADMIN");
    const resolvedAt = new Date("2026-10-01T12:00:00Z");
    db.ticket.findFirst.mockResolvedValue({ ...ticket, currentStatus: "RESOLVED", resolvedAt });
    const noOp = await request(app).patch(`/api/staff/tickets/${ticket.ticketNumber}/status`)
      .send({ expectedTicketVersion: 3, currentStatus: "RESOLVED" });
    expect(noOp.status).toBe(200);
    expect(noOp.body.noOp).toBe(true);
    expect(db.ticket.updateMany).not.toHaveBeenCalled();
    expect(db.ticketStatusEvent.create).not.toHaveBeenCalled();

    const close = await request(app).patch(`/api/staff/tickets/${ticket.ticketNumber}/status`)
      .send({ expectedTicketVersion: 3, currentStatus: "CLOSED", confirm: true });
    expect(close.status).toBe(200);
    const closeWrite = db.ticket.updateMany.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(closeWrite.data).not.toHaveProperty("resolvedAt");

    vi.clearAllMocks();
    const reopen = await request(app).patch(`/api/staff/tickets/${ticket.ticketNumber}/status`)
      .send({ expectedTicketVersion: 3, currentStatus: "REOPENED" });
    expect(reopen.status).toBe(200);
    expect(db.ticket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentStatus: "REOPENED", resolvedAt: null }) }));
    expect(db.ticketStatusEvent.create).toHaveBeenCalledWith({ data: { ticketId: ticket.id, fromStatus: "RESOLVED", toStatus: "REOPENED", actorId: actor.id } });
  });
});
