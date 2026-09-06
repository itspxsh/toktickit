import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerTicketRoutes } from "../../src/routes/tickets.js";

const ticketNumber = "TKT-2026-000042";
const requester = { id: 1, name: "Jennifer Anderson", isActive: true };
const category = { id: 2, name: "Hardware" };
const relatedSystem = { id: 7, name: "Corporate Laptop" };
const createdAt = new Date("2026-09-06T00:00:00.000Z");
const removedAt = new Date("2026-09-06T01:00:00.000Z");

const ownedTicket = {
  id: 42,
  ticketNumber,
  ticketDate: createdAt,
  requester,
  category,
  relatedSystem,
  summary: "Laptop battery drains quickly",
  requestedPriority: "HIGH",
  description: "The battery drains faster than usual during normal use.",
  itPriority: null,
  currentStatus: "NEW",
  createdAt,
  updatedAt: createdAt,
  attachments: [
    {
      id: 101,
      originalName: "battery.png",
      storageKey: "private/101-battery.png",
      mimeType: "image/png",
      sizeBytes: 18234,
      status: "ACTIVE",
      removedAt: null,
      removalReason: null,
      createdAt,
    },
    {
      id: 102,
      originalName: "old-log.pdf",
      storageKey: "private/102-old-log.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      status: "REMOVED",
      removedAt,
      removalReason: "Uploaded by mistake",
      createdAt: new Date("2026-09-06T00:30:00.000Z"),
    },
  ],
};

function createTestApp(overrides: { ticketFindFirst?: ReturnType<typeof vi.fn> } = {}) {
  const calls = {
    ticketFindFirst: vi.fn(async () => ownedTicket),
    ...overrides,
  };
  const testApp = express();
  testApp.use(express.json());
  registerTicketRoutes(testApp, () => ({
    requester: { findUnique: vi.fn() },
    category: { findUnique: vi.fn() },
    relatedSystem: { findUnique: vi.fn() },
    ticket: {
      findUnique: vi.fn(),
      findFirst: calls.ticketFindFirst,
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  }) as never);
  return { testApp, calls };
}

describe("GET /api/tickets/:ticketNumber", () => {
  it("API-08 / AC-12: returns owned read-only fields, references, and attachment metadata", async () => {
    const { testApp, calls } = createTestApp();

    const response = await request(testApp)
      .get(`/api/tickets/${ticketNumber}`)
      .set("X-Development-Requester-Id", "1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: 42,
        ticketNumber,
        ticketDate: createdAt.toISOString(),
        requester: { id: requester.id, name: requester.name },
        category,
        relatedSystem,
        summary: ownedTicket.summary,
        requestedPriority: "HIGH",
        description: ownedTicket.description,
        itPriority: null,
        currentStatus: "NEW",
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        attachments: [
          {
            id: 101,
            originalName: "battery.png",
            mimeType: "image/png",
            sizeBytes: 18234,
            status: "ACTIVE",
            removedAt: null,
            removalReason: null,
            createdAt: createdAt.toISOString(),
          },
          {
            id: 102,
            originalName: "old-log.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
            status: "REMOVED",
            removedAt: removedAt.toISOString(),
            removalReason: "Uploaded by mistake",
            createdAt: "2026-09-06T00:30:00.000Z",
          },
        ],
      },
    });
    expect(response.body.data.attachments[0]).not.toHaveProperty("storageKey");
    expect(calls.ticketFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        ticketNumber,
        requesterId: 1,
        requester: { isActive: true },
      },
      include: expect.objectContaining({
        attachments: expect.objectContaining({
          orderBy: [
            { status: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
          ],
        }),
      }),
    }));
  });

  it("API-09 / AC-13: returns the same safe 404 for missing and cross-requester tickets", async () => {
    const { testApp } = createTestApp({ ticketFindFirst: vi.fn(async () => null) });

    const missing = await request(testApp)
      .get(`/api/tickets/${ticketNumber}`)
      .set("X-Development-Requester-Id", "1");
    const crossRequester = await request(testApp)
      .get(`/api/tickets/${ticketNumber}`)
      .set("X-Development-Requester-Id", "2");

    expect(missing.status).toBe(404);
    expect(crossRequester.status).toBe(404);
    expect(missing.body).toEqual({
      error: { code: "TICKET_NOT_FOUND", message: "Ticket was not found." },
    });
    expect(crossRequester.body).toEqual(missing.body);
  });

  it("rejects malformed context or ticket numbers before querying", async () => {
    const { testApp, calls } = createTestApp();

    const missingContext = await request(testApp).get(`/api/tickets/${ticketNumber}`);
    const malformedContext = await request(testApp)
      .get(`/api/tickets/${ticketNumber}`)
      .set("X-Development-Requester-Id", "requester-a");
    const malformedTicket = await request(testApp)
      .get("/api/tickets/TKT-2026-42")
      .set("X-Development-Requester-Id", "1");

    expect(missingContext.status).toBe(400);
    expect(malformedContext.status).toBe(400);
    expect(malformedTicket.status).toBe(400);
    expect(calls.ticketFindFirst).not.toHaveBeenCalled();
  });

  it("returns a safe 500 envelope for unexpected database failures", async () => {
    const { testApp } = createTestApp({
      ticketFindFirst: vi.fn(async () => {
        throw new Error("database details must stay private");
      }),
    });

    const response = await request(testApp)
      .get(`/api/tickets/${ticketNumber}`)
      .set("X-Development-Requester-Id", "1");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unable to load Ticket." },
    });
    expect(JSON.stringify(response.body)).not.toContain("database details");
  });
});
