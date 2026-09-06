import express from "express";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ATTACHMENT_SIZE,
  validateAttachment,
} from "../../src/attachments.js";
import { registerAttachmentRoutes } from "../../src/routes/attachments.js";

const ticketNumber = "TKT-2026-000042";
const requesterId = 1;
const createdAt = new Date("2026-09-06T00:00:00.000Z");
const removedAt = new Date("2026-09-06T01:00:00.000Z");

const png = Buffer.from("89504e470d0a1a0a", "hex");
const pdf = Buffer.from("%PDF-1.7\n", "ascii");

let storageDir = "";

function createTestApp(overrides: Record<string, unknown> = {}) {
  const calls = {
    ticketFindFirst: vi.fn(async () => ({ id: 42 })),
    attachmentCount: vi.fn(async () => 0),
    attachmentFindMany: vi.fn(async () => []),
    attachmentFindFirst: vi.fn(async () => null),
    attachmentCreate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 101,
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      status: "ACTIVE",
      removedAt: null,
      removalReason: null,
      createdAt,
    })),
    attachmentUpdate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 101,
      originalName: "battery.png",
      mimeType: "image/png",
      sizeBytes: png.length,
      status: "REMOVED",
      removedAt: data.removedAt,
      removalReason: data.removalReason,
      createdAt,
    })),
  };
  Object.assign(calls, overrides);

  const app = express();
  app.use(express.json());
  registerAttachmentRoutes(app, () => ({
    ticket: { findFirst: calls.ticketFindFirst },
    attachment: {
      count: calls.attachmentCount,
      findMany: calls.attachmentFindMany,
      findFirst: calls.attachmentFindFirst,
      create: calls.attachmentCreate,
      update: calls.attachmentUpdate,
    },
  }) as never);
  return { app, calls };
}

beforeEach(async () => {
  storageDir = await mkdtemp(path.join(os.tmpdir(), "toktickit-attachments-"));
  process.env.ATTACHMENT_STORAGE_DIR = storageDir;
});

afterEach(async () => {
  delete process.env.ATTACHMENT_STORAGE_DIR;
  await rm(storageDir, { recursive: true, force: true });
});

describe("Attachment validation", () => {
  it("UNIT-06 / AC-14-15: accepts matching signatures and rejects unsafe metadata", () => {
    expect(validateAttachment({
      originalname: "evidence.PNG",
      mimetype: "image/png",
      size: png.length,
      buffer: png,
    })).toEqual({ extension: ".png", mimeType: "image/png" });

    expect(validateAttachment({
      originalname: "evidence.pdf",
      mimetype: "application/pdf",
      size: pdf.length,
      buffer: pdf,
    })).toEqual({ extension: ".pdf", mimeType: "application/pdf" });

    expect(validateAttachment({
      originalname: "evidence.exe",
      mimetype: "application/octet-stream",
      size: 4,
      buffer: Buffer.from("MZ"),
    })).toMatchObject({ status: 415 });
    expect(validateAttachment({
      originalname: "evidence.png",
      mimetype: "image/png",
      size: png.length,
      buffer: Buffer.from("not-a-png"),
    })).toMatchObject({ status: 415 });
    expect(validateAttachment({
      originalname: "\u0000.png",
      mimetype: "image/png",
      size: png.length,
      buffer: png,
    })).toMatchObject({ status: 422 });
  });
});

