import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { listsStore } from "../composables/lists.ts";

const list = { id: "list-1", name: "Reading", count: 1, createdAt: 1, updatedAt: 1 };
afterEach(() => {
  listsStore.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("shared lists", () => {
  it("dedupes initial consumers and refreshes while retaining the loaded catalog", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const first = listsStore.ensure();
    expect(listsStore.ensure()).toBe(first);
    expect(listsStore.loading.value).toBe(true);
    resolve(Response.json({ items: [list] }));
    await first;
    await listsStore.ensure();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(listsStore.loaded.value).toBe(true);
    expect(listsStore.loading.value).toBe(false);

    const refresh = listsStore.refresh();
    expect(listsStore.ensure()).toBe(refresh);
    expect(listsStore.lists.value).toEqual([list]);
    resolve(Response.json({ items: [{ ...list, count: 2 }] }));
    await refresh;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(listsStore.lists.value[0]?.count).toBe(2);
  });

  it("refetches after an in-flight request so mutations are never answered with stale data", async () => {
    const responses: ((response: Response) => void)[] = [];
    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise<Response>((done) => responses.push(done)));
    vi.stubGlobal("fetch", fetcher);
    const initial = listsStore.ensure();
    const first = listsStore.refresh();
    expect(listsStore.refresh()).toBe(first);
    responses[0]!(Response.json({ items: [list] }));
    await initial;
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    responses[1]!(Response.json({ items: [{ ...list, count: 2 }] }));
    await first;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(listsStore.lists.value[0]?.count).toBe(2);
    expect(listsStore.loading.value).toBe(false);
  });

  it("exposes errors, keeps previous lists, and allows retries", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [list] }))
      .mockResolvedValueOnce(Response.json({ message: "Unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetcher);
    await listsStore.ensure();
    await expect(listsStore.refresh()).rejects.toThrow("Unavailable");
    expect(listsStore.error.value).toBe("Unavailable");
    expect(listsStore.loading.value).toBe(false);
    expect(listsStore.lists.value).toEqual([list]);
    await listsStore.refresh();
    expect(listsStore.error.value).toBe("");
    expect(listsStore.lists.value).toEqual([]);
  });

  it("retries a failed initial load and clears all session state", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Offline"))
        .mockResolvedValueOnce(Response.json({ items: [list] })),
    );
    await expect(listsStore.ensure()).rejects.toThrow("Could not connect");
    expect(listsStore.loaded.value).toBe(false);
    await listsStore.ensure();
    listsStore.clear();
    expect(listsStore.lists.value).toEqual([]);
    expect(listsStore.loaded.value).toBe(false);
    expect(listsStore.loading.value).toBe(false);
    expect(listsStore.error.value).toBe("");
  });

  it("ignores an old user's response after sign-out without disturbing a new request", async () => {
    let oldResponse!: (response: Response) => void;
    let newResponse!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((done) => {
              oldResponse = done;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise<Response>((done) => {
              newResponse = done;
            }),
        ),
    );
    const old = listsStore.ensure();
    listsStore.clear();
    const next = listsStore.ensure();
    oldResponse(Response.json({ items: [list] }));
    await old;
    expect(listsStore.lists.value).toEqual([]);
    expect(listsStore.loaded.value).toBe(false);
    expect(listsStore.loading.value).toBe(true);
    expect(listsStore.ensure()).toBe(next);
    newResponse(Response.json({ items: [{ ...list, id: "other-user" }] }));
    await next;
    expect(listsStore.lists.value[0]?.id).toBe("other-user");
  });

  it("revalidates once after a minute hidden, dedupes, and removes its listener", async () => {
    vi.useFakeTimers();
    const visibility = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("document", visibility);
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({ items: [list] })));
    vi.stubGlobal("fetch", fetcher);
    const stop = listsStore.revalidateOnVisible();
    const toggle = (hidden: boolean) => {
      visibility.hidden = hidden;
      visibility.dispatchEvent(new Event("visibilitychange"));
    };
    toggle(true);
    await vi.advanceTimersByTimeAsync(61_000);
    toggle(false);
    expect(fetcher).not.toHaveBeenCalled();
    await listsStore.ensure();
    toggle(true);
    await vi.advanceTimersByTimeAsync(1000);
    toggle(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    toggle(true);
    await vi.advanceTimersByTimeAsync(61_000);
    toggle(false);
    const revalidation = listsStore.ensure();
    toggle(false);
    await revalidation;
    expect(fetcher).toHaveBeenCalledTimes(2);
    stop();
    toggle(true);
    await vi.advanceTimersByTimeAsync(61_000);
    toggle(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
