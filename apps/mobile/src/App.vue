<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from "vue";
import {
  api,
  allItems,
  ApiError,
  bookmarkQuery,
  signIn,
  type BookmarkDetail,
  type BookmarkItem,
  type List,
  type Tag,
} from "./api.ts";
import { native, hasNativeHost, openUrl, type NativeState } from "./native.ts";
import AppBar from "./components/AppBar.vue";
import BottomNav from "./components/BottomNav.vue";
import Button from "./components/Button.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import Snackbar from "./components/Snackbar.vue";
import LoginScreen from "./screens/LoginScreen.vue";
import FeedScreen from "./screens/FeedScreen.vue";
import DetailScreen from "./screens/DetailScreen.vue";
import ListsScreen from "./screens/ListsScreen.vue";
import AddScreen from "./screens/AddScreen.vue";
import ShareScreen from "./screens/ShareScreen.vue";
import SettingsScreen from "./screens/SettingsScreen.vue";

type Screen = "bookmarks" | "detail" | "lists" | "add" | "settings";
const screen = ref<Screen>("bookmarks");
const state = ref<NativeState>({
  server: "https://cloudkeep.toastnet.work",
  token: "",
  shareMode: "ask",
  defaultList: "",
  pendingUrl: "",
  lists: [],
});
const dark = ref(
  (lynx.__globalProps as { colorScheme?: string } | undefined)?.colorScheme === "dark",
);
provide("dark", dark);
const ready = ref(false);
const email = ref("");
const password = ref("");
const server = ref(state.value.server);
const error = ref("");
const notice = ref("");
const busy = ref(false);
const loading = ref(false);
const bookmarks = ref<BookmarkItem[]>([]);
const total = ref(0);
const lists = ref<List[]>([]);
const listsLoading = ref(false);
const tags = ref<Tag[]>([]);
const q = ref("");
const listFilter = ref("");
const tagFilter = ref("");
const filterPanel = ref(false);
const detail = ref<BookmarkDetail>();
const tagName = ref("");
const newListName = ref("");
const editingList = ref("");
const url = ref("");
const selectedLists = ref<string[]>([]);
const shared = ref(false);
const saved = ref(false);
const savedDuplicate = ref(false);
const confirm = ref<{ label: string; action: () => Promise<void> }>();
let loadVersion = 0;
let catalogVersion = 0;

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "Something went wrong. Please retry.";
}
async function failure(cause: unknown) {
  error.value = message(cause);
  if (cause instanceof ApiError && cause.status === 401) {
    state.value.token = "";
    ++catalogVersion;
    lists.value = [];
    tags.value = [];
    listsLoading.value = false;
    await native("clearCredentials");
    error.value = "Your session expired. Sign in to continue.";
  }
}
async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await task();
  } catch (cause) {
    await failure(cause);
  } finally {
    busy.value = false;
  }
}
async function catalog() {
  const version = ++catalogVersion;
  const { server, token } = state.value;
  listsLoading.value = true;
  try {
    await Promise.all([
      allItems<List>("/api/lists")
        .then(async (result) => {
          if (version !== catalogVersion || token !== state.value.token) return;
          lists.value = result;
          await native("cacheLists", { server, token, lists: result });
          await native("markTiming", { phase: "lists_loaded" });
        })
        .finally(() => {
          if (version === catalogVersion) listsLoading.value = false;
        }),
      allItems<Tag>("/api/tags").then((result) => {
        if (version === catalogVersion && token === state.value.token) tags.value = result;
      }),
    ]);
  } catch (cause) {
    if (version === catalogVersion && token === state.value.token) throw cause;
  }
}
async function load(more = false) {
  if (more && loading.value) return;
  const version = ++loadVersion;
  loading.value = true;
  error.value = "";
  const offset = more ? bookmarks.value.length : 0;
  try {
    const page = await api<{ items: BookmarkItem[]; total: number }>(
      bookmarkQuery(q.value, listFilter.value, tagFilter.value, offset),
    );
    if (version !== loadVersion) return;
    bookmarks.value = more
      ? [
          ...bookmarks.value,
          ...page.items.filter((item) => !bookmarks.value.some((b) => b.id === item.id)),
        ]
      : page.items;
    total.value = page.total;
  } catch (cause) {
    if (version === loadVersion) await failure(cause);
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}
async function refresh() {
  await Promise.all([load(), catalog().catch(failure)]);
}
async function login() {
  if (!email.value || !password.value) return;
  await run(async () => {
    try {
      await signIn(server.value, email.value, password.value);
    } finally {
      password.value = "";
    }
    state.value = await native<NativeState>("getState");
    lists.value = state.value.lists;
    if (state.value.pendingUrl) beginShare(state.value.pendingUrl);
    else {
      screen.value = "bookmarks";
      await load();
    }
    void catalog().catch(failure);
  });
}
function beginShare(value: string) {
  error.value = "";
  notice.value = "";
  confirm.value = undefined;
  shared.value = true;
  saved.value = false;
  url.value = value;
  selectedLists.value = [];
  screen.value = "add";
  void nextTick().then(() => native("markTiming", { phase: "js_picker_committed" }));
}
async function navigate(next: Screen) {
  if (busy.value) return;
  screen.value = next;
  error.value = "";
  notice.value = "";
  confirm.value = undefined;
  if (next === "add") {
    url.value = "";
    selectedLists.value = [];
    saved.value = false;
  }
  if (next === "bookmarks") await load();
  if (next === "lists" || next === "settings" || next === "add") await run(catalog);
}
function toggleList(id: string) {
  if (busy.value) return;
  selectedLists.value = selectedLists.value.includes(id)
    ? selectedLists.value.filter((value) => value !== id)
    : [...selectedLists.value, id];
}
async function save() {
  await run(async () => {
    const result = await api<{ bookmark: BookmarkDetail; alreadyExists: boolean }>(
      "/api/bookmarks",
      "POST",
      { url: url.value.trim(), listIds: selectedLists.value },
    );
    savedDuplicate.value = result.alreadyExists;
    notice.value = result.alreadyExists ? "Already saved. Moved to the top." : "Saved to CloudKeep";
    if (shared.value) await native("clearPendingSharedUrl");
    saved.value = true;
    await native("toast", { message: notice.value });
  });
}
async function endShare(returnToApp: boolean) {
  await run(async () => {
    await native("clearPendingSharedUrl");
    shared.value = false;
    saved.value = false;
    url.value = "";
    screen.value = "bookmarks";
    if (returnToApp) await native("finishShare");
    else await load();
  });
}
async function showDetail(id: string) {
  await run(async () => {
    const result = await api<{ bookmark: BookmarkDetail }>(`/api/bookmarks/${id}`);
    detail.value = result.bookmark;
    screen.value = "detail";
    tagName.value = "";
  });
}
async function detailList(id: string) {
  await run(async () => {
    const bookmark = detail.value!;
    const exists = bookmark.listIds.includes(id);
    await api(
      `/api/bookmarks/${bookmark.id}/lists/${id}`,
      exists ? "DELETE" : "PUT",
      exists ? undefined : {},
    );
    bookmark.listIds = exists
      ? bookmark.listIds.filter((value) => value !== id)
      : [...bookmark.listIds, id];
  });
}
async function addTag() {
  if (!tagName.value.trim()) return;
  await run(async () => {
    const result = await api<{ tag: BookmarkDetail["tags"][number] }>(
      `/api/bookmarks/${detail.value!.id}/tags`,
      "POST",
      { name: tagName.value.trim() },
    );
    detail.value!.tags = [
      ...detail.value!.tags.filter((tag) => tag.id !== result.tag.id),
      result.tag,
    ];
    tagName.value = "";
    await catalog();
  });
}
async function removeTag(id: string) {
  await run(async () => {
    await api(`/api/bookmarks/${detail.value!.id}/tags/${id}`, "DELETE");
    detail.value!.tags = detail.value!.tags.filter((tag) => tag.id !== id);
    await catalog();
  });
}
function deleteBookmark(id: string) {
  confirm.value = {
    label: "Delete this bookmark?",
    action: async () => {
      await api(`/api/bookmarks/${id}`, "DELETE");
      if (screen.value === "detail") screen.value = "bookmarks";
      await refresh();
    },
  };
}
async function saveList() {
  if (!newListName.value.trim()) return;
  await run(async () => {
    await api(
      editingList.value ? `/api/lists/${editingList.value}` : "/api/lists",
      editingList.value ? "PATCH" : "POST",
      { name: newListName.value.trim() },
    );
    editingList.value = "";
    newListName.value = "";
    await catalog();
  });
}
function deleteList(list: List) {
  confirm.value = {
    label: `Delete “${list.name}”? Its bookmarks will stay.`,
    action: async () => {
      await api(`/api/lists/${list.id}`, "DELETE");
      if (state.value.defaultList === list.id) {
        state.value.defaultList = "";
        await persistShareSettings();
      }
      if (listFilter.value === list.id) listFilter.value = "";
      if (editingList.value === list.id) {
        editingList.value = "";
        newListName.value = "";
      }
      await catalog();
    },
  };
}
async function confirmDelete() {
  const action = confirm.value?.action;
  confirm.value = undefined;
  if (action) await run(action);
}
async function filterList(id: string) {
  listFilter.value = id;
  filterPanel.value = false;
  screen.value = "bookmarks";
  await load();
}
async function persistShareSettings() {
  await native("setShareSettings", {
    shareMode: state.value.shareMode,
    defaultList: state.value.defaultList,
  });
  notice.value = "Share settings saved";
}
async function shareMode(mode: "ask" | "quick") {
  await run(async () => {
    state.value.shareMode = mode;
    await persistShareSettings();
  });
}
async function defaultList(id: string) {
  await run(async () => {
    state.value.defaultList = id;
    await persistShareSettings();
  });
}
async function logout() {
  await run(async () => {
    try {
      await api("/api/auth/sign-out", "POST", {});
    } finally {
      await native("clearCredentials");
      state.value.token = "";
      state.value.defaultList = "";
      ++loadVersion;
      ++catalogVersion;
      listsLoading.value = false;
      bookmarks.value = [];
      lists.value = [];
      tags.value = [];
      detail.value = undefined;
      listFilter.value = "";
      tagFilter.value = "";
      q.value = "";
    }
  });
}
async function open(url: string) {
  await run(async () => {
    await openUrl(url);
  });
}

const showNav = computed(
  () =>
    ready.value &&
    !!state.value.token &&
    !shared.value &&
    ["bookmarks", "lists", "settings"].includes(screen.value),
);
const feedEmpty = computed(
  () => !shared.value && screen.value === "bookmarks" && !bookmarks.value.length,
);
const title = computed(() =>
  shared.value
    ? "Save to CloudKeep"
    : {
        bookmarks: "Bookmarks",
        detail: "Bookmark",
        lists: "Lists",
        add: "Add bookmark",
        settings: "Settings",
      }[screen.value],
);
const canGoBack = computed(
  () =>
    shared.value ||
    !!confirm.value ||
    filterPanel.value ||
    (screen.value === "lists" && !!editingList.value) ||
    (!!state.value.token && screen.value !== "bookmarks"),
);
watch(canGoBack, (enabled) => {
  void native("setBackHandler", { enabled });
});
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
watch(notice, (value) => {
  clearTimeout(noticeTimer);
  if (value)
    noticeTimer = setTimeout(() => {
      notice.value = "";
    }, 3000);
});
function cancelRename() {
  editingList.value = "";
  newListName.value = "";
}
function editList(list: List) {
  editingList.value = list.id;
  newListName.value = list.name;
}
async function back() {
  if (busy.value) return;
  if (confirm.value) confirm.value = undefined;
  else if (shared.value) await endShare(true);
  else if (filterPanel.value) filterPanel.value = false;
  else if (screen.value === "lists" && editingList.value) cancelRename();
  else if (screen.value !== "bookmarks") await navigate("bookmarks");
}
function receiveTheme(value: unknown) {
  if (value === "light" || value === "dark") dark.value = value === "dark";
}
function search(value: string) {
  q.value = value;
  if (!value) void load();
}
async function clearFilters() {
  q.value = "";
  await allFilters();
}
async function allFilters() {
  listFilter.value = "";
  tagFilter.value = "";
  await load();
}
async function selectList(id: string) {
  await filterList(listFilter.value === id ? "" : id);
}
async function selectTag(name: string) {
  tagFilter.value = tagFilter.value === name ? "" : name;
  await load();
}
const shareEvents = lynx.getJSModule("GlobalEventEmitter");
function receiveShare(value: unknown) {
  if (typeof value !== "string" || !value) return;
  if (shared.value && url.value === value && !saved.value) return;
  beginShare(value);
  if (state.value.token) void catalog().catch(failure);
}
onMounted(async () => {
  // Register before reading state; the native handshake replays shares received during startup.
  shareEvents.addListener("cloudkeepShare", receiveShare);
  shareEvents.addListener("cloudkeepTheme", receiveTheme);
  shareEvents.addListener("cloudkeepBack", back);
  try {
    state.value = await native<NativeState>("getState");
    server.value = state.value.server;
    lists.value = state.value.lists;
    listsLoading.value = !!state.value.token;
    if (state.value.pendingUrl) beginShare(state.value.pendingUrl);
    ready.value = true;
    void native("markTiming", { phase: "js_state_ready" });
    await native("frontendReady");
    if (state.value.token) {
      void catalog().catch(failure);
      if (!shared.value) void load();
    }
  } catch (cause) {
    await failure(cause);
  } finally {
    ready.value = true;
  }
});
onUnmounted(() => {
  shareEvents.removeListener("cloudkeepShare", receiveShare);
  shareEvents.removeListener("cloudkeepTheme", receiveTheme);
  shareEvents.removeListener("cloudkeepBack", back);
  clearTimeout(noticeTimer);
});
</script>

<template>
  <view class="app" :class="{ dark }">
    <AppBar
      v-if="ready && state.token"
      :title="title"
      :back="screen === 'detail'"
      :close="shared || screen === 'add'"
      :disabled="busy"
      @back="back"
    >
      <Button
        v-if="screen === 'bookmarks' && !shared"
        label="Refresh bookmarks"
        icon="refresh"
        icon-only
        quiet
        :disabled="loading || busy"
        @press="run(refresh)"
      />
      <template v-if="screen === 'detail' && detail && !shared"
        ><Button
          label="Open in browser"
          icon="external"
          icon-only
          quiet
          :disabled="busy"
          @press="open(detail.url)" /><Button
          label="Delete bookmark"
          icon="trash"
          icon-only
          quiet
          danger
          :disabled="busy"
          @press="deleteBookmark(detail.id)"
      /></template>
    </AppBar>
    <view
      v-if="error && !(feedEmpty && state.token)"
      class="error-banner"
      accessibility-live-region="assertive"
      ><text class="error-message">{{ error }}</text
      ><Button
        v-if="state.token"
        label="Retry"
        quiet
        danger
        :disabled="busy || loading"
        @press="run(refresh)" /><Button
        label="Dismiss error"
        icon="close"
        icon-only
        quiet
        danger
        @press="error = ''"
    /></view>
    <LoginScreen
      v-if="ready && !state.token"
      :server="server"
      :email="email"
      :password="password"
      :busy="busy"
      :shared="shared"
      :native-host="hasNativeHost"
      @server="server = $event"
      @email="email = $event"
      @password="password = $event"
      @login="login"
      @cancel="endShare(true)"
    />
    <view v-if="ready && state.token" class="workspace">
      <ShareScreen
        v-if="shared"
        :url="url"
        :lists="lists"
        :selected="selectedLists"
        :loading="listsLoading"
        :busy="busy"
        :saved="saved"
        :duplicate="savedDuplicate"
        @toggle="toggleList"
        @save="save"
        @cancel="endShare(true)"
        @stay="endShare(false)"
      />
      <FeedScreen
        v-else-if="screen === 'bookmarks'"
        :bookmarks="bookmarks"
        :lists="lists"
        :tags="tags"
        :total="total"
        :query="q"
        :list-filter="listFilter"
        :tag-filter="tagFilter"
        :loading="loading"
        :busy="busy"
        :error="error"
        @query="search"
        @search="load()"
        @list="selectList"
        @tag="selectTag"
        @clear="clearFilters"
        @all="allFilters"
        @more="load(true)"
        @detail="showDetail"
        @add="navigate('add')"
        @retry="run(refresh)"
      />
      <DetailScreen
        v-else-if="screen === 'detail' && detail"
        :bookmark="detail"
        :lists="lists"
        :tag-name="tagName"
        :busy="busy"
        @open="open(detail.url)"
        @refresh="showDetail(detail.id)"
        @tag-name="tagName = $event"
        @add-tag="addTag"
        @remove-tag="removeTag"
        @list="detailList"
      />
      <ListsScreen
        v-else-if="screen === 'lists'"
        :lists="lists"
        :name="newListName"
        :editing="!!editingList"
        :busy="busy"
        @name="newListName = $event"
        @save="saveList"
        @cancel="cancelRename"
        @view="filterList"
        @edit="editList"
        @delete="deleteList"
      />
      <AddScreen
        v-else-if="screen === 'add'"
        :url="url"
        :lists="lists"
        :selected="selectedLists"
        :loading="listsLoading"
        :busy="busy"
        :saved="saved"
        :duplicate="savedDuplicate"
        @url="url = $event"
        @toggle="toggleList"
        @save="save"
        @view="navigate('bookmarks')"
        @another="navigate('add')"
      />
      <SettingsScreen
        v-else-if="screen === 'settings'"
        :state="state"
        :lists="lists"
        :busy="busy"
        @mode="shareMode"
        @default-list="defaultList"
        @logout="logout"
        @more="open(state.server + '/settings')"
      />
    </view>
    <BottomNav v-if="showNav" :active="screen" :disabled="busy" @navigate="navigate" />
    <Snackbar v-if="notice" :message="notice" :nav="showNav" />
    <ConfirmDialog
      v-if="confirm"
      :message="confirm.label"
      :busy="busy"
      @cancel="confirm = undefined"
      @confirm="confirmDelete"
    />
  </view>
</template>
<style>
@font-face {
  font-family: "Geist";
  src: url("asset:///fonts/Geist-Regular.ttf");
}
@font-face {
  font-family: "GeistMedium";
  src: url("asset:///fonts/Geist-Medium.ttf");
}
@font-face {
  font-family: "GeistSemiBold";
  src: url("asset:///fonts/Geist-SemiBold.ttf");
}
.app {
  --bg: #fafafa;
  --surface: #ffffff;
  --subtle: #f4f4f5;
  --text: #18181b;
  --muted: #71717a;
  --faint: #a1a1aa;
  --line: #e8e8ea;
  --line-strong: #d4d4d8;
  --ink: #18181b;
  --on-ink: #fafafa;
  --accent: #1f7a5a;
  --accent-soft: #e7f3ee;
  --danger: #b4372f;
  --danger-soft: #fbeceb;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg);
  position: relative;
}
.app.dark {
  --bg: #111113;
  --surface: #18181b;
  --subtle: #1d1d21;
  --text: #ececee;
  --muted: #9a9aa3;
  --faint: #6b6b74;
  --line: #26262b;
  --line-strong: #34343a;
  --ink: #ececee;
  --on-ink: #18181b;
  --accent: #6cc4a0;
  --accent-soft: #17302a;
  --danger: #f1857c;
  --danger-soft: #3a1c1a;
}
text {
  font-family: Geist, sans-serif;
  font-size: 15px;
  line-height: 22px;
  color: var(--text);
}
.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.content,
.feed {
  flex: 1;
  min-height: 0;
  width: 100%;
}
.page {
  padding: 16px 16px 24px;
}
.grow {
  flex: 1;
  min-width: 0;
}
.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
.wrap {
  flex-wrap: wrap;
}
.body {
  font-size: 15px;
  line-height: 22px;
}
.medium {
  font-family: GeistMedium, sans-serif;
  font-size: 15px;
  line-height: 22px;
}
.muted,
.meta,
.source-name {
  color: var(--muted);
  font-size: 13px;
  line-height: 19px;
}
.muted {
  font-size: 14px;
  line-height: 21px;
}
.caption {
  font-size: 12px;
  line-height: 18px;
  color: var(--muted);
}
.accent-text {
  color: var(--accent);
}
.danger-text {
  color: var(--danger);
}
.on-ink {
  color: var(--on-ink);
}
.centered {
  text-align: center;
}
.spaced {
  margin-top: 12px;
  margin-bottom: 12px;
}
.section-title {
  font-family: GeistSemiBold, sans-serif;
  font-size: 17px;
  line-height: 24px;
}
.section-space {
  margin-top: 24px;
  margin-bottom: 12px;
}
.section-heading {
  margin-top: 24px;
  margin-bottom: 12px;
  justify-content: space-between;
}
.group-caption {
  font-family: GeistMedium, sans-serif;
  font-size: 13px;
  line-height: 20px;
  color: var(--muted);
  margin-top: 20px;
  margin-bottom: 8px;
}
.app-bar {
  height: 56px;
  flex-shrink: 0;
  padding: 0 8px;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.screen-title {
  flex: 1;
  min-width: 0;
  font-family: GeistSemiBold, sans-serif;
  font-size: 22px;
  line-height: 28px;
  letter-spacing: -0.4px;
  margin-left: 8px;
}
.icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}
.button {
  min-height: 48px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background-color: var(--surface);
}
.button-label {
  font-family: GeistMedium, sans-serif;
  font-size: 14px;
  line-height: 22px;
  text-align: center;
}
.button.primary {
  background-color: var(--ink);
  border-color: var(--ink);
}
.button.danger {
  border-color: var(--danger);
}
.button.quiet {
  border-color: transparent;
  background-color: transparent;
}
.button.icon-button {
  width: 48px;
  height: 48px;
  padding: 12px;
  flex-shrink: 0;
}
.disabled {
  opacity: 0.45;
}
/* Bottom bars use --bg: the native container paints the gesture area below them in the same colour. */
.bottom-nav {
  height: 64px;
  flex-shrink: 0;
  background-color: var(--bg);
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: row;
  padding: 4px 8px;
}
.nav-tab {
  flex: 1;
  min-height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.nav-pill {
  width: 64px;
  height: 30px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.selected {
  background-color: var(--accent-soft);
  border-color: var(--accent-soft);
}
.nav-label {
  font-family: GeistMedium, sans-serif;
  font-size: 12px;
  line-height: 18px;
  color: var(--muted);
}
.nav-label.accent-text {
  color: var(--accent);
}
.fab {
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background-color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
}
.feed-tools {
  padding: 8px 16px 0;
}
.search-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.search-row .field {
  margin-bottom: 0;
}
.chip-scroll {
  width: 100%;
  height: 56px;
}
.chips {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.chip-hit {
  min-height: 48px;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}
.chip {
  padding: 5px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  background-color: var(--surface);
}
.chip.selected {
  background-color: var(--accent-soft);
  border-color: var(--accent-soft);
}
.chip-label {
  font-family: GeistMedium, sans-serif;
  font-size: 13px;
  line-height: 20px;
}
.chip-label.accent-text {
  color: var(--accent);
}
.feed-meta {
  margin-bottom: 12px;
}
.bookmark-card {
  margin: 0 16px 8px;
  padding: 12px;
  display: flex;
  flex-direction: row;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background-color: var(--surface);
}
.thumb {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  background-color: var(--subtle);
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb-image {
  width: 72px;
  height: 72px;
}
.letter {
  font-family: GeistMedium, sans-serif;
  font-size: 24px;
  color: var(--faint);
}
.bookmark-body {
  flex: 1;
  min-width: 0;
}
.source-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}
.source-name {
  flex-shrink: 1;
}
.favicon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
}
.favicon-letter {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background-color: var(--subtle);
  color: var(--muted);
  font-size: 10px;
  line-height: 14px;
  text-align: center;
}
.bookmark-title {
  font-family: GeistSemiBold, sans-serif;
  font-size: 15px;
  line-height: 21px;
  margin-top: 4px;
  margin-bottom: 4px;
}
.tag-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}
.tag-label {
  font-size: 12px;
  line-height: 18px;
  color: var(--muted);
  background-color: var(--subtle);
  border-radius: 4px;
  padding: 1px 4px;
  max-width: 90px;
  flex-shrink: 1;
}
.feed-footer {
  padding: 12px 16px 88px;
}
.skeleton {
  height: 12px;
  margin: 4px 0 10px;
  background-color: var(--subtle);
  border-radius: 4px;
}
.skeleton.short {
  width: 55%;
}
.empty-state {
  padding: 48px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.empty-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background-color: var(--subtle);
}
.hero-image {
  width: 100%;
  height: 190px;
  border-radius: 12px;
  margin-bottom: 16px;
}
.detail-title {
  font-family: GeistSemiBold, sans-serif;
  font-size: 20px;
  line-height: 28px;
  margin-top: 12px;
  margin-bottom: 8px;
}
.summary {
  padding: 16px;
  border-radius: 8px;
  background-color: var(--subtle);
  margin: 16px 0;
}
.summary-label {
  font-family: GeistMedium, sans-serif;
  margin-bottom: 8px;
}
.input-row {
  align-items: flex-end;
  margin-bottom: 16px;
}
.input-row .field {
  margin-bottom: 0;
}
.surface-card {
  background-color: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.choice-row {
  min-height: 52px;
  padding: 12px 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--line);
}
.choice {
  width: 22px;
  height: 22px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.choice.checked {
  background-color: var(--accent);
  border-color: var(--accent);
}
.choice.radio {
  border-radius: 12px;
}
.choice.radio.checked {
  background-color: transparent;
}
.radio-dot {
  width: 12px;
  height: 12px;
  border-radius: 8px;
  background-color: var(--accent);
}
.list-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0 4px 0 16px;
  border-bottom: 1px solid var(--line);
}
.list-body {
  flex: 1;
  min-width: 0;
  min-height: 64px;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.bottom-actions {
  display: flex;
  flex-direction: row;
  gap: 12px;
  padding: 12px 16px;
  background-color: var(--bg);
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}
.link-preview {
  padding: 16px;
  background-color: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 20px;
}
.saved-state {
  padding: 48px 0 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.success-circle {
  width: 64px;
  height: 64px;
  border-radius: 32px;
  background-color: var(--accent-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
}
.settings-server {
  padding: 16px;
  border-bottom: 1px solid var(--line);
}
.login {
  padding: 48px 24px 24px;
}
.login-brand {
  padding: 24px 0 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.wordmark {
  font-family: GeistSemiBold, sans-serif;
  font-size: 26px;
  line-height: 32px;
  letter-spacing: -0.5px;
}
.login .button {
  margin-bottom: 12px;
}
.dev-note {
  text-align: center;
  margin-top: 24px;
}
.error-banner {
  margin: 8px 16px;
  padding: 8px 12px;
  border-radius: 8px;
  background-color: var(--danger-soft);
  display: flex;
  flex-direction: row;
  align-items: center;
}
.error-message {
  flex: 1;
  min-width: 0;
  color: var(--danger);
  font-size: 14px;
  line-height: 21px;
}
.snackbar {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 88px;
  padding: 14px 16px;
  border-radius: 8px;
  background-color: var(--ink);
}
.snackbar.above-nav {
  bottom: 140px;
}
.snackbar-text {
  color: var(--on-ink);
  font-size: 14px;
  line-height: 20px;
}
.dialog-scrim {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.dialog {
  width: 100%;
  padding: 24px;
  background-color: var(--surface);
  border-radius: 12px;
}
.dialog-actions {
  margin-top: 24px;
  justify-content: flex-end;
}
</style>
