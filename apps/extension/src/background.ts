import {
  cachedBadge,
  cachedLists,
  client,
  eligible,
  fetchLists,
  LookupGuard,
  SaveSession,
  SessionWrites,
  serverOrigin,
  type BadgeEntry,
} from "./logic.ts";
import { readLists, settings } from "./storage.ts";
const writes = new SessionWrites();
function clearToken(token?: string) {
  return writes.run(async () => {
    if ((await settings()).token === token)
      await chrome.storage.local.remove(["token", "listCache"]);
  });
}
const guard = new LookupGuard();
const TTL = 60_000;
let entries: Record<string, BadgeEntry> = {};
let generation = 0;
let enabled = false;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const revisions = new Map<number, number>();
async function badge(tabId: number, saved: boolean) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#1f7a5a" });
  await chrome.action.setBadgeText({ tabId, text: saved ? "✓" : "" });
}
async function remember(url: string, saved: boolean) {
  const now = Date.now();
  entries = Object.fromEntries(
    Object.entries(entries)
      .filter(([, entry]) => entry.expires > now)
      .slice(-199),
  );
  entries[url] = { saved, expires: now + TTL };
  await chrome.storage.session.set({ badgeCache: entries });
}
async function lookup(tabId: number, revision: number) {
  const ticket = guard.ticket();
  try {
    const epoch = generation;
    const config = await settings();
    if (!enabled || !config.badge || !config.token) return;
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url;
    let saved = false;
    if (eligible(url)) {
      const cached = cachedBadge(entries, url);
      if (cached !== undefined) saved = cached;
      else {
        if (
          !enabled ||
          !ticket.valid() ||
          generation !== epoch ||
          revisions.get(tabId) !== revision
        )
          return;
        const result = await client(
          config,
          () => clearToken(config.token),
          fetch,
          ticket.signal,
        )<{
          bookmark: { id: string } | null;
        }>(`/api/bookmarks/lookup?url=${encodeURIComponent(url)}`);
        if (generation !== epoch || revisions.get(tabId) !== revision) return;
        saved = Boolean(result.bookmark);
        await remember(url, saved);
      }
    }
    if (enabled && generation === epoch && revisions.get(tabId) === revision)
      await badge(tabId, saved);
  } finally {
    ticket.finish();
  }
}
function schedule(tabId: number) {
  const revision = (revisions.get(tabId) ?? 0) + 1;
  revisions.set(tabId, revision);
  clearTimeout(timers.get(tabId));
  void badge(tabId, false).catch(() => {});
  timers.set(
    tabId,
    setTimeout(() => {
      timers.delete(tabId);
      void lookup(tabId, revision).catch(() => {});
    }, 150),
  );
}
function activated(info: chrome.tabs.OnActivatedInfo) {
  void ready.then(() => enabled && schedule(info.tabId));
}
function updated(tabId: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) {
  if (info.url && tab.active) void ready.then(() => enabled && schedule(tabId));
}
function removed(tabId: number) {
  clearTimeout(timers.get(tabId));
  timers.delete(tabId);
  revisions.delete(tabId);
  for (const key of sessions.keys()) if (JSON.parse(key)[0] === tabId) sessions.delete(key);
}
async function configure(reset = false) {
  guard.invalidate();
  const epoch = ++generation;
  const config = await settings();
  if (epoch !== generation) return;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  enabled = config.badge && Boolean(config.token);
  if (reset || !enabled) {
    entries = {};
    await chrome.storage.session.remove("badgeCache");
  } else
    entries =
      (await chrome.storage.session.get<{ badgeCache?: Record<string, BadgeEntry> }>("badgeCache"))
        .badgeCache ?? {};
  if (epoch !== generation) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs)
    if (tab.id !== undefined) {
      if (enabled && tab.active) schedule(tab.id);
      else await badge(tab.id, false);
    }
}
// MV3 only wakes a stopped worker for listeners registered synchronously at startup;
// while the badge is off they return before any lookup.
chrome.tabs.onActivated.addListener(activated);
chrome.tabs.onUpdated.addListener(updated);
chrome.tabs.onRemoved.addListener(removed);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.badge || changes.token || changes.server)) {
    guard.invalidate();
    if (changes.token || changes.server) sessions.clear();
    void configure(true).catch(() => {});
  }
});

