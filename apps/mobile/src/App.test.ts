import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import ts from "typescript";
import { expect, it, vi } from "vite-plus/test";
import { ApiError } from "./api.ts";
import type { List } from "./api.ts";
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
  const events = new Map<string, (value: unknown) => void>();
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
  const allItems = vi.fn((path: string) =>
    path === "/api/lists" ? listRequest : new Promise(() => {}),
  );
  const api = vi.fn(async () => ({ items: [], total: 0 }));
  const modules: Record<string, unknown> = {
    vue: {
      ...vue,
      provide: vi.fn(),
      onMounted: (callback: typeof mounted) => (mounted = callback),
      onUnmounted: (callback: typeof unmounted) => (unmounted = callback),
    },
    "./native.ts": { native, hasNativeHost: true },
    "./api.ts": { allItems, api, ApiError, bookmarkQuery: () => "/api/bookmarks" },
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
        addListener: (name: string, callback: (value: unknown) => void) =>
          events.set(name, callback),
        removeListener: (name: string) => events.delete(name),
      }),
    },
  });
  const app = exports.default!.setup({}, { expose: vi.fn() }) as {
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
    selectTag: (name: string) => Promise<void>;
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

it("toggles filters independently, keeps search for All, and re-searches when cleared", async () => {
  const { app, api } = start("");
  await tick();
  app.q.value = "reading";
  await app.selectList(cached.id);
  await app.selectTag("design");
  expect(app.listFilter.value).toBe(cached.id);
  expect(app.tagFilter.value).toBe("design");
  await app.selectTag("design");
  expect(app.tagFilter.value).toBe("");
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
