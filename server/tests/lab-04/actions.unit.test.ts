import { describe, expect, it } from "vitest";
import {
  ActionRuleError,
  actionFingerprint,
  assertNoUnknownKeys,
  canTransitionAction,
  parseActionContent,
  validateActionContent,
} from "../../src/lab-04/action-rules.js";

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
