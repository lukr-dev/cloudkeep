import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import ts from "typescript";
import { expect, it, vi } from "vite-plus/test";
import { ApiError, bookmarkQuery } from "./api.ts";
import { resource } from "./resource.ts";
import type { BookmarkDetail, List, Tag } from "./api.ts";
import type { NativeState } from "./native.ts";

const cached: List = { id: "cached", name: "Reading", count: 2, createdAt: 1, updatedAt: 1 };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

// Exercise the actual SFC startup with network promises held open. Native layout still needs a phone.
function start(pendingUrl = "https://shared.example", colorScheme?: string) {
  const { descriptor } = parse(readFileSync(new URL("./App.vue", import.meta.url), "utf8"));
  const { content } = compileScript(descriptor, { id: "mobile-test" });
  const { outputText } = ts.transpileModule(content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const events = new Map<string, (value: unknown, changed?: unknown) => void>();
  let mounted: () => Promise<void> = async () => {};
  let unmounted = () => {};
  const state: NativeState = {
    server: "https://cloudkeep.example",
    token: "session",
    shareMode: "ask",
    defaultList: "",
    pendingUrl,
    lists: [cached],
  };
  const native = vi.fn(async (action: string) => (action === "getState" ? state : true));
  let resolveLists!: (lists: List[]) => void;
  let rejectLists!: (cause: Error) => void;
  const listRequest = new Promise<List[]>((resolve, reject) => {
    resolveLists = resolve;
    rejectLists = reject;
  });
  let resolveTags!: (tags: Tag[]) => void;
  const tagRequest = new Promise<Tag[]>((resolve) => {
    resolveTags = resolve;
  });
  let listCalls = 0;
  let tagCalls = 0;
  const allItems = vi.fn((path: string) =>
    path === "/api/lists"
      ? listCalls++ === 0
        ? listRequest
        : Promise.resolve([cached])
      : tagCalls++ === 0
        ? tagRequest
        : Promise.resolve([]),
  );
  const api = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    items: [],
    total: 0,
  }));
  const modules: Record<string, unknown> = {
    vue: {
      ...vue,
      provide: vi.fn(),
      onMounted: (callback: typeof mounted) => (mounted = callback),
      onUnmounted: (callback: typeof unmounted) => (unmounted = callback),
    },
    "./native.ts": { native, hasNativeHost: true },
    "./api.ts": { allItems, api, ApiError, bookmarkQuery },
    "./resource.ts": { resource },
    "./components/AppBar.vue": {},
    "./components/BottomNav.vue": {},
    "./components/Button.vue": {},
    "./components/ConfirmDialog.vue": {},
    "./components/Snackbar.vue": {},
    "./screens/LoginScreen.vue": {},
    "./screens/FeedScreen.vue": {},
    "./screens/DetailScreen.vue": {},
    "./screens/ListsScreen.vue": {},
    "./screens/AddScreen.vue": {},
    "./screens/ShareScreen.vue": {},
    "./screens/SettingsScreen.vue": {},
  };
  const exports: { default?: { setup: (...args: unknown[]) => Record<string, unknown> } } = {};
  runInNewContext(outputText, {
    exports,
    setTimeout,
    clearTimeout,
    require: (name: string) => modules[name],
    lynx: {
      __globalProps: colorScheme ? { colorScheme } : undefined,
      getJSModule: () => ({
        addListener: (name: string, callback: (value: unknown, changed?: unknown) => void) =>
          events.set(name, callback),
        removeListener: (name: string) => events.delete(name),
      }),
    },
  });
  const app = exports.default!.setup({}, { expose: vi.fn() }) as {
    navigate: (screen: string) => Promise<void>;
    bookmarks: vue.Ref<{ id: string }[]>;
    loading: vue.Ref<boolean>;
    detail: vue.Ref<Pick<BookmarkDetail, "id" | "tags" | "listIds"> | undefined>;
    tagName: vue.Ref<string>;
    tags: vue.Ref<Tag[]>;
    showDetail: (id: string) => Promise<void>;
    detailList: (id: string) => Promise<void>;
    addTag: () => Promise<void>;
    removeTag: (id: string) => Promise<void>;
    saveList: () => Promise<void>;
    deleteList: (list: List) => void;
    deleteBookmark: (id: string) => void;
    confirmDelete: () => Promise<void>;
    save: () => Promise<void>;
    endShare: (returnToApp: boolean) => Promise<void>;
    refresh: () => Promise<void>;
    logout: () => Promise<void>;
    busy: vue.Ref<boolean>;
    dark: vue.Ref<boolean>;
    confirm: vue.Ref<{ label: string; action: () => Promise<void> } | undefined>;
    editingList: vue.Ref<string>;
    newListName: vue.Ref<string>;
    ready: vue.Ref<boolean>;
    screen: vue.Ref<string>;
    url: vue.Ref<string>;
    lists: vue.Ref<List[]>;
    listsLoading: vue.Ref<boolean>;
    selectedLists: vue.Ref<string[]>;
    saved: vue.Ref<boolean>;
    state: vue.Ref<NativeState>;
    error: vue.Ref<string>;
    q: vue.Ref<string>;
    listFilter: vue.Ref<string>;
    tagFilter: vue.Ref<string>;
    allFilters: () => Promise<void>;
    clearFilters: () => Promise<void>;
    selectList: (id: string) => Promise<void>;
    search: (value: string) => void;
  };
  void mounted();
  return {
    app,
    native,
    events,
    api,
    allItems,
    resolveLists,
    rejectLists,
    resolveTags,
    settle: async () => {
      resolveLists([cached]);
      resolveTags([]);
      await tick();
    },
    unmount: () => unmounted(),
  };
}

