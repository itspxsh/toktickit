import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { CurrentStatus } from "@prisma/client";
import {
  ActionRuleError,
  actionFingerprint,
  assertNoUnknownKeys,
  canTransitionAction,
  parseActionContent,
  validateActionContent,
} from "../../src/lab-04/action-rules.js";
import {
  allowedTicketTransitions,
  mapTransactionError,
  resolutionBlockers,
  ticketTransitionRequiresConfirmation,
} from "../../src/lab-04/workflow-service.js";

describe("L4-04 Action rules (T-UNIT-01 / T-UNIT-03)", () => {
  it("normalizes plain text, enforces boundaries, and rejects markup/control characters", () => {
    expect(parseActionContent({ description: "  Inspect gateway  ", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "  image attached  " })).toEqual({
      description: "Inspect gateway", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "image attached",
    });
    expect(() => parseActionContent({ description: "<script>alert(1)</script>", followUpRequired: false })).toThrow(ActionRuleError);
    expect(() => parseActionContent({ description: "\u0001bad", followUpRequired: false })).toThrow(ActionRuleError);
    expect(() => parseActionContent({ description: "line one\nline two", followUpRequired: false })).toThrow(ActionRuleError);
    expect(() => parseActionContent({ description: "tab\there", followUpRequired: false })).toThrow(ActionRuleError);
    expect(() => parseActionContent({ description: "x".repeat(2_001), followUpRequired: false })).toThrow(ActionRuleError);
  });

  it("validates the merged follow-up rule and completion requirements", () => {
    expect(() => validateActionContent({ description: "Inspect gateway", result: "", followUpRequired: true, followUpNote: "next", attachmentNotes: "" })).toThrow(ActionRuleError);
    expect(() => validateActionContent({ description: "Inspect gateway", result: "", followUpRequired: false, followUpNote: "stale note", attachmentNotes: "" })).toThrow(ActionRuleError);
    expect(() => validateActionContent({ description: "Inspect gateway", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" }, true)).toThrow(ActionRuleError);
    expect(() => validateActionContent({ description: "Inspect gateway", result: "done", followUpRequired: true, followUpNote: "Please check again", attachmentNotes: "" }, true)).toThrow(ActionRuleError);
  });

  it("permits only the two non-terminal Action transition paths", () => {
    expect(canTransitionAction("PLANNED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionAction("PLANNED", "CANCELLED")).toBe(true);
    expect(canTransitionAction("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(canTransitionAction("IN_PROGRESS", "CANCELLED")).toBe(true);
    expect(canTransitionAction("PLANNED", "COMPLETED")).toBe(false);
    expect(canTransitionAction("COMPLETED", "CANCELLED")).toBe(false);
  });

  it("fingerprints normalized content and assignee without workflow versions", () => {
    const a = actionFingerprint(77, { description: " Inspect gateway ", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" });
    const b = actionFingerprint(77, { description: "Inspect gateway", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" });
    const otherAssignee = actionFingerprint(78, { description: "Inspect gateway", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" });
    const otherContent = actionFingerprint(77, { description: "Inspect VPN gateway", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" });
    expect(a).toBe(b);
    expect(a).not.toBe(otherAssignee);
    expect(a).not.toBe(otherContent);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed on unsupported server-owned fields", () => {
    expect(() => assertNoUnknownKeys({ description: "Inspect gateway", createdById: 1 }, ["description"])).toThrow(/unsupported fields/i);
  });
});

describe("L4-06 Ticket workflow rules (T-UNIT-02)", () => {
  it("exposes only the approved transition destinations for each support role", () => {
    const matrix: Record<CurrentStatus, CurrentStatus[]> = {
      NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
      OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "RESOLVED"],
      RESOLVED: ["CLOSED", "REOPENED"],
      CLOSED: ["REOPENED"],
      REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      CANCELLED: ["REOPENED"],
    } as const;

    for (const from of Object.keys(matrix) as CurrentStatus[]) {
      const destinations = matrix[from];
      expect(allowedTicketTransitions(from, "IT_STAFF")).toEqual(
        from === "CANCELLED" ? [] : [...destinations],
      );
      expect(allowedTicketTransitions(from, "ADMIN")).toEqual([...destinations]);
      expect(allowedTicketTransitions(from, "REQUESTER")).toEqual([]);
    }
  });

  it("requires confirmation only for the approved effective Ticket transitions", () => {
    expect(ticketTransitionRequiresConfirmation("OPEN", "RESOLVED")).toBe(true);
    expect(ticketTransitionRequiresConfirmation("REOPENED", "CANCELLED")).toBe(true);
    expect(ticketTransitionRequiresConfirmation("RESOLVED", "CLOSED")).toBe(true);
    expect(ticketTransitionRequiresConfirmation("OPEN", "IN_PROGRESS")).toBe(false);
    expect(ticketTransitionRequiresConfirmation("OPEN", "OPEN")).toBe(false);
    expect(ticketTransitionRequiresConfirmation("NEW", "CLOSED")).toBe(false);
  });

  it("calculates resolution blockers from current Actions without treating cancelled work as outstanding", () => {
    expect(resolutionBlockers([])).toEqual(["ZERO_COMPLETED"]);
    expect(resolutionBlockers([
      { state: "CANCELLED", result: "", followUpRequired: true },
    ])).toEqual(["ZERO_COMPLETED"]);
    expect(resolutionBlockers([
      { state: "COMPLETED", result: "Verified service recovery", followUpRequired: false },
      { state: "PLANNED", result: "", followUpRequired: false },
    ])).toEqual(["UNFINISHED_ACTIONS"]);
    expect(resolutionBlockers([
      { state: "COMPLETED", result: "Verified service recovery", followUpRequired: true },
    ])).toEqual(["FOLLOW_UP_REQUIRED"]);
    expect(resolutionBlockers([
      { state: "COMPLETED", result: "Verified service recovery", followUpRequired: false },
      { state: "CANCELLED", result: "", followUpRequired: true },
    ])).toEqual([]);
    expect(resolutionBlockers([
      { state: "COMPLETED", result: null as unknown as string, followUpRequired: false },
    ])).toEqual(["ZERO_COMPLETED"]);
  });

  it("does not misreport unrelated unique conflicts as stale workflow writes", () => {
    const uniqueConflict = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002", clientVersion: "5.22.0", meta: { target: ["ticketId", "clientRequestId"] },
    });
    const serializationConflict = new Prisma.PrismaClientKnownRequestError("Transaction conflict", {
      code: "P2034", clientVersion: "5.22.0",
    });
    expect(mapTransactionError(uniqueConflict)).toBeNull();
    expect(mapTransactionError(serializationConflict)).toMatchObject({ status: 409, code: "STALE_WRITE" });
  });
});
