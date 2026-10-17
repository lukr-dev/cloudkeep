<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
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
import Action from "./Action.vue";
import Field from "./Field.vue";

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
  if (next === "bookmarks") await load();
  if (next === "lists" || next === "settings" || next === "add") await run(catalog);
  if (next === "add") {
    url.value = "";
    selectedLists.value = [];
    saved.value = false;
  }
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
onUnmounted(() => shareEvents.removeListener("cloudkeepShare", receiveShare));
</script>

<template>
  <view class="app">
    <view class="header"
      ><text class="brand">CloudKeep</text><text class="hint">Your links, kept close.</text></view
    >
    <text v-if="!ready" class="status">Opening CloudKeep…</text>
    <text v-if="!hasNativeHost" class="dev-note"
      >Explorer preview · credentials last only for this session. Native sharing and browser actions
      require the APK.</text
    >
    <view v-if="error" class="alert" accessibility-element accessibility-live-region="assertive"
      ><text class="error">{{ error }}</text
      ><Action v-if="state.token" label="Retry refresh" :disabled="busy" @press="run(refresh)"
    /></view>
    <text v-if="notice" class="notice" accessibility-live-region="polite">{{ notice }}</text>
    <view v-if="confirm" class="alert"
      ><text class="body">{{ confirm.label }}</text
      ><Action label="Delete" danger :disabled="busy" @press="confirmDelete" /><Action
        label="Cancel"
        @press="confirm = undefined"
    /></view>

    <scroll-view v-if="ready && !state.token" class="content" scroll-orientation="vertical">
      <text class="title">Sign in</text>
      <text class="muted">{{
        shared
          ? "Sign in to save your shared link. It will be waiting here."
          : "Connect to your CloudKeep server."
      }}</text>
      <Field label="Server URL" :value="server" @change="server = $event" />
      <Field label="Email" :value="email" :max-length="254" @change="email = $event" />
      <Field
        label="Password"
        :value="password"
        password
        :max-length="128"
        @change="password = $event"
      />
      <Action
        :label="busy ? 'Signing in…' : 'Sign in'"
        primary
        :disabled="busy || !email || !password"
        @press="login"
      />
      <Action v-if="shared" label="Cancel and return" :disabled="busy" @press="endShare(true)" />
    </scroll-view>

    <view v-if="ready && state.token" class="workspace">
      <view v-if="!shared" class="nav">
        <Action
          label="Bookmarks"
          :primary="screen === 'bookmarks'"
          :disabled="busy"
          @press="navigate('bookmarks')"
        />
        <Action
          label="Lists"
          :primary="screen === 'lists'"
          :disabled="busy"
          @press="navigate('lists')"
        />
        <Action label="Add" :primary="screen === 'add'" :disabled="busy" @press="navigate('add')" />
        <Action
          label="Settings"
          :primary="screen === 'settings'"
          :disabled="busy"
          @press="navigate('settings')"
        />
      </view>

      <view v-if="screen === 'bookmarks'" class="workspace">
        <view class="toolbar">
          <text class="title">Bookmarks</text>
          <Field
            label="Search bookmarks"
            :value="q"
            placeholder="Title, description or URL"
            :max-length="200"
            @change="q = $event"
          />
          <view class="row"
            ><Action label="Search" :disabled="busy" @press="load()" /><Action
              :label="filterPanel ? 'Hide filters' : 'Lists & tags'"
              @press="filterPanel = !filterPanel" /><Action
              label="Refresh"
              :disabled="loading || busy"
              @press="run(refresh)"
          /></view>
          <text class="muted"
            >{{ total }} links{{ listFilter ? " · list filtered" : ""
            }}{{ tagFilter ? ` · #${tagFilter}` : "" }}</text
          >
        </view>
        <scroll-view v-if="filterPanel" class="filter-panel" scroll-orientation="vertical">
          <Action label="All lists" :primary="!listFilter" @press="filterList('')" />
          <Action
            v-for="list in lists"
            :key="list.id"
            :label="list.name"
            :primary="listFilter === list.id"
            @press="filterList(list.id)"
          />
          <text class="subtitle">Tags</text>
          <Action
            label="All tags"
            :primary="!tagFilter"
            @press="
              tagFilter = '';
              filterPanel = false;
              load();
            "
          />
          <Action
            v-for="tag in tags"
            :key="tag.id"
            :label="`#${tag.name}`"
            :primary="tagFilter === tag.name"
            @press="
              tagFilter = tag.name;
              filterPanel = false;
              load();
            "
          />
        </scroll-view>
        <!-- shortcut: ordinary rows avoid Vue Lynx 0.5.1's append-only list adapter;
             restore virtualization/pull-to-refresh after its dynamic list support is fixed. -->
        <scroll-view v-else class="feed" scroll-orientation="vertical">
          <view v-if="!bookmarks.length"
            ><text class="status">{{
              loading
                ? "Loading bookmarks…"
                : error
                  ? "Could not load bookmarks. Retry above."
                  : "No bookmarks here yet. Save a link to get started."
            }}</text></view
          >
          <view v-for="bookmark in bookmarks" :key="bookmark.id">
            <view class="card">
              <text
                class="card-title"
                accessibility-element
                accessibility-traits="button"
                @tap="showDetail(bookmark.id)"
                >{{ bookmark.title || bookmark.url }}</text
              >
              <text class="muted" :maxline="1">{{ bookmark.siteName || bookmark.url }}</text>
              <text v-if="bookmark.description" class="body" :maxline="3">{{
                bookmark.description
              }}</text>
              <text class="muted"
                >{{ bookmark.status
                }}{{
                  bookmark.tags.length
                    ? ` · ${bookmark.tags.map((tag) => "#" + tag.name).join(" ")}`
                    : ""
                }}</text
              >
              <view class="row"
                ><Action label="Details" :disabled="busy" @press="showDetail(bookmark.id)" /><Action
                  label="Open"
                  :disabled="busy"
                  @press="open(bookmark.url)" /><Action
                  label="Delete"
                  danger
                  :disabled="busy"
                  @press="deleteBookmark(bookmark.id)"
              /></view>
            </view>
          </view>
          <view
            ><view class="toolbar"
              ><Action
                v-if="bookmarks.length < total"
                :label="loading ? 'Loading…' : 'Load more'"
                :disabled="loading || busy"
                @press="load(true)"
              /><text v-else-if="bookmarks.length" class="muted">All caught up.</text></view
            ></view
          >
        </scroll-view>
      </view>

      <scroll-view v-else class="content" scroll-orientation="vertical">
        <view v-if="screen === 'detail' && detail">
          <Action label="Back to bookmarks" :disabled="busy" @press="navigate('bookmarks')" />
          <text class="title">{{ detail.title || detail.url }}</text>
          <image
            v-if="detail.imageUrl"
            class="og-image"
            :src="detail.imageUrl"
            mode="aspectFill"
            accessibility-label="Bookmark preview"
          />
          <text class="muted">{{ detail.url }}</text>
          <text v-if="detail.description" class="body">{{ detail.description }}</text>
          <text v-if="detail.summary" class="body">{{ detail.summary }}</text>
          <text class="muted"
            >{{ detail.status }}{{ detail.error ? ` · ${detail.error}` : "" }}</text
          >
          <Action label="Open in browser" primary :disabled="busy" @press="open(detail.url)" />
          <Action label="Refresh details" :disabled="busy" @press="showDetail(detail.id)" />
          <text class="subtitle">Tags</text>
          <text v-if="!detail.tags.length" class="muted">No tags yet</text>
          <Action
            v-for="tag in detail.tags"
            :key="tag.id"
            :label="`#${tag.name} · Remove`"
            :disabled="busy"
            @press="removeTag(tag.id)"
          />
          <Field label="New tag" :value="tagName" :max-length="40" @change="tagName = $event" />
          <Action label="Add tag" :disabled="busy || !tagName.trim()" @press="addTag" />
          <text class="subtitle">Lists</text>
          <text v-if="!lists.length" class="muted">Create a list from the Lists tab.</text>
          <Action
            v-for="list in lists"
            :key="list.id"
            :label="`${detail.listIds.includes(list.id) ? '✓ ' : '+ '}${list.name}`"
            :primary="detail.listIds.includes(list.id)"
            :disabled="busy"
            @press="detailList(list.id)"
          />
          <Action
            label="Delete bookmark"
            danger
            :disabled="busy"
            @press="deleteBookmark(detail.id)"
          />
        </view>

        <view v-if="screen === 'lists'">
          <text class="title">Lists</text>
          <Field
            :label="editingList ? 'Rename list' : 'New list'"
            :value="newListName"
            :max-length="100"
            @change="newListName = $event"
          />
          <Action
            :label="editingList ? 'Save name' : 'Create list'"
            primary
            :disabled="busy || !newListName.trim()"
            @press="saveList"
          />
          <Action
            v-if="editingList"
            label="Cancel rename"
            @press="
              editingList = '';
              newListName = '';
            "
          />
          <text v-if="!lists.length" class="muted">Lists help you keep links together.</text>
          <view v-for="list in lists" :key="list.id" class="card">
            <text class="card-title">{{ list.name }} · {{ list.count }}</text>
            <view class="row"
              ><Action label="View" :disabled="busy" @press="filterList(list.id)" /><Action
                label="Rename"
                :disabled="busy"
                @press="
                  editingList = list.id;
                  newListName = list.name;
                " /><Action label="Delete" danger :disabled="busy" @press="deleteList(list)"
            /></view>
          </view>
        </view>

        <view v-if="screen === 'add'">
          <text class="title">{{ shared ? "Save shared link" : "Add bookmark" }}</text>
          <view v-if="!saved">
            <Field label="Link URL" :value="url" placeholder="https://…" @change="url = $event" />
            <text class="subtitle">Choose lists</text>
            <text class="muted">Select any number of lists, or leave all unselected.</text>
            <text v-if="listsLoading" class="muted">{{
              lists.length ? "Updating lists…" : "Loading lists…"
            }}</text>
            <text v-if="!listsLoading && !lists.length" class="muted"
              >No lists yet. You can save without a list.</text
            >
            <Action
              v-for="list in lists"
              :key="list.id"
              :label="`${selectedLists.includes(list.id) ? '✓ ' : '+ '}${list.name}`"
              :primary="selectedLists.includes(list.id)"
              :disabled="busy"
              @press="toggleList(list.id)"
            />
            <Action
              :label="busy ? 'Saving…' : 'Save bookmark'"
              primary
              :disabled="busy || !url.trim() || selectedLists.length > 30"
              @press="save"
            />
            <text v-if="selectedLists.length > 30" class="error">Choose at most 30 lists.</text>
            <Action
              v-if="shared"
              label="Cancel and return"
              :disabled="busy"
              @press="endShare(true)"
            />
          </view>
          <view v-else>
            <text class="body">Your link is saved. Metadata may take a moment to arrive.</text>
            <Action
              v-if="shared"
              label="Return to previous app"
              primary
              :disabled="busy"
              @press="endShare(true)"
            />
            <Action
              :label="shared ? 'Stay in CloudKeep' : 'View bookmarks'"
              :disabled="busy"
              @press="shared ? endShare(false) : navigate('bookmarks')"
            />
            <Action v-if="!shared" label="Save another link" @press="navigate('add')" />
          </view>
        </view>

        <view v-if="screen === 'settings'">
          <text class="title">Settings</text>
          <text class="subtitle">Server</text><text class="body">{{ state.server }}</text>
          <text class="muted"
            >To change servers or accounts, sign out and enter the new server on the sign-in
            screen.</text
          >
          <text class="subtitle">When sharing a link</text>
          <Action
            label="Ask · choose lists before saving"
            :primary="state.shareMode === 'ask'"
            :disabled="busy"
            @press="shareMode('ask')"
          />
          <Action
            label="Quick save · save and return immediately"
            :primary="state.shareMode === 'quick'"
            :disabled="busy"
            @press="shareMode('quick')"
          />
          <text class="muted"
            >Quick save runs natively without opening the full app. If it fails, CloudKeep opens the
            list picker so you can retry.</text
          >
          <text class="subtitle">Quick save default list</text>
          <Action
            label="No list"
            :primary="!state.defaultList"
            :disabled="busy"
            @press="defaultList('')"
          />
          <Action
            v-for="list in lists"
            :key="list.id"
            :label="list.name"
            :primary="state.defaultList === list.id"
            :disabled="busy"
            @press="defaultList(list.id)"
          />
          <text
            v-if="state.defaultList && !lists.some((list) => list.id === state.defaultList)"
            class="error"
            >Your default list was deleted. Choose another list or “No list”.</text
          >
          <text class="subtitle">Advanced settings</text>
          <Action
            label="Manage AI, prompts and invites on web"
            :disabled="busy"
            @press="open(state.server + '/settings')"
          />
          <Action label="Sign out" danger :disabled="busy" @press="logout" />
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<style>
.app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #fafafa;
}
.header {
  padding: 16px 18px 12px;
  border-bottom: 1px solid #e4e4e7;
}
.brand {
  font-size: 22px;
  font-weight: 700;
  color: #18181b;
}
.hint {
  font-size: 12px;
  color: #71717a;
  margin-top: 3px;
}
.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.nav {
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  padding: 8px 6px 0;
  border-bottom: 1px solid #e4e4e7;
}
.content {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 18px;
}
.toolbar {
  padding: 12px 18px 0;
}
.title {
  font-size: 24px;
  font-weight: 700;
  color: #18181b;
  margin-bottom: 16px;
}
.subtitle {
  font-size: 17px;
  font-weight: 600;
  color: #27272a;
  margin-top: 18px;
  margin-bottom: 12px;
}
.body {
  color: #3f3f46;
  font-size: 15px;
  line-height: 22px;
  margin-bottom: 12px;
}
.muted {
  color: #71717a;
  font-size: 13px;
  line-height: 19px;
  margin-bottom: 12px;
}
.status {
  padding: 24px 18px;
  color: #71717a;
  font-size: 15px;
}
.row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
}
.feed {
  flex: 1;
  min-height: 0;
  width: 100%;
}
.card {
  margin: 8px 18px;
  padding: 16px;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  background-color: #fff;
}
.card-title {
  font-size: 17px;
  font-weight: 600;
  color: #18181b;
  line-height: 24px;
  margin-bottom: 8px;
}
.alert {
  margin: 8px 18px;
  padding: 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background-color: #fef2f2;
}
.error {
  font-size: 14px;
  color: #b91c1c;
  margin-bottom: 8px;
}
.notice {
  padding: 10px 18px;
  font-size: 14px;
  color: #15803d;
}
.dev-note {
  padding: 8px 18px;
  font-size: 12px;
  color: #92400e;
}
.og-image {
  width: 100%;
  height: 190px;
  border-radius: 8px;
  margin-bottom: 16px;
}
.filter-panel {
  flex: 1;
  padding: 12px 18px;
}
</style>
