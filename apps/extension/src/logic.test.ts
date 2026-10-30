import { describe, expect, it, vi } from "vite-plus/test";
import {
  ApiError,
  SaveSession,
  SessionWrites,
  LookupGuard,
  type Saved,
  cachedBadge,
  cachedLists,
  client,
  eligible,
  fetchLists,
  serverOrigin,
  ToggleQueue,
  type List,
} from "./logic.ts";
const config = { server: "https://keep.example", token: "secret", badge: true };
const list = (id: string): List => ({ id, name: id, count: 0, createdAt: 0, updatedAt: 0 });
describe("URL eligibility", () => {
  it("only accepts web pages and validates server origins", () => {
    for (const url of ["https://example.com/a", "http://localhost:8787"])
      expect(eligible(url)).toBe(true);
    for (const url of [
      undefined,
      "chrome://settings",
      "file:///a",
      "about:blank",
      "javascript:alert(1)",
      "broken",
    ])
      expect(eligible(url)).toBe(false);
    expect(serverOrigin("https://keep.example/path")).toBe("https://keep.example");
    expect(() => serverOrigin("https://user:password@example.com")).toThrow();
  });
});
describe("API", () => {
  it("omits cookies, sends bearer and only the supplied body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ok":true}'));
    await client(config, vi.fn(), fetcher)("/api/bookmarks", "POST", {
      url: "https://example.com",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://keep.example/api/bookmarks",
      expect.objectContaining({
        credentials: "omit",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: '{"url":"https://example.com"}',
      }),
    );
  });
  it("clears auth on 401, even if error body is not JSON", async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    const api = client(
      config,
      clear,
      vi.fn<typeof fetch>().mockResolvedValue(new Response("expired", { status: 401 })),
    );
    await expect(api("/private")).rejects.toMatchObject({ status: 401 });
    expect(clear).toHaveBeenCalledOnce();
  });
  it("reports server errors without clearing auth", async () => {
    const clear = vi.fn();
    const api = client(
      config,
      clear,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{"error":"No access"}', { status: 403 })),
    );
    await expect(api("/private")).rejects.toEqual(new ApiError(403, "No access"));
    expect(clear).not.toHaveBeenCalled();
  });
});
describe("list cache", () => {
  it("isolates cached lists by account and server", () => {
    const cache = { ...config, items: [list("a")] };
    expect(cachedLists(cache, config)).toEqual(cache.items);
    expect(cachedLists(cache, { ...config, token: "other" })).toEqual([]);
    expect(cachedLists(cache, { ...config, server: "https://other.example" })).toEqual([]);
    expect(cachedLists(undefined, config)).toEqual([]);
  });
  it("paginates until a short page", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ items: Array.from({ length: 50 }, (_, i) => list(String(i))) })
      .mockResolvedValueOnce({ items: [list("last")] });
    expect(await fetchLists(request)).toHaveLength(51);
    expect(request.mock.calls).toEqual([
      ["/api/lists?limit=50&offset=0"],
      ["/api/lists?limit=50&offset=50"],
    ]);
  });
});
describe("queued chip toggles", () => {
  it("paints intent before id, coalesces clicks, then merges existing membership", async () => {
    const write = vi.fn().mockResolvedValue({});
    const queue = new ToggleQueue(write, vi.fn(), vi.fn());
    queue.toggle("a");
    queue.toggle("a");
    queue.toggle("b");
    expect(write).not.toHaveBeenCalled();
    expect(queue.selected("b")).toBe(true);
    queue.attach("bookmark", ["a", "c"]);
    await queue.idle();
    expect(write.mock.calls).toEqual([
      ["bookmark", "a", false],
      ["bookmark", "b", true],
    ]);
    expect(queue.selected("c")).toBe(true);
  });
  it("serializes rapid changes during a request", async () => {
    let release!: () => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue({});
    const queue = new ToggleQueue(write, vi.fn(), vi.fn());
    queue.attach("bookmark", []);
    queue.toggle("a");
    queue.toggle("a");
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await queue.idle();
    expect(write.mock.calls).toEqual([
      ["bookmark", "a", true],
      ["bookmark", "a", false],
    ]);
    expect(queue.selected("a")).toBe(false);
  });
  it("reverts optimistic state and reports failure", async () => {
    const failed = vi.fn();
    const queue = new ToggleQueue(vi.fn().mockRejectedValue(new Error("offline")), vi.fn(), failed);
    queue.attach("bookmark", ["a"]);
    queue.toggle("a");
    expect(queue.selected("a")).toBe(false);
    await queue.idle();
    expect(queue.selected("a")).toBe(true);
    expect(failed).toHaveBeenCalledOnce();
  });
});
it("badge cache distinguishes negative hits, missing entries and expired entries", () => {
  const entries = { a: { saved: true, expires: 200 }, b: { saved: false, expires: 200 } };
  expect(cachedBadge(entries, "a", 100)).toBe(true);
  expect(cachedBadge(entries, "b", 100)).toBe(false);
  expect(cachedBadge(entries, "a", 200)).toBeUndefined();
  expect(cachedBadge(entries, "missing", 100)).toBeUndefined();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("worker-owned sessions", () => {
  it("publishes lists before save and flushes toggles after the popup disconnects", async () => {
    const saving = deferred<Saved>();
    const writing = deferred<unknown>();
    const request = vi
      .fn()
      .mockImplementation((path: string) =>
        path === "/api/bookmarks" ? saving.promise : writing.promise,
      );
    const session = new SaveSession(
      request,
      "https://example.com",
      vi.fn().mockResolvedValue(undefined),
      async () => [list("a")],
      async () => [],
    );
    const paint = vi.fn();
    const disconnect = session.subscribe(paint);
    await Promise.resolve();
    expect(session.state.status).toBe("saving");
    expect(session.state.lists).toEqual([list("a")]);
    const toggling = session.toggle("a");
    disconnect();
    const paints = paint.mock.calls.length;
    saving.resolve({
      alreadyExists: false,
      bookmark: { id: "b", url: "https://example.com", title: "Example", listIds: [] },
    });
    await session.done;
    expect(request).toHaveBeenCalledWith("/api/bookmarks/b/lists/a", "PUT", {});
    // A later click is also retained while the first write is pending.
    const togglingAgain = session.toggle("a");
    writing.resolve({});
    await Promise.all([toggling, togglingAgain]);
    expect(request).toHaveBeenLastCalledWith("/api/bookmarks/b/lists/a", "DELETE", undefined);
    expect(session.state.selected.a).toBe(false);
    expect(paint).toHaveBeenCalledTimes(paints);
    const reopened = vi.fn();
    session.subscribe(reopened);
    expect(reopened).toHaveBeenCalledWith(session.state);
    expect(request.mock.calls.filter(([path]) => path === "/api/bookmarks")).toHaveLength(1);
  });
  it("waits for list writes before Undo", async () => {
    const writing = deferred<unknown>();
    const request = vi.fn().mockResolvedValue({});
    request.mockResolvedValueOnce({
      alreadyExists: false,
      bookmark: { id: "b", url: "https://example.com", title: "Example", listIds: [] },
    });
    const badge = vi.fn().mockResolvedValue(undefined);
    const session = new SaveSession(
      request,
      "https://example.com",
      badge,
      async () => [],
      async () => [],
    );
    await session.done;
    request.mockReturnValueOnce(writing.promise);
    const toggling = session.toggle("a");
    const undoing = session.undo();
    expect(request).toHaveBeenCalledTimes(2);
    writing.resolve({});
    await Promise.all([toggling, undoing]);
    expect(request).toHaveBeenLastCalledWith("/api/bookmarks/b", "DELETE");
    expect(session.state.status).toBe("undone");
    expect(badge.mock.calls).toEqual([[true], [false]]);
  });
});
it("invalidates a lookup awaiting tabs.get and aborts a lookup already fetching", async () => {
  const guard = new LookupGuard();
  const tab = deferred<string>();
  const ticket = guard.ticket();
  const fetcher = vi.fn();
  const lookup = (async () => {
    const url = await tab.promise;
    if (ticket.valid()) await fetcher(url, { signal: ticket.signal });
    ticket.finish();
  })();
  guard.invalidate();
  tab.resolve("https://example.com");
  await lookup;
  expect(fetcher).not.toHaveBeenCalled();
  const active = guard.ticket();
  guard.invalidate();
  expect(active.signal.aborted).toBe(true);
});
it("serializes a stale compare-and-clear with a new sign-in", async () => {
  const writes = new SessionWrites();
  let token: string | undefined = "old";
  const read = deferred<void>();
  const clear = writes.run(async () => {
    const current = token;
    await read.promise;
    if (current === "old") token = undefined;
  });
  const signin = writes.run(async () => {
    token = "new";
  });
  read.resolve();
  await Promise.all([clear, signin]);
  expect(token).toBe("new");
  await writes.run(async () => {
    if (token === "old") token = undefined;
  });
  expect(token).toBe("new");
});
