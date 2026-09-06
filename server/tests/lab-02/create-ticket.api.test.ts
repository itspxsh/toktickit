import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerTicketRoutes } from "../../src/routes/tickets.js";

const requester = { id: 1, name: "Jennifer Anderson", isActive: true };
const category = { id: 2, name: "Hardware", isActive: true };
const relatedSystem = { id: 7, name: "Corporate Laptop", isActive: true };
const key = "11111111-1111-4111-8111-111111111111";
const validBody = {
  categoryId: 2,
  relatedSystemId: 7,
  summary: "  Laptop battery drains quickly  ",
  requestedPriority: "MEDIUM",
  description: "  The battery drains faster than usual during normal use.  ",
};

function createTestApp(overrides: Record<string, unknown> = {}) {
  const calls = {
    requesterFindUnique: vi.fn(async () => requester),
    categoryFindUnique: vi.fn(async () => category),
    relatedSystemFindUnique: vi.fn(async () => relatedSystem),
    ticketFindUnique: vi.fn(async () => null),
    ticketCreate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 1,
      ticketNumber: data.ticketNumber,
      ticketDate: new Date("2026-09-06T00:00:00.000Z"),
      requester,
      category,
      relatedSystem,
      summary: data.summary,
      requestedPriority: data.requestedPriority,
      description: data.description,
      itPriority: null,
      currentStatus: "NEW",
      createdAt: new Date("2026-09-06T00:00:00.000Z"),
      updatedAt: new Date("2026-09-06T00:00:00.000Z"),
    })),
    queryRaw: vi.fn(async () => [{ sequence: 42n }]),
  };
  Object.assign(calls, overrides);
  const testApp = express();
  testApp.use(express.json());
  registerTicketRoutes(testApp, () => ({
    requester: { findUnique: calls.requesterFindUnique },
    category: { findUnique: calls.categoryFindUnique },
    relatedSystem: { findUnique: calls.relatedSystemFindUnique },
    ticket: {
      findUnique: calls.ticketFindUnique,
      create: calls.ticketCreate,
    },
    $queryRaw: calls.queryRaw,
  }) as never);
  return { testApp, calls };
}

