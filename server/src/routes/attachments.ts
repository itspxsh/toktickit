import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import { createReadStream } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  attachmentStorageDirectory,
  MAX_ATTACHMENT_SIZE,
  safeAttachmentPath,
  safeDownloadName,
  sanitiseOriginalName,
  validateAttachment,
  type AttachmentFileLike,
} from "../attachments.js";
import { getPrisma } from "../prisma.js";

type Model = {
  findFirst(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
};

interface AttachmentRouteClient {
  ticket: Pick<Model, "findFirst">;
  attachment: Pick<Model, "findFirst" | "findMany" | "count" | "create" | "update">;
}

type PrismaProvider = () => AttachmentRouteClient;

const TICKET_NUMBER_PATTERN = /^TKT-\d{4}-\d{6}$/;
const ATTACHMENT_ID_PATTERN = /^[1-9]\d*$/;
const ATTACHMENT_METADATA_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  removedAt: true,
  removalReason: true,
  createdAt: true,
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1 },
});

function parseRequesterId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseAttachmentId(value: string | undefined): number | null {
  if (!value || !ATTACHMENT_ID_PATTERN.test(value.trim())) return null;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function serialiseAttachment(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    removedAt: row.removedAt ?? null,
    removalReason: row.removalReason ?? null,
    createdAt: row.createdAt,
  };
}

function sendTicketNotFound(res: Response): void {
  res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket was not found." } });
}

function sendAttachmentNotFound(res: Response): void {
  res.status(404).json({ error: { code: "ATTACHMENT_NOT_FOUND", message: "Attachment was not found." } });
}

function requireTicketNumber(req: Request, res: Response): string | null {
  const ticketNumber = req.params.ticketNumber?.trim();
  if (!ticketNumber || !TICKET_NUMBER_PATTERN.test(ticketNumber)) {
    res.status(400).json({
      error: { code: "INVALID_TICKET_NUMBER", message: "Ticket Number must match TKT-YYYY-NNNNNN." },
    });
    return null;
  }
  return ticketNumber;
}

async function findOwnedTicket(
  prisma: AttachmentRouteClient,
  ticketNumber: string,
  requesterId: number,
): Promise<Record<string, unknown> | null> {
  return await prisma.ticket.findFirst({
    where: {
      ticketNumber,
      requesterId,
      requester: { isActive: true },
    },
    select: { id: true },
  }) as Record<string, unknown> | null;
}

function sendValidation(res: Response, reason: string): void {
  res.status(422).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Please correct the highlighted fields.",
      fieldErrors: { reason },
    },
  });
}

function sendUploadError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function uploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        sendUploadError(res, 413, "ATTACHMENT_TOO_LARGE", "Attachment must not exceed 5 MiB.");
        return;
      }
      sendUploadError(res, 400, "INVALID_ATTACHMENT_UPLOAD", "Attachment upload must contain one file field.");
      return;
    }
    sendUploadError(res, 400, "INVALID_ATTACHMENT_UPLOAD", "Attachment upload could not be read.");
  });
}