const sessions = new Map<string, Promise<SaveSession>>();
const ports = new Map<
  chrome.runtime.Port,
  { tabId: number; url: string; unsubscribe?: () => void }
>();
function session(tabId: number, url: string) {
  const key = JSON.stringify([tabId, url]);
  let pending = sessions.get(key);
  if (!pending) {
    pending = (async () => {
      const config = await settings();
      if (!config.token) throw new Error("Sign in to save pages");
      const api = client(config, () => clearToken(config.token));
      const current = new SaveSession(
        api,
        url,
        async (saved) => {
          const epoch = generation;
          const latest = await settings();
          if (!latest.badge || latest.token !== config.token || latest.server !== config.server)
            return;
          revisions.set(tabId, (revisions.get(tabId) ?? 0) + 1);
          clearTimeout(timers.get(tabId));
          await remember(url, saved);
          const tab = await chrome.tabs.get(tabId).catch(() => undefined);
          if (tab?.url === url && enabled && epoch === generation) await badge(tabId, saved);
        },
        async () => {
          const items = await fetchLists(api);
          await writes.run(async () => {
            const latest = await settings();
            if (latest.token === config.token && latest.server === config.server)
              await chrome.storage.local.set({
                listCache: { server: config.server, token: config.token, items },
              });
          });
          return items;
        },
        async () => cachedLists(await readLists(), config),
      );
      return current;
    })();
    sessions.set(key, pending);
    void pending.catch(() => {
      if (sessions.get(key) === pending) sessions.delete(key);
    });
  }
  return pending;
}
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup" || port.sender?.id !== chrome.runtime.id) return;
  port.onMessage.addListener((message) => {
    if (message.type !== "watch" || typeof message.tabId !== "number" || !eligible(message.url))
      return;
    const watching = {
      tabId: message.tabId,
      url: message.url,
      unsubscribe: undefined as (() => void) | undefined,
    };
    ports.get(port)?.unsubscribe?.();
    ports.set(port, watching);
    void session(watching.tabId, watching.url)
      .then((current) => {
        if (ports.get(port) !== watching) return;
        watching.unsubscribe = current.subscribe((state) => {
          try {
            port.postMessage(state);
          } catch {
            /* Popup closed. */
          }
        });
      })
      .catch((error: unknown) => {
        try {
          port.postMessage({
            unauthorized: true,
            error: error instanceof Error ? error.message : "Request failed.",
          });
        } catch {
          /* Popup closed. */
        }
      });
  });
  port.onDisconnect.addListener(() => {
    ports.get(port)?.unsubscribe?.();
    ports.delete(port);
  });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const task = async () => {
    switch (message?.type) {
      case "setSession":
        if (
          typeof message.token !== "string" ||
          !message.token ||
          typeof message.server !== "string"
        )
          throw new Error("Invalid session");
        await writes.run(async () => {
          await chrome.storage.local.remove("listCache");
          await chrome.storage.local.set({
            server: serverOrigin(message.server),
            token: message.token,
          });
        });
        return;
      case "signOut":
      case "clearSession":
        await clearToken(message.token);
        return;
      case "save":
      case "toggle":
      case "undo": {
        if (typeof message.tabId !== "number" || !eligible(message.url))
          throw new Error("Invalid page");
        const current = await session(message.tabId, message.url);
        if (message.type === "save") await current.done;
        else if (message.type === "toggle" && typeof message.listId === "string")
          await current.toggle(message.listId);
        else if (message.type === "undo") await current.undo();
        return;
      }
      default:
        throw new Error("Unknown intent");
    }
  };
  void task().then(
    () => respond({ ok: true }),
    (error: unknown) =>
      respond({ ok: false, error: error instanceof Error ? error.message : "Request failed." }),
  );
  return true;
});
const ready = configure().catch(() => {});
