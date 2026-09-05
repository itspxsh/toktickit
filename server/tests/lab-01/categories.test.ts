import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
void request; void app;

// Issue 4 — write this test yourself, using health.test.ts as the pattern.
// Requires the DB to be migrated and seeded first.
// Lab 2's API contract supersedes the original Lab 1 id ordering: active
// reference data is returned by name ASC.
describe("GET /api/categories", () => {
  it("returns the four seeded categories in name order", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 4, name: "Network" },
      { id: 3, name: "Software" },
    ]);
  });
});