it("opens the cached share picker without waiting for lists or tags", async () => {
  const { app, native, api, resolveLists } = start();
  await tick();
  expect(app.ready.value).toBe(true);
  expect(app.screen.value).toBe("add");
  expect(app.url.value).toBe("https://shared.example");
  expect(app.lists.value).toEqual([cached]);
  expect(app.listsLoading.value).toBe(true);
  expect(api).not.toHaveBeenCalled();
  resolveLists([{ ...cached, name: "Updated" }]);
  await tick();
  expect(app.lists.value[0]!.name).toBe("Updated");
  expect(app.listsLoading.value).toBe(false);
  expect(native).toHaveBeenCalledWith(
    "cacheLists",
    expect.objectContaining({ lists: app.lists.value }),
  );
});

it("opens a warm share in the existing component and removes its listener on unmount", async () => {
  const { app, events, unmount } = start("");
  await tick();
  app.selectedLists.value = ["previous-list"];
  app.saved.value = true;
  events.get("cloudkeepShare")!("https://second.example");
  expect(app.screen.value).toBe("add");
  expect(app.url.value).toBe("https://second.example");
  expect(app.selectedLists.value).toEqual([]);
  expect(app.saved.value).toBe(false);
  unmount();
  expect(events.has("cloudkeepShare")).toBe(false);
});

it("keeps selections and avoids duplicate fetches when the startup handshake replays the share", async () => {
  const { app, events, allItems } = start();
  await tick();
  app.selectedLists.value = [cached.id];
  events.get("cloudkeepShare")!("https://shared.example");
  expect(app.selectedLists.value).toEqual([cached.id]);
  expect(allItems).toHaveBeenCalledTimes(2);
});

it("ignores a previous account's late catalog failure", async () => {
  const { app, rejectLists, native } = start();
  await tick();
  app.state.value = { ...app.state.value, token: "new-session" };
  rejectLists(new ApiError(401, "Old session expired"));
  await tick();
  expect(app.state.value.token).toBe("new-session");
  expect(app.error.value).toBe("");
  expect(native).not.toHaveBeenCalledWith("clearCredentials");
});