describe("Attachment routes", () => {
  it("API-10 / AC-14: uploads one owned permitted file with private UUID storage", async () => {
    const { app, calls } = createTestApp();
    const response = await request(app)
      .post(`/api/tickets/${ticketNumber}/attachments`)
      .set("X-Development-Requester-Id", String(requesterId))
      .attach("file", png, { filename: "../battery.png", contentType: "image/png" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: 101,
        originalName: "battery.png",
        mimeType: "image/png",
        sizeBytes: png.length,
        status: "ACTIVE",
        removedAt: null,
        removalReason: null,
        createdAt: createdAt.toISOString(),
      },
    });
    expect(calls.ticketFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticketNumber, requesterId, requester: { isActive: true } },
    }));
    expect(calls.attachmentCreate.mock.calls[0][0]).toMatchObject({
      data: {
        ticketId: 42,
        originalName: "battery.png",
        mimeType: "image/png",
        sizeBytes: png.length,
        status: "ACTIVE",
      },
    });
    const files = await readdir(storageDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  it("API-11 / AC-15: rejects invalid files and active-count overflow without rows", async () => {
    const invalid = createTestApp();
    const invalidResponse = await request(invalid.app)
      .post(`/api/tickets/${ticketNumber}/attachments`)
      .set("X-Development-Requester-Id", String(requesterId))
      .attach("file", Buffer.from("not-png"), { filename: "evidence.png", contentType: "image/png" });
    expect(invalidResponse.status).toBe(415);
    expect(invalid.calls.attachmentCreate).not.toHaveBeenCalled();

    const tooLarge = createTestApp();
    const tooLargeResponse = await request(tooLarge.app)
      .post(`/api/tickets/${ticketNumber}/attachments`)
      .set("X-Development-Requester-Id", String(requesterId))
      .attach("file", Buffer.alloc(MAX_ATTACHMENT_SIZE + 1, 0), { filename: "large.pdf", contentType: "application/pdf" });
    expect(tooLargeResponse.status).toBe(413);
    expect(tooLarge.calls.attachmentCreate).not.toHaveBeenCalled();

    const full = createTestApp({ attachmentCount: vi.fn(async () => 5) });
    const fullResponse = await request(full.app)
      .post(`/api/tickets/${ticketNumber}/attachments`)
      .set("X-Development-Requester-Id", String(requesterId))
      .attach("file", png, { filename: "evidence.png", contentType: "image/png" });
    expect(fullResponse.status).toBe(409);
    expect(full.calls.attachmentCreate).not.toHaveBeenCalled();
  });

  it("API-12 / AC-16: lists metadata, streams active content, and soft-removes with a reason", async () => {
    const active = {
      id: 101,
      originalName: "battery.png",
      storageKey: "active.png",
      mimeType: "image/png",
      sizeBytes: png.length,
      status: "ACTIVE",
      removedAt: null,
      removalReason: null,
      createdAt,
    };
    const removed = {
      id: 102,
      originalName: "old.pdf",
      storageKey: "removed.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdf.length,
      status: "REMOVED",
      removedAt,
      removalReason: "Wrong evidence",
      createdAt,
    };
    const list = createTestApp({
      attachmentFindMany: vi.fn(async () => [active, removed]),
      attachmentFindFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => (
        where.id === 102 ? removed : active
      )),
    });
    await writeFile(path.join(storageDir, active.storageKey), png);

    const listed = await request(list.app)
      .get(`/api/tickets/${ticketNumber}/attachments`)
      .set("X-Development-Requester-Id", String(requesterId));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([
      expect.objectContaining({ id: 101, originalName: "battery.png", status: "ACTIVE" }),
      expect.objectContaining({ id: 102, originalName: "old.pdf", status: "REMOVED", removalReason: "Wrong evidence" }),
    ]);
    expect(listed.body.data[0]).not.toHaveProperty("storageKey");

    const metadata = await request(list.app)
      .get(`/api/tickets/${ticketNumber}/attachments/101`)
      .set("X-Development-Requester-Id", String(requesterId));
    expect(metadata.status).toBe(200);
    expect(metadata.body.data).not.toHaveProperty("storageKey");

    const download = await request(list.app)
      .get(`/api/tickets/${ticketNumber}/attachments/101/download`)
      .set("X-Development-Requester-Id", String(requesterId));
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toMatch(/^image\/png/);
    expect(download.headers["content-disposition"]).toContain("battery.png");
    expect(download.body).toEqual(png);

    const blocked = await request(list.app)
      .get(`/api/tickets/${ticketNumber}/attachments/102/download`)
      .set("X-Development-Requester-Id", String(requesterId));
    expect(blocked.status).toBe(404);

    const removedResponse = await request(list.app)
      .delete(`/api/tickets/${ticketNumber}/attachments/101`)
      .set("X-Development-Requester-Id", String(requesterId))
      .send({ reason: "Uploaded the wrong screenshot." });
    expect(removedResponse.status).toBe(200);
    expect(list.calls.attachmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 101 },
      data: expect.objectContaining({ status: "REMOVED", removalReason: "Uploaded the wrong screenshot.", removedByRequesterId: requesterId }),
    }));
  });

  it("API-13 / AC-17: compensates permanent storage when the metadata insert fails", async () => {
    const failing = createTestApp({
      attachmentCreate: vi.fn(async () => {
        throw new Error("database details must stay private");
      }),
    });
    const response = await request(failing.app)
      .post(`/api/tickets/${ticketNumber}/attachments`)
      .set("X-Development-Requester-Id", String(requesterId))
      .attach("file", png, { filename: "evidence.png", contentType: "image/png" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unable to upload Attachment." },
    });
    expect(await readdir(storageDir)).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain("database details");
  });

  it("returns safe ownership, reason, and repeated-removal errors", async () => {
    const missingOwner = createTestApp({ ticketFindFirst: vi.fn(async () => null) });
    const missing = await request(missingOwner.app)
      .get(`/api/tickets/${ticketNumber}/attachments`)
      .set("X-Development-Requester-Id", "2");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: { code: "TICKET_NOT_FOUND", message: "Ticket was not found." } });
    expect(missingOwner.calls.attachmentFindMany).not.toHaveBeenCalled();

    const invalidReason = createTestApp({
      attachmentFindFirst: vi.fn(async () => ({ id: 101, status: "ACTIVE", storageKey: "active.png" })),
    });
    const invalid = await request(invalidReason.app)
      .delete(`/api/tickets/${ticketNumber}/attachments/101`)
      .set("X-Development-Requester-Id", String(requesterId))
      .send({ reason: "bad" });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.fieldErrors).toEqual({ reason: "Removal reason must contain 5-250 characters." });

    const alreadyRemoved = createTestApp({
      attachmentFindFirst: vi.fn(async () => ({ id: 101, status: "REMOVED", storageKey: "removed.png" })),
    });
    const repeated = await request(alreadyRemoved.app)
      .delete(`/api/tickets/${ticketNumber}/attachments/101`)
      .set("X-Development-Requester-Id", String(requesterId))
      .send({ reason: "Another explanation" });
    expect(repeated.status).toBe(409);
    expect(alreadyRemoved.calls.attachmentUpdate).not.toHaveBeenCalled();
  });
});