describe("POST /api/tickets", () => {
  it("API-03 / AC-05: saves one NEW ticket with trimmed fields and official number", async () => {
    const { testApp, calls } = createTestApp();

    const response = await request(testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", key)
      .send(validBody);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      data: {
        id: 1,
        ticketNumber: "TKT-2026-000042",
        requester: { id: 1, name: requester.name },
        category: { id: 2, name: category.name },
        relatedSystem: { id: 7, name: relatedSystem.name },
        summary: "Laptop battery drains quickly",
        description: "The battery drains faster than usual during normal use.",
        requestedPriority: "MEDIUM",
        currentStatus: "NEW",
        itPriority: null,
      },
      replayed: false,
    });
    expect(calls.ticketCreate).toHaveBeenCalledOnce();
    expect(calls.ticketCreate.mock.calls[0][0]).toMatchObject({
      data: {
        requesterId: 1,
        categoryId: 2,
        relatedSystemId: 7,
        summary: "Laptop battery drains quickly",
        description: "The battery drains faster than usual during normal use.",
        requestedPriority: "MEDIUM",
        currentStatus: "NEW",
        clientRequestId: key,
        ticketNumber: "TKT-2026-000042",
        ticketSequence: 42n,
      },
    });
  });

  it("UNIT-03 / API-04 / AC-06: returns field errors and does not create invalid data", async () => {
    const invalid = createTestApp();

    const response = await request(invalid.testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", key)
      .send({
        ...validBody,
        summary: " x ",
        description: "short",
        requestedPriority: "CRITICAL",
      });

    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(response.body.error.fieldErrors).toEqual(
      expect.objectContaining({
        summary: expect.any(String),
        description: expect.any(String),
        requestedPriority: expect.any(String),
      }),
    );
    expect(invalid.calls.ticketCreate).not.toHaveBeenCalled();

    const inactive = createTestApp({
      categoryFindUnique: vi.fn(async () => ({ ...category, isActive: false })),
    });
    const referenceResponse = await request(inactive.testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", key)
      .send(validBody);
    expect(referenceResponse.status).toBe(422);
    expect(referenceResponse.body.error.fieldErrors).toEqual({
      categoryId: "Category must exist and be active.",
    });
    expect(inactive.calls.ticketCreate).not.toHaveBeenCalled();
  });

  it("UNIT-03: accepts the documented inclusive boundaries and rejects generated fields", async () => {
    const boundaryBody = {
      categoryId: 2,
      relatedSystemId: 7,
      summary: "s".repeat(5),
      requestedPriority: "LOW",
      description: "d".repeat(10),
    };
    const boundary = createTestApp();
    const accepted = await request(boundary.testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", key)
      .send(boundaryBody);
    expect(accepted.status).toBe(201);

    const generated = createTestApp();
    const rejected = await request(generated.testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", key)
      .send({ ...boundaryBody, ticketNumber: "TKT-2026-000001", ticketSequence: 1 });
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.fieldErrors).toEqual(expect.objectContaining({
      ticketNumber: expect.any(String),
      ticketSequence: expect.any(String),
    }));
    expect(generated.calls.ticketCreate).not.toHaveBeenCalled();
  });

  it("API-05 / UNIT-04 / AC-07: replays the same key and conflicts on a changed payload", async () => {
    const existing = {
      id: 9,
      ticketNumber: "TKT-2026-000009",
      ticketDate: new Date("2026-09-06T00:00:00.000Z"),
      requester,
      requesterId: 1,
      category,
      categoryId: 2,
      relatedSystem,
      relatedSystemId: 7,
      summary: "Laptop battery drains quickly",
      requestedPriority: "MEDIUM",
      description: "The battery drains faster than usual during normal use.",
      itPriority: null,
      currentStatus: "NEW",
      createdAt: new Date("2026-09-06T00:00:00.000Z"),
      updatedAt: new Date("2026-09-06T00:00:00.000Z"),
    };
    const findUnique = vi.fn(async () => existing);
    const { testApp, calls } = createTestApp({ ticketFindUnique: findUnique });

    const replay = await request(testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", key)
      .send(validBody);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ data: { id: 9, ticketNumber: existing.ticketNumber }, replayed: true });
    expect(calls.ticketCreate).not.toHaveBeenCalled();

    const conflict = await request(testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", key)
      .send({ ...validBody, summary: "A different request" });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({
      error: { code: "IDEMPOTENCY_CONFLICT", message: "Idempotency-Key was already used with different data." },
    });
  });

  it("returns documented context and key errors without touching the database", async () => {
    const { testApp, calls } = createTestApp();
    const missingContext = await request(testApp)
      .post("/api/tickets")
      .set("Idempotency-Key", key)
      .send(validBody);
    expect(missingContext.status).toBe(400);

    const malformedKey = await request(testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", "not-a-uuid")
      .send(validBody);
    expect(malformedKey.status).toBe(400);
    expect(calls.requesterFindUnique).not.toHaveBeenCalled();
  });

  it("distinguishes missing and inactive requesters", async () => {
    const missing = createTestApp({ requesterFindUnique: vi.fn(async () => null) });
    const missingResponse = await request(missing.testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", key)
      .send(validBody);
    expect(missingResponse.status).toBe(404);

    const inactive = createTestApp({ requesterFindUnique: vi.fn(async () => ({ ...requester, isActive: false })) });
    const inactiveResponse = await request(inactive.testApp)
      .post("/api/tickets")
      .set("X-Development-Requester-Id", "1")
      .set("Idempotency-Key", key)
      .send(validBody);
    expect(inactiveResponse.status).toBe(403);
  });
});
