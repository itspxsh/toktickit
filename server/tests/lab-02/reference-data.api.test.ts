import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerReferenceDataRoutes } from "../../src/routes/reference-data.js";

function createTestApp(overrides: Record<string, unknown> = {}) {
  const calls = {
    categoryFindMany: vi.fn(async () => [
      { id: 1, name: "Account and Access" },
      { id: 4, name: "Network" },
    ]),
    relatedSystemFindMany: vi.fn(async () => [{ id: 7, name: "Corporate Laptop" }]),
  };
  Object.assign(calls, overrides);
  const testApp = express();
  registerReferenceDataRoutes(testApp, () => ({
    category: { findMany: calls.categoryFindMany },
    relatedSystem: { findMany: calls.relatedSystemFindMany },
  }));
  return { testApp, calls };
}

describe("Lab 2 active reference data", () => {
  it("API-14: returns active categories ordered by name", async () => {
    const { testApp, calls } = createTestApp();
    const response = await request(testApp).get("/api/categories");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 1, name: "Account and Access" },
      { id: 4, name: "Network" },
    ]);
    expect(calls.categoryFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  it("API-14: returns active related systems ordered by name", async () => {
    const { testApp, calls } = createTestApp();
    const response = await request(testApp).get("/api/related-systems");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 7, name: "Corporate Laptop" }]);
    expect(calls.relatedSystemFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  it("uses the standard safe envelope when reference data cannot load", async () => {
    const { testApp } = createTestApp({
      categoryFindMany: vi.fn(async () => { throw new Error("SQL /private/path"); }),
    });
    const response = await request(testApp).get("/api/categories");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unable to load Categories." },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/SQL|private|stack/i);
  });
});
