import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { ActionRuleError } from "./lab-04/action-rules.js";

/** Send the public Action API error envelope and log only safe correlation metadata. */
export function sendActionHttpError(req: Request, res: Response, error: unknown): void {
  if (error instanceof ActionRuleError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) } });
    return;
  }

  console.error(JSON.stringify({
    event: "api.unhandled_error",
    requestId: randomUUID(),
    method: req.method,
    route: req.route?.path ?? "unmatched",
    errorName: error instanceof Error ? error.name : "UnknownError",
  }));
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}
