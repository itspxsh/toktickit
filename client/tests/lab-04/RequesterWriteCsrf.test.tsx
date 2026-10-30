import { afterEach, describe, expect, it, vi } from "vitest";
import { createTicket, removeAttachment, uploadAttachment } from "../../src/api.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("T-UI-REG-01 / AC-13, AC-17: requester writes use session CSRF", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the session CSRF token on Ticket creation and Attachment upload/removal", async () => {
    const attachment = {
      id: 3,
      originalName: "evidence.png",
      mimeType: "image/png",
      sizeBytes: 10,
      status: "ACTIVE",
      removedAt: null,
      removalReason: null,
      createdAt: "2026-10-18T00:00:00.000Z",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/csrf")) return jsonResponse({ csrfToken: "test-session-csrf" });
      if (url.endsWith("/api/tickets")) return jsonResponse({ data: {}, replayed: false });
      if (url.endsWith("/api/tickets/TKT-2026-000001/attachments")) return jsonResponse({ data: attachment });
      if (url.endsWith("/api/tickets/TKT-2026-000001/attachments/3")) return jsonResponse({ data: attachment });
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await createTicket({
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Regression ticket",
      requestedPriority: "MEDIUM",
      description: "A valid requester regression ticket.",
    }, undefined);
    await uploadAttachment("TKT-2026-000001", undefined, new File(["image"], "evidence.png", { type: "image/png" }));
    await removeAttachment("TKT-2026-000001", undefined, 3, "No longer required");

    const mutations = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST" || init?.method === "DELETE");
    expect(mutations).toHaveLength(3);
    for (const [, init] of mutations) {
      expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("test-session-csrf");
    }
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/auth/csrf"), expect.objectContaining({ credentials: "include" }));
  });
});
