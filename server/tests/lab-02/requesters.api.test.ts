import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerRequesterRoutes } from "../../src/routes/requesters.js";

type RequesterRow = { id: number; name: string; email: string };

function createTestApp(findMany: (args: unknown) => Promise<RequesterRow[]>) {
  const testApp = express();
  registerRequesterRoutes(testApp, () => ({ requester: { findMany } }) as never);
  return testApp;
}

describe("GET /api/requesters", () => {
  it("returns only active requesters ordered by name without requiring the test header", async () => {
    let query: unknown;
    const testApp = createTestApp(async (args) => {
      query = args;
      return [
        { id: 2, name: "Michael Chen", email: "michael@example.test" },
        { id: 1, name: "Jennifer Anderson", email: "jennifer@example.test" },
      ];
    });

    const response = await request(testApp).get("/api/requesters");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 2, name: "Michael Chen", email: "michael@example.test" },
      { id: 1, name: "Jennifer Anderson", email: "jennifer@example.test" },
    ]);
    expect(query).toEqual({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  });

  it("returns an empty list when no active requesters exist", async () => {
    const testApp = createTestApp(async () => []);

    const response = await request(testApp).get("/api/requesters");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns a safe error envelope when the database fails", async () => {
    const testApp = createTestApp(async () => {
      throw new Error("SELECT * FROM Requester; /private/database/path");
    });

    const response = await request(testApp).get("/api/requesters");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to load Development Requesters.",
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/SELECT|database|private|stack/i);
  });
});
