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
function start(pendingUrl = "https://shared.example") {
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
      onMounted: (callback: typeof mounted) => (mounted = callback),
      onUnmounted: (callback: typeof unmounted) => (unmounted = callback),
    },
    "./native.ts": { native, hasNativeHost: true },
    "./api.ts": { allItems, api, ApiError, bookmarkQuery: () => "/api/bookmarks" },
    "./Action.vue": {},
    "./Field.vue": {},
  };
  const exports: { default?: { setup: (...args: unknown[]) => Record<string, unknown> } } = {};
  runInNewContext(outputText, {
    exports,
    require: (name: string) => modules[name],
    lynx: {
      getJSModule: () => ({
        addListener: (name: string, callback: (value: unknown) => void) =>
          events.set(name, callback),
        removeListener: (name: string) => events.delete(name),
      }),
    },
  });
  const app = exports.default!.setup({}, { expose: vi.fn() }) as {
    ready: vue.Ref<boolean>;
    screen: vue.Ref<string>;
    url: vue.Ref<string>;
    lists: vue.Ref<List[]>;
    listsLoading: vue.Ref<boolean>;
    selectedLists: vue.Ref<string[]>;
    saved: vue.Ref<boolean>;
    state: vue.Ref<NativeState>;
    error: vue.Ref<string>;
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
