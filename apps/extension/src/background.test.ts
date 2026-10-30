import { afterEach, expect, it, vi } from "vite-plus/test";

function event<T>() {
  const listeners: T[] = [];
  return {
    listeners,
    addListener: (listener: T) => {
      listeners.push(listener);
    },
  };
}
async function worker() {
  vi.resetModules();
  vi.useFakeTimers();
  const data: Record<string, unknown> = {
    token: "old",
    server: "https://keep.example",
    badge: true,
  };
  const changes =
    event<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  const messages =
    event<
      (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        respond: (response: unknown) => void,
      ) => unknown
    >();
  const getTab = vi.fn().mockResolvedValue({ id: 1, url: "https://example.com" });
  const local = {
    get: vi.fn(async () => ({ ...data })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(data, values);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of [keys].flat()) delete data[key];
    }),
  };
  vi.stubGlobal("chrome", {
    action: { setBadgeBackgroundColor: vi.fn(), setBadgeText: vi.fn() },
    tabs: {
      get: getTab,
      query: vi.fn().mockResolvedValue([{ id: 1, active: true }]),
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event(),
    },
    storage: {
      local,
      session: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
      onChanged: changes,
    },
    runtime: { id: "extension", onMessage: messages, onConnect: event() },
  });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"bookmark":null}'));
  vi.stubGlobal("fetch", fetcher);
  await import("./background.ts");
  await vi.advanceTimersByTimeAsync(0);
  function send(message: unknown) {
    return new Promise((resolve) => {
      messages.listeners[0](message, { id: "extension" }, resolve);
    });
  }
  return { data, changes, getTab, fetcher, local, send };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("does not fetch when badges are disabled while tabs.get is pending", async () => {
  const { data, changes, getTab, fetcher } = await worker();
  let release!: (tab: { url: string }) => void;
  getTab.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(150);
  expect(getTab).toHaveBeenCalledOnce();
  data.badge = false;
  changes.listeners[0]({ badge: { oldValue: true, newValue: false } }, "local");
  release({ url: "https://example.com" });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).not.toHaveBeenCalled();
});
it("aborts an in-flight lookup when the account changes", async () => {
  const { changes, fetcher } = await worker();
  fetcher.mockImplementation(() => new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(150);
  const signal = fetcher.mock.calls[0][1]?.signal;
  expect(signal?.aborted).toBe(false);
  changes.listeners[0]({ token: { oldValue: "old", newValue: "new" } }, "local");
  expect(signal?.aborted).toBe(true);
});
it("a stale 401 clear cannot remove the worker's newly stored session", async () => {
  const { data, send } = await worker();
  await expect(
    send({ type: "setSession", server: "https://keep.example", token: "new" }),
  ).resolves.toEqual({ ok: true });
  await expect(send({ type: "clearSession", token: "old" })).resolves.toEqual({ ok: true });
  expect(data.token).toBe("new");
  await send({ type: "signOut", token: "new" });
  expect(data.token).toBeUndefined();
});
