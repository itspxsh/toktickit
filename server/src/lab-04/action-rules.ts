import { createHash } from "node:crypto";
import type { ActionState } from "@prisma/client";

export class ActionRuleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export type ActionContent = {
  description: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
};

export const ACTION_STATES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export function isPlainText(value: unknown): value is string {
  return typeof value === "string" && !/[<>\u0000-\u001F\u007F]/.test(value);
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function actionFingerprint(assigneeId: number, content: ActionContent): string {
  const canonical = JSON.stringify({
    assigneeId,
    description: content.description.trim(),
    result: content.result.trim(),
    followUpRequired: content.followUpRequired,
    followUpNote: content.followUpNote.trim(),
    attachmentNotes: content.attachmentNotes.trim(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function parseActionContent(value: Record<string, unknown>, partial = false): Partial<ActionContent> {
  const errors: Record<string, string> = {};
  const result: Partial<ActionContent> = {};
  const textFields = [
    ["description", 1, 2_000],
    ["result", 0, 2_000],
    ["followUpNote", 0, 2_000],
    ["attachmentNotes", 0, 1_000],
  ] as const;
  for (const [field, min, max] of textFields) {
    if (!(field in value)) {
      if (!partial && field === "description") errors[field] = "Description is required.";
      continue;
    }
    const raw = value[field];
    if (!isPlainText(raw)) {
      errors[field] = "Use plain text without control characters or markup.";
      continue;
    }
    const text = raw.trim();
    if (text.length < min || text.length > max) {
      errors[field] = `${field} must contain ${min}-${max} characters.`;
      continue;
    }
    Object.assign(result, { [field]: text });
  }
  if ("followUpRequired" in value) {
    if (typeof value.followUpRequired !== "boolean") errors.followUpRequired = "Follow-up Required must be a boolean.";
    else result.followUpRequired = value.followUpRequired;
  } else if (!partial) errors.followUpRequired = "Follow-up Required is required.";
  if (Object.keys(errors).length) throw new ActionRuleError(400, "VALIDATION_ERROR", "One or more Action fields are invalid.", errors);
  return result;
}

export function validateActionContent(content: ActionContent, completing = false): void {
  const errors: Record<string, string> = {};
  if (!content.description.trim() || content.description.length > 2_000) errors.description = "Description must contain 1-2,000 characters.";
  if (content.result.length > 2_000 || (completing && !content.result.trim())) errors.result = "A completed Action requires a Result of 1-2,000 characters.";
  if (content.attachmentNotes.length > 1_000) errors.attachmentNotes = "Attachment Notes must contain at most 1,000 characters.";
  if (content.followUpRequired) {
    if (content.followUpNote.trim().length < 5 || content.followUpNote.length > 2_000) errors.followUpNote = "Follow-up Note must contain 5-2,000 characters when follow-up is required.";
    if (completing) errors.followUpRequired = "An Action with required follow-up cannot be completed.";
  } else if (content.followUpNote.trim().length > 0) {
    errors.followUpNote = "Follow-up Note must be empty when follow-up is not required.";
  }
  if (Object.keys(errors).length) throw new ActionRuleError(400, "VALIDATION_ERROR", "One or more Action fields are invalid.", errors);
}

export function canTransitionAction(from: ActionState, to: ActionState): boolean {
  return (from === "PLANNED" && (to === "IN_PROGRESS" || to === "CANCELLED"))
    || (from === "IN_PROGRESS" && (to === "COMPLETED" || to === "CANCELLED"));
}

export function assertNoUnknownKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    const fieldErrors = Object.fromEntries(unknown.map((key) => [key, "This field is not accepted."]));
    throw new ActionRuleError(400, "VALIDATION_ERROR", "Request contains unsupported fields.", fieldErrors);
  }
}

export function assertVersions(ticketVersion: unknown, actionVersion?: unknown): asserts ticketVersion is number {
  const errors: Record<string, string> = {};
  if (!isPositiveInteger(ticketVersion)) errors.expectedTicketVersion = "Expected Ticket version must be a positive integer.";
  if (actionVersion !== undefined && !isPositiveInteger(actionVersion)) errors.expectedVersion = "Expected Action version must be a positive integer.";
  if (Object.keys(errors).length) throw new ActionRuleError(400, "VALIDATION_ERROR", "Valid expected versions are required.", errors);
}
