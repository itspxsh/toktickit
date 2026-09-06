import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerTicketRoutes } from "../../src/routes/tickets.js";

const requester = { id: 1, name: "Jennifer Anderson", isActive: true };
const category = { id: 2, name: "Hardware" };
const relatedSystem = { id: 7, name: "Corporate Laptop" };
const ticketDate = new Date("2026-09-06T00:00:00.000Z");

const rows = [
  {
    id: 2,
    ticketNumber: "TKT-2026-000002",
    ticketDate,
    summary: "Laptop battery drains quickly",
    requestedPriority: "HIGH",
    currentStatus: "NEW",
    createdAt: ticketDate,
    updatedAt: ticketDate,
    category,
    relatedSystem,
  },
];

function createTestApp(overrides: Record<string, unknown> = {}) {
  const calls = {
    requesterFindUnique: vi.fn(async () => requester),
    ticketFindMany: vi.fn(async () => rows),
    ticketCount: vi.fn(async () => rows.length),
  };
  Object.assign(calls, overrides);

  const testApp = express();
  registerTicketRoutes(testApp, () => ({
    requester: { findUnique: calls.requesterFindUnique },
    category: { findUnique: vi.fn() },
    relatedSystem: { findUnique: vi.fn() },
    ticket: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: calls.ticketFindMany,
      count: calls.ticketCount,
    },
    $queryRaw: vi.fn(),
  }) as never);
  return { testApp, calls };
}

describe("GET /api/tickets", () => {
  it("API-06 / AC-09: scopes results to the requester header and ignores query ownership spoofing", async () => {
    const { testApp, calls } = createTestApp();

    const response = await request(testApp)
      .get("/api/tickets?requesterId=999")
      .set("X-Development-Requester-Id", "1");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        id: 2,
        ticketNumber: "TKT-2026-000002",
        ticketDate: ticketDate.toISOString(),
        summary: "Laptop battery drains quickly",
        requestedPriority: "HIGH",
        currentStatus: "NEW",
        createdAt: ticketDate.toISOString(),
        updatedAt: ticketDate.toISOString(),
        category,
        relatedSystem,
      },
    ]);
    expect(calls.requesterFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { id: true, isActive: true },
    });
    expect(calls.ticketFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { requesterId: 1, currentStatus: "NEW" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 10,
    }));
    const firstCall = (calls.ticketFindMany.mock.calls as unknown as Array<Array<Record<string, any>>>)[0];
    expect(firstCall[0].where).not.toHaveProperty("requesterId", 999);
  });

  it("UNIT-05 / API-07 / AC-10: parses filters, search, stable sort, and pagination", async () => {
    const { testApp, calls } = createTestApp({ ticketCount: vi.fn(async () => 41) });

    const response = await request(testApp)
      .get("/api/tickets?search=%20Laptop%20&categoryId=2&relatedSystemId=7&requestedPriority=HIGH&status=NEW&sortBy=createdAt&sortOrder=asc&page=2&pageSize=20")
      .set("X-Development-Requester-Id", "1");

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      page: 2,
      pageSize: 20,
      totalItems: 41,
      totalPages: 3,
    });
    expect(calls.ticketFindMany).toHaveBeenCalledWith({
      where: {
        requesterId: 1,
        categoryId: 2,
        relatedSystemId: 7,
        requestedPriority: "HIGH",
        currentStatus: "NEW",
        OR: [
          { ticketNumber: { contains: "Laptop", mode: "insensitive" } },
          { summary: { contains: "Laptop", mode: "insensitive" } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: 20,
      take: 20,
      select: expect.any(Object),
    });
    expect(calls.ticketCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ requesterId: 1, categoryId: 2, relatedSystemId: 7 }),
    });
  });

  it("API-07 / AC-10: returns an empty page with valid metadata when page is out of range", async () => {
    const { testApp, calls } = createTestApp({
      ticketFindMany: vi.fn(async () => []),
      ticketCount: vi.fn(async () => 1),
    });

    const response = await request(testApp)
      .get("/api/tickets?page=3&pageSize=10")
      .set("X-Development-Requester-Id", "1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      pagination: { page: 3, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    const firstCall = (calls.ticketFindMany.mock.calls as unknown as Array<Array<Record<string, any>>>)[0];
    expect(firstCall[0]).toEqual(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it("UNIT-05 / AC-10: rejects invalid query values with a safe 400 without querying Tickets", async () => {
    const { testApp, calls } = createTestApp();

    const response = await request(testApp)
      .get("/api/tickets?page=0&pageSize=15&sortBy=priority&sortOrder=sideways&status=DONE&requestedPriority=CRITICAL&categoryId=1.5&search=" + "x".repeat(101))
      .set("X-Development-Requester-Id", "1");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: "INVALID_QUERY" },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/SELECT|database|stack/i);
    expect(calls.ticketFindMany).not.toHaveBeenCalled();
    expect(calls.ticketCount).not.toHaveBeenCalled();
  });

  it("returns documented errors for missing and inactive requesters", async () => {
    const missing = createTestApp({ requesterFindUnique: vi.fn(async () => null) });
    const missingResponse = await request(missing.testApp)
      .get("/api/tickets")
      .set("X-Development-Requester-Id", "1");
    expect(missingResponse.status).toBe(404);

    const inactive = createTestApp({ requesterFindUnique: vi.fn(async () => ({ ...requester, isActive: false })) });
    const inactiveResponse = await request(inactive.testApp)
      .get("/api/tickets")
      .set("X-Development-Requester-Id", "1");
    expect(inactiveResponse.status).toBe(403);
  });

  it("returns a safe 500 envelope when the Ticket query fails", async () => {
    const failed = createTestApp({
      ticketFindMany: vi.fn(async () => {
        throw new Error("SELECT * FROM Ticket; /private/database/path");
      }),
    });

    const response = await request(failed.testApp)
      .get("/api/tickets")
      .set("X-Development-Requester-Id", "1");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unable to load Tickets." },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/SELECT|database|private|stack/i);
  });
});