it("starts with the native theme and follows valid theme events", async () => {
  const { app, events, unmount } = start("", "dark");
  await tick();
  expect(app.dark.value).toBe(true);
  events.get("cloudkeepTheme")!("light");
  expect(app.dark.value).toBe(false);
  events.get("cloudkeepTheme")!("invalid");
  expect(app.dark.value).toBe(false);
  events.get("cloudkeepTheme")!("dark");
  expect(app.dark.value).toBe(true);
  unmount();
  expect(events.has("cloudkeepTheme")).toBe(false);
  expect(events.has("cloudkeepBack")).toBe(false);
});

it("defaults to light without native global props", async () => {
  const { app } = start("");
  await tick();
  expect(app.dark.value).toBe(false);
});

it("returns from detail to bookmarks on native Back and releases the handler", async () => {
  const { app, events, native } = start("");
  await tick();
  app.screen.value = "detail";
  await tick();
  expect(native).toHaveBeenCalledWith("setBackHandler", { enabled: true });
  events.get("cloudkeepBack")!(undefined);
  await tick();
  expect(app.screen.value).toBe("bookmarks");
  expect(native).toHaveBeenLastCalledWith("setBackHandler", { enabled: false });
});

it("cancels a share on native Back and returns to the previous app", async () => {
  const { app, events, native } = start();
  await tick();
  expect(native).toHaveBeenCalledWith("setBackHandler", { enabled: true });
  events.get("cloudkeepBack")!(undefined);
  await tick();
  expect(native).toHaveBeenCalledWith("clearPendingSharedUrl");
  expect(native).toHaveBeenCalledWith("finishShare");
  expect(app.url.value).toBe("");
  expect(app.screen.value).toBe("bookmarks");
});

it("dismisses confirmation and rename before navigating back from Lists", async () => {
  const { app, events } = start("");
  await tick();
  app.screen.value = "lists";
  app.editingList.value = cached.id;
  app.newListName.value = "Draft";
  const action = vi.fn(async () => {});
  app.confirm.value = { label: "Delete?", action };
  events.get("cloudkeepBack")!(undefined);
  expect(app.confirm.value).toBeUndefined();
  expect(action).not.toHaveBeenCalled();
  expect(app.editingList.value).toBe(cached.id);
  events.get("cloudkeepBack")!(undefined);
  expect(app.editingList.value).toBe("");
  expect(app.newListName.value).toBe("");
  expect(app.screen.value).toBe("lists");
  events.get("cloudkeepBack")!(undefined);
  await tick();
  expect(app.screen.value).toBe("bookmarks");
});

it("toggles the list filter, keeps search for All, and re-searches when cleared", async () => {
  const { app, api } = start("");
  await tick();
  app.q.value = "reading";
  await app.selectList(cached.id);
  expect(app.listFilter.value).toBe(cached.id);
  await app.selectList(cached.id);
  expect(app.listFilter.value).toBe("");
  app.listFilter.value = cached.id;
  app.tagFilter.value = "design";
  await app.allFilters();
  expect(app.q.value).toBe("reading");
  expect(app.listFilter.value).toBe("");
  expect(app.tagFilter.value).toBe("");
  const requests = api.mock.calls.length;
  app.search("");
  await tick();
  expect(app.q.value).toBe("");
  expect(api).toHaveBeenCalledTimes(requests + 1);
  app.q.value = "no matches";
  await app.clearFilters();
  expect(app.q.value).toBe("");
});

it("keeps loaded data and navigation unblocked while the catalog is in flight", async () => {
  const { app, allItems, api } = start("");
  await tick();
  void app.navigate("lists");
  await tick();
  expect(app.busy.value).toBe(false);
  expect(allItems).toHaveBeenCalledTimes(2);
  await app.navigate("bookmarks");
  expect(api).toHaveBeenCalledTimes(1);
});

it("reuses the catalog for a warm share while startup is still loading", async () => {
  const { events, allItems } = start("");
  await tick();
  events.get("cloudkeepShare")!("https://second.example");
  await tick();
  expect(allItems).toHaveBeenCalledTimes(2);
});

