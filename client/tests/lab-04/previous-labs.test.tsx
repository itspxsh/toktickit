import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSystem, fetchReferenceData } from "../../src/api.js";

describe("T-UI-REG-02 / AC-13, AC-17: authenticated reference fetches", () => {
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

  it("includes browser credentials for both authenticated reference lists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchReferenceData();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3000/api/categories",
      { credentials: "include", signal: undefined },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/api/related-systems",
      { credentials: "include", signal: undefined },
    );
  });
});
