import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { allItems, api, ApiError } from "./api.ts";
import { filterQuery, filterUrl, readFilters } from "./filters.ts";
afterEach(() => vi.unstubAllGlobals());
describe("JSON API client", () => {
  it("sends JSON with the session cookie and returns typed data", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    expect(await api("/api/setup", { method: "POST", body: { name: "Alex" } })).toEqual({
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/setup",
      expect.objectContaining({
        credentials: "same-origin",
        body: '{"name":"Alex"}',
        headers: expect.any(Headers),
      }),
    );
  });
  it("preserves duplicate bookmark details for the friendly existing-link message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "Already saved", existingBookmarkId: "bookmark-1" },
            { status: 409 },
          ),
        ),
    );
    await expect(api("/api/bookmarks")).rejects.toMatchObject({
      status: 409,
      message: "Already saved",
      data: { existingBookmarkId: "bookmark-1" },
    });
  });
  it("redirects protected requests on 401 but keeps bad-password errors on the form", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(Response.json({ message: "Invalid email or password" }, { status: 401 })),
        ),
    );
    await expect(api("/api/me")).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/login");
    assign.mockClear();
    await expect(api("/api/auth/sign-in/email", { redirectOnUnauthorized: false })).rejects.toThrow(
      "Invalid email or password",
    );
    expect(assign).not.toHaveBeenCalled();
  });
  it("handles network and non-JSON server errors without leaking response HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>private error</html>", { status: 502 })),
    );
    await expect(api("/api/me")).rejects.toThrow("Request failed (502)");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api("/api/me")).rejects.toMatchObject({
      status: 0,
      message: "Could not connect. Check your connection and try again.",
    });
  });
  it("keeps aborts recognizable and loads all catalog pages", async () => {
    const aborted = new DOMException("Cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));
    await expect(api("/api/bookmarks")).rejects.toBe(aborted);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: Array.from({ length: 50 }, (_, id) => ({ id })) }),
      )
      .mockResolvedValueOnce(Response.json({ items: [{ id: 50 }] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await allItems("/api/lists")).toHaveLength(51);
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/lists?limit=50&offset=50");
  });
});
describe("bookmark filters", () => {
  it("round trips search, list and tag including spaces and reserved characters", () => {
    const filters = { q: "Vue & Workers", listId: "list-1", tag: "c++" };
    expect(readFilters(filterQuery(filters))).toEqual(filters);
    expect(filterUrl(filters)).toBe("/?q=Vue+%26+Workers&listId=list-1&tag=c%2B%2B");
  });
  it("omits empty filters, trims values and ignores unrelated params", () => {
    expect(filterUrl({ q: "  ", listId: "", tag: "" })).toBe("/");
    expect(filterUrl({ q: " vue ", listId: "", tag: "" })).toBe("/?q=vue");
    expect(readFilters(new URLSearchParams("offset=20&other=x"))).toEqual({
      q: "",
      listId: "",
      tag: "",
    });
  });
});