it("makes no requests when switching loaded tabs or returning from detail", async () => {
  const { app, api, allItems, settle } = start("");
  await settle();
  for (const screen of ["lists", "settings", "add", "bookmarks"]) await app.navigate(screen);
  api.mockResolvedValueOnce({ bookmark: { id: "bookmark", tags: [], listIds: [] } });
  await app.showDetail("bookmark");
  await app.navigate("bookmarks");
  await tick();
  expect(api).toHaveBeenCalledTimes(2);
  expect(allItems).toHaveBeenCalledTimes(2);
  expect(app.busy.value).toBe(false);
});

it.each([
  "detailList",
  "saveList",
  "save",
  "deleteList",
  "deleteBookmark",
  "addTag",
  "removeTag",
] as const)(
  "%s refreshes only the affected catalog resource and invalidates feed cards when needed",
  async (mutation) => {
    const { app, api, allItems, settle } = start("");
    await settle();
    app.detail.value = { id: "bookmark", tags: [], listIds: [] };
    app.tagName.value = "design";
    app.newListName.value = "New list";
    app.url.value = "https://example.com";
    app.screen.value = "detail";
    api.mockResolvedValue({
      tag: { id: "tag", name: "design", source: "manual" },
      alreadyExists: false,
    });
    allItems.mockClear();
    if (mutation === "deleteList") {
      app.deleteList(cached);
      await app.confirmDelete();
    } else if (mutation === "deleteBookmark") {
      api.mockResolvedValue({ items: [], total: 0 });
      app.deleteBookmark("bookmark");
      await app.confirmDelete();
    } else if (mutation === "detailList") await app.detailList(cached.id);
    else if (mutation === "removeTag") await app.removeTag("tag");
    else await app[mutation]();
    await tick();
    const tagMutation = mutation === "addTag" || mutation === "removeTag";
    expect(allItems.mock.calls).toEqual([[tagMutation ? "/api/tags" : "/api/lists"]]);
    api.mockResolvedValue({ items: [], total: 0 });
    const requests = api.mock.calls.length;
    await app.navigate("bookmarks");
    await tick();
    expect(api).toHaveBeenCalledTimes(
      requests + (mutation === "saveList" || mutation === "deleteBookmark" ? 0 : 1),
    );
    await app.navigate("lists");
    await app.navigate("bookmarks");
    await tick();
    expect(allItems).toHaveBeenCalledTimes(1);
  },
);

it("retries a failed catalog on navigation without blocking it", async () => {
  const { app, rejectLists, resolveTags, allItems } = start("");
  await tick();
  resolveTags([]);
  rejectLists(new Error("Offline"));
  await tick();
  await app.navigate("lists");
  await tick();
  expect(allItems.mock.calls.map(([path]) => path)).toEqual([
    "/api/lists",
    "/api/tags",
    "/api/lists",
  ]);
  expect(app.lists.value).toEqual([cached]);
  expect(app.busy.value).toBe(false);
});

it("queues a lists refresh after a save that overlaps startup", async () => {
  const { app, api, allItems, resolveLists } = start();
  await tick();
  api.mockResolvedValue({ alreadyExists: false });
  await app.save();
  expect(allItems).toHaveBeenCalledTimes(2);
  resolveLists([{ ...cached, count: 1 }]);
  await tick();
  expect(allItems.mock.calls.map(([path]) => path)).toEqual([
    "/api/lists",
    "/api/tags",
    "/api/lists",
  ]);
  expect(app.lists.value[0]!.count).toBe(2);
});

it("manual refresh forces feed, lists and tags", async () => {
  const { app, api, allItems, settle } = start("");
  await settle();
  api.mockClear();
  allItems.mockClear();
  await app.refresh();
  expect(api).toHaveBeenCalledTimes(1);
  expect(allItems.mock.calls).toEqual([["/api/lists"], ["/api/tags"]]);
});

it("revalidates after a long resume, keeping visible cards and navigation available", async () => {
  const { app, events, api, allItems, settle, unmount } = start("");
  await settle();
  app.bookmarks.value = [{ id: "visible" }];
  api.mockImplementationOnce(() => new Promise(() => {}));
  events.get("cloudkeepResume")!(60_000);
  expect(api).toHaveBeenCalledTimes(1);
  events.get("cloudkeepResume")!(60_001);
  expect(api).toHaveBeenCalledTimes(2);
  expect(allItems).toHaveBeenCalledTimes(4);
  expect(app.bookmarks.value).toEqual([{ id: "visible" }]);
  expect(app.loading.value).toBe(true);
  expect(app.busy.value).toBe(false);
  unmount();
  expect(events.has("cloudkeepResume")).toBe(false);
});

