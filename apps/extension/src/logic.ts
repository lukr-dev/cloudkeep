import type { BookmarkDetail, List } from "../../web/lib/api.ts";
export type { List };
export type Saved = {
  alreadyExists: boolean;
  bookmark: Pick<BookmarkDetail, "id" | "url" | "title" | "listIds">;
};
export const DEFAULT_SERVER = "https://cloudkeep.toastnet.work";
export type Settings = { server: string; token?: string; badge: boolean };
export function eligible(url: string | undefined): url is string {
  if (!url) return false;
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
export function serverOrigin(value: string): string {
  const url = new URL(value);
  if (!eligible(value) || url.username || url.password)
    throw new Error("Enter an HTTP or HTTPS server URL.");
  return url.origin;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function client(
  settings: Settings,
  unauthorized: () => Promise<void>,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  return async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
    const response = await fetcher(settings.server + path, {
      method,
      signal,
      credentials: "omit",
      headers: {
        ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) await unauthorized();
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new ApiError(
        response.status,
        typeof data.error === "string" ? data.error : `Request failed (${response.status})`,
      );
    return data as T;
  };
}
export async function fetchLists(request: <T>(path: string) => Promise<T>): Promise<List[]> {
  const lists: List[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await request<{ items: List[] }>(`/api/lists?limit=50&offset=${offset}`);
    lists.push(...page.items);
    if (page.items.length < 50) return lists;
  }
}
export type ListCache = { server: string; token: string; items: List[] };
export function cachedLists(cache: ListCache | undefined, settings: Settings): List[] {
  return cache?.server === settings.server && cache.token === settings.token ? cache.items : [];
}
export type BadgeEntry = { saved: boolean; expires: number };
export function cachedBadge(
  entries: Record<string, BadgeEntry>,
  url: string,
  now = Date.now(),
): boolean | undefined {
  const entry = entries[url];
  return entry && entry.expires > now ? entry.saved : undefined;
}
// Each list has one in-flight request; later clicks are coalesced to the latest intent.
export class ToggleQueue {
  private id?: string;
  private confirmed = new Set<string>();
  private desired = new Map<string, boolean>();
  private running = new Set<string>();
  constructor(
    private write: (bookmark: string, list: string, selected: boolean) => Promise<unknown>,
    private changed: () => void,
    private failed: (error: unknown) => void,
  ) {}
  selected(list: string) {
    return this.desired.get(list) ?? this.confirmed.has(list);
  }
  toggle(list: string) {
    this.desired.set(list, !this.selected(list));
    this.changed();
    void this.flush(list);
  }
  attach(id: string, lists: string[]) {
    this.id = id;
    this.confirmed = new Set(lists);
    this.changed();
    for (const list of this.desired.keys()) void this.flush(list);
  }
  async idle() {
    while (this.running.size) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  private async flush(list: string) {
    if (!this.id || this.running.has(list)) return;
    this.running.add(list);
    try {
      while (this.desired.has(list)) {
        const selected = this.desired.get(list)!;
        if (selected === this.confirmed.has(list)) {
          this.desired.delete(list);
          break;
        }
        try {
          await this.write(this.id, list, selected);
          if (selected) this.confirmed.add(list);
          else this.confirmed.delete(list);
        } catch (error) {
          if (this.desired.get(list) === selected) this.desired.delete(list);
          this.failed(error);
        }
      }
    } finally {
      this.running.delete(list);
      this.changed();
    }
  }
}

export type SessionState = {
  status: "saving" | "saved" | "undone" | "failed";
  result?: Saved;
  lists: List[];
  selected: Record<string, boolean>;
  error?: string;
  unauthorized?: boolean;
  undoing: boolean;
};

// Owned by the worker; removing a subscriber never cancels queued writes.
export class SaveSession {
  state: SessionState = { status: "saving", lists: [], selected: {}, undoing: false };
  readonly queue: ToggleQueue;
  readonly done: Promise<void>;
  private listeners = new Set<(state: SessionState) => void>();
  private touched = new Set<string>();
  constructor(
    private api: ReturnType<typeof client>,
    url: string,
    private saved: (saved: boolean) => Promise<void>,
    loadLists: () => Promise<List[]>,
    cache: () => Promise<List[]>,
  ) {
    this.queue = new ToggleQueue(
      (id, list, selected) =>
        api(
          `/api/bookmarks/${encodeURIComponent(id)}/lists/${encodeURIComponent(list)}`,
          selected ? "PUT" : "DELETE",
          selected ? {} : undefined,
        ),
      () => this.publish(),
      (error) => this.fail(error),
    );
    this.done = this.save(url);
    let fresh = false;
    void cache()
      .then((lists) => {
        if (!fresh) {
          this.state.lists = lists;
          this.publish();
        }
      })
      .catch(() => {});
    void loadLists()
      .then((lists) => {
        fresh = true;
        this.state.lists = lists;
        this.publish();
      })
      .catch((error) => this.fail(error));
  }
  subscribe(listener: (state: SessionState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish() {
    this.state.selected = Object.fromEntries(
      [
        ...new Set([
          ...this.touched,
          ...this.state.lists.map((list) => list.id),
          ...(this.state.result?.bookmark.listIds ?? []),
        ]),
      ].map((id) => [id, this.queue.selected(id)]),
    );
    for (const listener of this.listeners) listener(this.state);
  }
  private fail(error: unknown) {
    this.state.error = error instanceof Error ? error.message : "Request failed.";
    this.state.unauthorized ||= error instanceof ApiError && error.status === 401;
    this.publish();
  }
  private async save(url: string) {
    try {
      const result = await this.api<Saved>("/api/bookmarks", "POST", { url });
      this.state.result = result;
      this.state.status = "saved";
      this.queue.attach(result.bookmark.id, result.bookmark.listIds);
      await this.saved(true).catch(() => {});
    } catch (error) {
      this.state.status = "failed";
      this.fail(error);
    }
  }
  async toggle(list: string) {
    if (this.state.undoing || this.state.status === "undone" || this.state.status === "failed")
      return;
    this.touched.add(list);
    this.queue.toggle(list);
    await this.done;
    await this.queue.idle();
  }
  async undo() {
    if (this.state.undoing || this.state.status !== "saved" || this.state.result?.alreadyExists)
      return;
    this.state.undoing = true;
    this.publish();
    try {
      await this.done;
      await this.queue.idle();
      await this.api(
        `/api/bookmarks/${encodeURIComponent(this.state.result!.bookmark.id)}`,
        "DELETE",
      );
      this.state.status = "undone";
      await this.saved(false).catch(() => {});
    } catch (error) {
      this.fail(error);
    } finally {
      this.state.undoing = false;
      this.publish();
    }
  }
}

// All session mutations in the worker share this chain, including read/compare/remove.
export class SessionWrites {
  private pending: Promise<unknown> = Promise.resolve();
  run<T>(write: () => Promise<T>): Promise<T> {
    const next = this.pending.then(write);
    this.pending = next.catch(() => {});
    return next;
  }
}

export class LookupGuard {
  private revision = 0;
  private controllers = new Set<AbortController>();
  invalidate() {
    this.revision++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
  ticket() {
    const revision = this.revision;
    const controller = new AbortController();
    this.controllers.add(controller);
    return {
      signal: controller.signal,
      valid: () => revision === this.revision,
      finish: () => {
        this.controllers.delete(controller);
      },
    };
  }
}