async function persistFile(file: Express.Multer.File, extension: string): Promise<{
  storageKey: string;
  permanentPath: string;
}> {
  const root = attachmentStorageDirectory();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const storageKey = `${randomUUID()}${extension}`;
  const permanentPath = safeAttachmentPath(storageKey);
  if (!permanentPath) throw new Error("Unable to allocate safe attachment path.");
  const temporaryPath = `${permanentPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, file.buffer, { mode: 0o600, flag: "wx" });
    await rename(temporaryPath, permanentPath);
    return { storageKey, permanentPath };
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT");
}

function readRemovalReason(body: unknown): string | null {
  if (!isRecord(body) || typeof body.reason !== "string") return null;
  const reason = body.reason.trim();
  return reason.length >= 5 && reason.length <= 250 ? reason : null;
}

/** Register requester-owned Attachment metadata and private-file operations. */
export function registerAttachmentRoutes(
  app: Express,
  prismaProvider: PrismaProvider = getPrisma as unknown as PrismaProvider,
): void {
  app.get("/api/tickets/:ticketNumber/attachments", async (req: Request, res: Response) => {
    const requesterId = parseRequesterId(req.header("X-Development-Requester-Id"));
    if (requesterId === null) {
      res.status(400).json({
        error: { code: "INVALID_REQUESTER_CONTEXT", message: "A positive Development Requester id is required." },
      });
      return;
    }
    const ticketNumber = requireTicketNumber(req, res);
    if (!ticketNumber) return;

    const prisma = prismaProvider();
    try {
      const ticket = await findOwnedTicket(prisma, ticketNumber, requesterId);
      if (!ticket) {
        sendTicketNotFound(res);
        return;
      }
      const rows = await prisma.attachment.findMany({
        where: { ticketId: ticket.id },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: ATTACHMENT_METADATA_SELECT,
      }) as unknown[];
      res.status(200).json({ data: rows.map((row) => serialiseAttachment(row as Record<string, unknown>)) });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to load Attachments." } });
    }
  });

  app.post("/api/tickets/:ticketNumber/attachments", uploadMiddleware, async (req: Request, res: Response) => {
    const requesterId = parseRequesterId(req.header("X-Development-Requester-Id"));
    if (requesterId === null) {
      res.status(400).json({
        error: { code: "INVALID_REQUESTER_CONTEXT", message: "A positive Development Requester id is required." },
      });
      return;
    }
    const ticketNumber = requireTicketNumber(req, res);
    if (!ticketNumber) return;
    if (!req.file) {
      sendUploadError(res, 400, "MISSING_ATTACHMENT", "One file is required.");
      return;
    }

    const prisma = prismaProvider();
    try {
      const ticket = await findOwnedTicket(prisma, ticketNumber, requesterId);
      if (!ticket) {
        sendTicketNotFound(res);
        return;
      }
      const activeCount = await prisma.attachment.count({ where: { ticketId: ticket.id, status: "ACTIVE" } });
      if (activeCount >= 5) {
        sendUploadError(res, 409, "ATTACHMENT_LIMIT_REACHED", "A Ticket can have at most five active Attachments.");
        return;
      }

      const file = req.file as AttachmentFileLike;
      const validation = validateAttachment(file);
      if ("status" in validation) {
        sendUploadError(res, validation.status, validation.code, validation.message);
        return;
      }
      const originalName = sanitiseOriginalName(req.file.originalname);
      if (!originalName) {
        sendUploadError(res, 422, "INVALID_ATTACHMENT_METADATA", "Attachment filename is invalid.");
        return;
      }

      let stored: { storageKey: string; permanentPath: string } | null = null;
      try {
        stored = await persistFile(req.file, validation.extension);
        const created = await prisma.attachment.create({
          data: {
            ticketId: ticket.id,
            originalName,
            storageKey: stored.storageKey,
            mimeType: validation.mimeType,
            sizeBytes: req.file.size,
            status: "ACTIVE",
          },
          select: ATTACHMENT_METADATA_SELECT,
        }) as Record<string, unknown>;
        res.status(201).json({ data: serialiseAttachment(created) });
      } catch {
        if (stored) await unlink(stored.permanentPath).catch(() => undefined);
        throw new Error("Attachment persistence failed.");
      }
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to upload Attachment." } });
    }
  });

  app.get("/api/tickets/:ticketNumber/attachments/:attachmentId", async (req: Request, res: Response) => {
    const requesterId = parseRequesterId(req.header("X-Development-Requester-Id"));
    if (requesterId === null) {
      res.status(400).json({
        error: { code: "INVALID_REQUESTER_CONTEXT", message: "A positive Development Requester id is required." },
      });
      return;
    }
    const ticketNumber = requireTicketNumber(req, res);
    if (!ticketNumber) return;
    const attachmentId = parseAttachmentId(req.params.attachmentId);
    if (attachmentId === null) {
      res.status(400).json({ error: { code: "INVALID_ATTACHMENT_ID", message: "Attachment id must be a positive integer." } });
      return;
    }

    const prisma = prismaProvider();
    try {
      const ticket = await findOwnedTicket(prisma, ticketNumber, requesterId);
      if (!ticket) {
        sendTicketNotFound(res);
        return;
      }
      const attachment = await prisma.attachment.findFirst({
        where: { id: attachmentId, ticketId: ticket.id },
        select: ATTACHMENT_METADATA_SELECT,
      }) as Record<string, unknown> | null;
      if (!attachment) {
        sendAttachmentNotFound(res);
        return;
      }
      res.status(200).json({ data: serialiseAttachment(attachment) });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to load Attachment." } });
    }
  });

  app.get("/api/tickets/:ticketNumber/attachments/:attachmentId/download", async (req: Request, res: Response) => {
    const requesterId = parseRequesterId(req.header("X-Development-Requester-Id"));
    if (requesterId === null) {
      res.status(400).json({
        error: { code: "INVALID_REQUESTER_CONTEXT", message: "A positive Development Requester id is required." },
      });
      return;
    }
    const ticketNumber = requireTicketNumber(req, res);
    if (!ticketNumber) return;
    const attachmentId = parseAttachmentId(req.params.attachmentId);
    if (attachmentId === null) {
      res.status(400).json({ error: { code: "INVALID_ATTACHMENT_ID", message: "Attachment id must be a positive integer." } });
      return;
    }

    const prisma = prismaProvider();
    try {
      const ticket = await findOwnedTicket(prisma, ticketNumber, requesterId);
      if (!ticket) {
        sendTicketNotFound(res);
        return;
      }
      const attachment = await prisma.attachment.findFirst({
        where: { id: attachmentId, ticketId: ticket.id, status: "ACTIVE" },
        select: { storageKey: true, mimeType: true, originalName: true, sizeBytes: true },
      }) as Record<string, unknown> | null;
      if (!attachment || typeof attachment.storageKey !== "string" || typeof attachment.originalName !== "string") {
        sendAttachmentNotFound(res);
        return;
      }
      const filePath = safeAttachmentPath(attachment.storageKey);
      if (!filePath) {
        res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to download Attachment." } });
        return;
      }
      const names = safeDownloadName(attachment.originalName);
      res.setHeader("Content-Type", typeof attachment.mimeType === "string" ? attachment.mimeType : "application/octet-stream");
      if (typeof attachment.sizeBytes === "number") res.setHeader("Content-Length", String(attachment.sizeBytes));
      res.setHeader("Content-Disposition", `inline; filename="${names.fallback}"; filename*=UTF-8''${names.encoded}`);
      const stream = createReadStream(filePath);
      stream.once("error", (error) => {
        if (!res.headersSent) {
          if (isMissingFileError(error)) sendAttachmentNotFound(res);
          else res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to download Attachment." } });
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to download Attachment." } });
    }
  });

  app.delete("/api/tickets/:ticketNumber/attachments/:attachmentId", async (req: Request, res: Response) => {
    const requesterId = parseRequesterId(req.header("X-Development-Requester-Id"));
    if (requesterId === null) {
      res.status(400).json({
        error: { code: "INVALID_REQUESTER_CONTEXT", message: "A positive Development Requester id is required." },
      });
      return;
    }
    const ticketNumber = requireTicketNumber(req, res);
    if (!ticketNumber) return;
    const attachmentId = parseAttachmentId(req.params.attachmentId);
    if (attachmentId === null) {
      res.status(400).json({ error: { code: "INVALID_ATTACHMENT_ID", message: "Attachment id must be a positive integer." } });
      return;
    }
    const reason = readRemovalReason(req.body);
    if (!reason) {
      sendValidation(res, "Removal reason must contain 5-250 characters.");
      return;
    }

    const prisma = prismaProvider();
    try {
      const ticket = await findOwnedTicket(prisma, ticketNumber, requesterId);
      if (!ticket) {
        sendTicketNotFound(res);
        return;
      }
      const attachment = await prisma.attachment.findFirst({
        where: { id: attachmentId, ticketId: ticket.id },
        select: { id: true, status: true, storageKey: true },
      }) as Record<string, unknown> | null;
      if (!attachment) {
        sendAttachmentNotFound(res);
        return;
      }
      if (attachment.status === "REMOVED") {
        res.status(409).json({ error: { code: "ATTACHMENT_ALREADY_REMOVED", message: "Attachment is already removed." } });
        return;
      }

      const removedAt = new Date();
      const updated = await prisma.attachment.update({
        where: { id: attachmentId },
        data: { status: "REMOVED", removedAt, removalReason: reason, removedByRequesterId: requesterId },
        select: ATTACHMENT_METADATA_SELECT,
      }) as Record<string, unknown>;
      if (typeof attachment.storageKey === "string") {
        const filePath = safeAttachmentPath(attachment.storageKey);
        if (filePath) await unlink(filePath).catch((error: unknown) => {
          if (!isMissingFileError(error)) throw error;
        });
      }
      res.status(200).json({ data: serialiseAttachment(updated) });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to remove Attachment." } });
    }
  });
}

export default registerAttachmentRoutes;