it("defers resume refresh until the share picker closes and keeps its selections", async () => {
  const { app, events, api, allItems, settle } = start();
  await settle();
  app.selectedLists.value = [cached.id];
  events.get("cloudkeepResume")!(90_000);
  expect(api).not.toHaveBeenCalled();
  expect(allItems).toHaveBeenCalledTimes(2);
  expect(app.selectedLists.value).toEqual([cached.id]);
  await app.endShare(false);
  await tick();
  expect(api).toHaveBeenCalledTimes(1);
  expect(allItems).toHaveBeenCalledTimes(4);
});

it("revalidates feed and list counts after a native quick save, even on a short resume", async () => {
  const { events, api, allItems, settle } = start("");
  await settle();
  events.get("cloudkeepResume")!(100, true);
  await tick();
  expect(api).toHaveBeenCalledTimes(2);
  expect(allItems.mock.calls.map(([path]) => path)).toEqual([
    "/api/lists",
    "/api/tags",
    "/api/lists",
  ]);
});

it("drops late feed and catalog results after logout", async () => {
  const { app, api, native, resolveLists, resolveTags } = start("");
  await tick();
  let resolveFeed!: (result: unknown) => void;
  api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFeed = resolve;
      }),
  );
  void app.refresh();
  await app.logout();
  resolveFeed({ items: [{ id: "old-account" }], total: 1 });
  resolveLists([cached]);
  resolveTags([{ id: "old-tag", name: "old", count: 1 }]);
  await tick();
  expect(app.state.value.token).toBe("");
  expect(app.bookmarks.value).toEqual([]);
  expect(app.lists.value).toEqual([]);
  expect(app.tags.value).toEqual([]);
  expect(native).not.toHaveBeenCalledWith("cacheLists", expect.anything());
});

it("refreshes a saved share's stale feed on the next short app resume", async () => {
  const { app, api, events, settle } = start();
  await settle();
  api.mockResolvedValueOnce({ alreadyExists: false });
  await app.save();
  await app.endShare(true);
  const requests = api.mock.calls.length;
  events.get("cloudkeepResume")!(500);
  await tick();
  expect(api).toHaveBeenCalledTimes(requests + 1);
  events.get("cloudkeepResume")!(500);
  await tick();
  expect(api).toHaveBeenCalledTimes(requests + 1);
});

it("keeps old filter responses from replacing visible cards while the new query waits", async () => {
  const { app, api, settle } = start("");
  await settle();
  app.bookmarks.value = [{ id: "visible" }];
  let resolveOld!: (value: unknown) => void;
  let resolveNew!: (value: unknown) => void;
  api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveNew = resolve;
      }),
  );
  void app.refresh();
  const filter = app.selectList(cached.id);
  resolveOld({ items: [{ id: "wrong-filter" }], total: 1 });
  await tick();
  expect(app.bookmarks.value).toEqual([{ id: "visible" }]);
  resolveNew({ items: [{ id: "filtered" }], total: 1 });
  await filter;
  expect(app.bookmarks.value).toEqual([{ id: "filtered" }]);
});

it("releases the mutation busy state while deleted bookmark cards refresh in the background", async () => {
  const { app, api, settle } = start("");
  await settle();
  app.bookmarks.value = [{ id: "visible" }];
  api.mockResolvedValueOnce({});
  api.mockImplementationOnce(() => new Promise(() => {}));
  app.deleteBookmark("visible");
  await app.confirmDelete();
  expect(app.busy.value).toBe(false);
  expect(app.loading.value).toBe(true);
  expect(app.bookmarks.value).toEqual([{ id: "visible" }]);
  await app.navigate("lists");
  expect(app.screen.value).toBe("lists");
});
