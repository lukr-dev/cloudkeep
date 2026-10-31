import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { allItems, api, ApiError, retryFailedBookmarks } from "./api.ts";
import { filterQuery, filterUrl, readFilters } from "./filters.ts";
import { tagFontSize } from "./tag-cloud.ts";
import { canGoBack, trackNavigation } from "./navigation.ts";
afterEach(() => vi.unstubAllGlobals());
describe("detail back navigation", () => {
  it("marks client navigation without losing router state and restores the history method", () => {
    const pushState = vi.fn();
    const history = { pushState, length: 2, state: { cloudkeepBack: true } };
    vi.stubGlobal("window", { history, location: { origin: "https://cloudkeep.test" } });
    const stop = trackNavigation();
    history.pushState({ __voidScrollKey: "next" }, "", "/b/bookmark");
    expect(pushState).toHaveBeenCalledWith(
      { __voidScrollKey: "next", cloudkeepBack: true },
      "",
      "/b/bookmark",
    );
    expect(canGoBack()).toBe(true);
    stop();
    history.pushState({ untouched: true }, "", "/");
    expect(pushState).toHaveBeenLastCalledWith({ untouched: true }, "", "/");
  });
  it("uses same-origin document history and falls back for direct or external visits", () => {
    const history = { length: 2, state: null };
    vi.stubGlobal("window", { history, location: { origin: "https://cloudkeep.test" } });
    for (const referrer of ["", "https://external.test/", "invalid"]) {
      vi.stubGlobal("document", { referrer });
      expect(canGoBack()).toBe(false);
    }
    vi.stubGlobal("document", { referrer: "https://cloudkeep.test/?tag=design&archived=1" });
    expect(canGoBack()).toBe(true);
    history.length = 1;
    expect(canGoBack()).toBe(false);
  });
});
describe("tag cloud sizing", () => {
  it("scales counts logarithmically from 0.8rem to 2rem", () => {
    expect(tagFontSize(1, 100)).toBe(0.8);
    expect(tagFontSize(10, 100)).toBeCloseTo(1.4);
    expect(tagFontSize(100, 100)).toBe(2);
    expect(tagFontSize(2, 100)).toBeGreaterThan(tagFontSize(1, 100));
    expect(tagFontSize(10, 100) - tagFontSize(1, 100)).toBeCloseTo(
      tagFontSize(100, 100) - tagFontSize(10, 100),
    );
  });
  it("handles empty clouds, single bookmarks and out-of-range counts", () => {
    expect(tagFontSize(0, 0)).toBe(0.8);
    expect(tagFontSize(1, 1)).toBe(0.8);
    expect(tagFontSize(5, 5)).toBe(2);
    expect(tagFontSize(0, 100)).toBe(0.8);
    expect(tagFontSize(-1, 100)).toBe(0.8);
    expect(tagFontSize(200, 100)).toBe(2);
  });
});
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
  it("returns a duplicate save as success with its bookmark and flag", async () => {
    const result = { bookmark: { id: "bookmark-1" }, alreadyExists: true };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    await expect(
      api("/api/bookmarks", {
        method: "POST",
        body: { url: "https://example.com/" },
      }),
    ).resolves.toEqual(result);
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
  it("round trips archive filters and preserves the archive when changing tags or lists", () => {
    const filters = { type: "", q: "vue", listId: "list-1", tag: "web", archived: true };
    expect(readFilters(filterQuery(filters))).toEqual(filters);
    expect(filterUrl({ ...filters, tag: "cloud" })).toBe(
      "/?q=vue&listId=list-1&tag=cloud&archived=1",
    );
    expect(filterUrl({ ...filters, listId: "", q: "", tag: "" })).toBe("/?archived=1");
    expect(filterUrl({ ...filters, archived: false })).not.toContain("archived");
  });
  it("reads only true or 1 as the archive flag", () => {
    for (const value of ["1", "true"])
      expect(readFilters(new URLSearchParams({ archived: value })).archived).toBe(true);
    for (const value of ["0", "false", "", "invalid"])
      expect(readFilters(new URLSearchParams({ archived: value })).archived).toBe(false);
  });
  it("round trips search, list and tag including spaces and reserved characters", () => {
    const filters = { type: "", q: "Vue & Workers", listId: "list-1", tag: "c++", archived: false };
    expect(readFilters(filterQuery(filters))).toEqual(filters);
    expect(filterUrl(filters)).toBe("/?q=Vue+%26+Workers&listId=list-1&tag=c%2B%2B");
  });
  it("omits empty filters, trims values and ignores unrelated params", () => {
    expect(filterUrl({ type: "", q: "  ", listId: "", tag: "", archived: false })).toBe("/");
    expect(filterUrl({ type: "", q: " vue ", listId: "", tag: "", archived: false })).toBe(
      "/?q=vue",
    );
    expect(readFilters(new URLSearchParams("offset=20&other=x"))).toEqual({
      type: "",
      q: "",
      listId: "",
      tag: "",
      archived: false,
    });
  });
});

it("round trips bookmark type filters and ignores unsupported types", () => {
  for (const type of ["link", "text", "asset"]) {
    const filters = { type, q: "", listId: "", tag: "", archived: false };
    expect(readFilters(filterQuery(filters))).toEqual(filters);
    expect(filterUrl(filters)).toBe(`/?type=${type}`);
  }
  expect(readFilters(new URLSearchParams("type=unknown")).type).toBe("");
});

it("walks every failed-bookmark retry batch and reports partial queue failures", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ queued: 49, failed: 1, nextCursor: "cursor" }))
    .mockResolvedValueOnce(Response.json({ queued: 3, failed: 0, nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  expect(await retryFailedBookmarks()).toEqual({ queued: 52, failed: 1 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/bookmarks/retry-failed");
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({});
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({ after: "cursor" });
});
it("stops bulk retries on a request error instead of repeating failed batches", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(retryFailedBookmarks()).rejects.toThrow("Unavailable");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
