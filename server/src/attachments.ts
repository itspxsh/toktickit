import path from "node:path";

export const MAX_ATTACHMENT_SIZE = 5_242_880;

export interface AttachmentFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AttachmentValidationError {
  status: 415 | 422;
  code: "UNSUPPORTED_ATTACHMENT" | "INVALID_ATTACHMENT_METADATA";
  message: string;
}

export interface ValidatedAttachment {
  extension: ".jpg" | ".jpeg" | ".png" | ".webp" | ".pdf";
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
}

type AttachmentRule = ValidatedAttachment & {
  extensions: readonly ValidatedAttachment["extension"][];
  signature: (buffer: Buffer) => boolean;
};

const ATTACHMENT_RULES: readonly AttachmentRule[] = [
  {
    extensions: [".jpg", ".jpeg"],
    extension: ".jpg",
    mimeType: "image/jpeg",
    signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    extensions: [".png"],
    extension: ".png",
    mimeType: "image/png",
    signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  },
  {
    extensions: [".webp"],
    extension: ".webp",
    mimeType: "image/webp",
    signature: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP",
  },
  {
    extensions: [".pdf"],
    extension: ".pdf",
    mimeType: "application/pdf",
    signature: (buffer) => buffer.subarray(0, 5).toString("ascii") === "%PDF-",
  },
];

function normaliseOriginalName(value: string): string | null {
  const normalised = value.replaceAll("\\", "/");
  const name = path.posix.basename(normalised).trim();
  if (!name || name.length > 255 || /[\u0000-\u001f\u007f]/u.test(name)) return null;
  return name;
}

export function sanitiseOriginalName(value: string): string | null {
  return normaliseOriginalName(value);
}

/** Validate size, extension, declared MIME, and magic bytes as one rule. */
export function validateAttachment(file: AttachmentFileLike): ValidatedAttachment | AttachmentValidationError {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_ATTACHMENT_SIZE) {
    return {
      status: 422,
      code: "INVALID_ATTACHMENT_METADATA",
      message: "Attachment size must be between 1 byte and 5 MiB.",
    };
  }

  const originalName = normaliseOriginalName(file.originalname);
  if (!originalName) {
    return {
      status: 422,
      code: "INVALID_ATTACHMENT_METADATA",
      message: "Attachment filename is invalid.",
    };
  }

  const extension = path.posix.extname(originalName).toLowerCase() as ValidatedAttachment["extension"];
  const rule = ATTACHMENT_RULES.find((candidate) => candidate.extensions.includes(extension));
  if (!rule || rule.mimeType !== file.mimetype || !rule.signature(file.buffer)) {
    return {
      status: 415,
      code: "UNSUPPORTED_ATTACHMENT",
      message: "Attachment type or signature is not supported.",
    };
  }

  return {
    extension: extension === ".jpeg" ? ".jpeg" : rule.extension,
    mimeType: rule.mimeType,
  };
}

export function attachmentStorageDirectory(): string {
  return path.resolve(process.env.ATTACHMENT_STORAGE_DIR ?? path.join(process.cwd(), "storage", "attachments"));
}

export function safeAttachmentPath(storageKey: string): string | null {
  const root = attachmentStorageDirectory();
  const candidate = path.resolve(root, storageKey);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

export function safeDownloadName(originalName: string): { fallback: string; encoded: string } {
  const safeName = normaliseOriginalName(originalName) ?? "attachment";
  const fallback = safeName.replace(/[^\x20-\x7e]/gu, "_").replace(/["\\]/gu, "_");
  return { fallback: fallback || "attachment", encoded: encodeURIComponent(safeName) };
}
