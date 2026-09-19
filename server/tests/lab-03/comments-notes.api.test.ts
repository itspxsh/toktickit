import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerRequesterWorkflowRoutes } from "../../src/routes/requester-workflow.js";
import { registerStaffTicketDetailRoutes } from "../../src/routes/staff-ticket-detail.js";

const ticket = { id: 4, ticketNumber: "TKT-2026-000004" };
const commentCreate = vi.fn(async ({ data }: any) => ({ id: 8, body: data.body, createdAt: new Date(), author: { id: data.authorUserId, name: "Requester", role: "REQUESTER" } }));

const requesterAuth: RequestHandler = (req, _res, next) => {
  (req as any).auth = { user: { id: 12, name: "Requester", email: "requester@example.test", role: "REQUESTER", isActive: true, mustChangePassword: false } };
  next();
};

function requesterApp(ticketRow: typeof ticket | null = ticket) {
  const ticketFindFirst = vi.fn(async () => ticketRow);
  const app = express();
  app.use(express.json());
  registerRequesterWorkflowRoutes(app, () => ({
    ticket: { findFirst: ticketFindFirst, update: vi.fn(), create: vi.fn() },
    requester: { findUnique: vi.fn() },
    publicComment: { create: commentCreate },
  }) as never, requesterAuth, (_req, _res, next) => next());
  return { app, ticketFindFirst };
}

describe("L3-06 comments and notes boundaries", () => {
  it("T-COMMENT-01 / AC-08 appends only to the authenticated requester's owned ticket", async () => {
    const own = requesterApp();
    const forged = await request(own.app).post(`/api/tickets/${ticket.ticketNumber}/comments`).send({ body: "Follow-up", authorUserId: 999 });
    expect(forged.status).toBe(400);
    const response = await request(own.app).post(`/api/tickets/${ticket.ticketNumber}/comments`).send({ body: "  Follow-up  " });
    expect(response.status).toBe(201);
    expect(response.body.comment.body).toBe("Follow-up");
    expect(commentCreate).toHaveBeenCalledWith(expect.objectContaining({ data: { ticketId: 4, authorUserId: 12, body: "Follow-up" } }));
    expect(own.ticketFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { ticketNumber: ticket.ticketNumber, requesterUserId: 12, requester: { isActive: true } } }));

    const foreign = requesterApp(null);
    const denied = await request(foreign.app).post(`/api/tickets/${ticket.ticketNumber}/comments`).send({ body: "Should not be visible" });
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("T-COMMENT-03 / AC-09 does not expose internal notes to a Requester", async () => {
    const app = express();
    app.use(express.json());
    const denyStaff: RequestHandler = (_req, res) => res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
    registerStaffTicketDetailRoutes(app, () => ({ ticket: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), }, user: { findFirst: vi.fn() }, publicComment: { create: vi.fn() }, internalNote: { create: vi.fn() } }) as never, denyStaff, (_req, _res, next) => next());
    const response = await request(app).post(`/api/staff/tickets/${ticket.ticketNumber}/internal-notes`).send({ body: "private" });
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain("private");
  });

  it("T-COMMENT-05 / AC-08..09 has no update or delete comment/note endpoints", async () => {
    const own = requesterApp();
    expect((await request(own.app).patch(`/api/tickets/${ticket.ticketNumber}/comments/8`).send({ body: "edit" })).status).toBe(404);
    expect((await request(own.app).delete(`/api/tickets/${ticket.ticketNumber}/comments/8`)).status).toBe(404);
  });
});
