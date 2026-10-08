import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSystem } from "../../src/api.js";

describe("Lab 4 inherited authenticated diagnostic behavior (T-REG-01)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes browser credentials when requesting authenticated categories", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await checkSystem();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/api/categories",
      { credentials: "include" },
    );
  });
});
