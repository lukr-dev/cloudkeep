<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { Link, useRouter } from "@void/vue";
import BookmarkCard from "../components/BookmarkCard.vue";
import Icon from "../components/Icon.vue";
import {
  allItems,
  api,
  message,
  uploadFile,
  type Bookmark,
  type BookmarkItem,
  type List,
  type Page,
  type Tag,
} from "../lib/api.ts";
import { filterQuery, filterUrl, readFilters } from "../lib/filters.ts";
import { useFeatures } from "../composables/session.ts";
import { useTask } from "../composables/task.ts";
import { usePolling } from "../composables/polling.ts";
import { ASSET_MIMES, MAX_UPLOAD_BYTES } from "../lib/file-types.ts";
const MarkdownEditor = defineAsyncComponent(() => import("../components/MarkdownEditor.vue"));
const features = useFeatures();
const hasAssets = ref(false);
const mode = ref("link");
const noteTitle = ref("");
const noteText = ref("");
const uploads = ref<{ name: string; status: string }[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const saveOptions = computed(() => [
  { value: "link", label: "Link" },
  { value: "text", label: "Note" },
  ...(features.value.files ? [{ value: "asset", label: "File" }] : []),
]);
const typeOptions = computed(() => [
  { value: "", label: "All" },
  { value: "link", label: "Links" },
  { value: "text", label: "Notes" },
  ...(features.value.files || hasAssets.value ? [{ value: "asset", label: "Files" }] : []),
]);
const router = useRouter();
const filters = reactive(readFilters(router.query));
const bookmarks = ref<BookmarkItem[]>([]);
const lists = ref<List[]>([]);
const tags = ref<Tag[]>([]);
const total = ref(0);
const loading = ref(true);
const loadError = ref("");
const url = ref("");
const newList = ref("");
const duplicateId = ref("");
const { busy, error, notice, run } = useTask();
let request = 0;
let disposed = false;
let controller: AbortController | undefined;
const hasFilters = computed(() => !!(filters.q || filters.listId || filters.tag || filters.type));
const activeList = computed(() => lists.value.find((list) => list.id === filters.listId));
const usedTags = computed(() => tags.value.filter((tag) => tag.count));
async function refreshCatalog() {
  const result = await Promise.all([allItems<List>("/api/lists"), allItems<Tag>("/api/tags")]);
  if (!disposed) [lists.value, tags.value] = result;
  if (!features.value.files) {
    const assets = await api<Page<BookmarkItem> & { total: number }>(
      "/api/bookmarks?type=asset&limit=1",
    );
    if (!disposed) hasAssets.value = assets.total > 0;
  }
}
async function load(more = false, background = false) {
  const current = ++request;
  controller?.abort();
  controller = new AbortController();
  if (!background) loading.value = true;
  loadError.value = "";
  const query = filterQuery(readFilters(router.query));
  const offset = more ? bookmarks.value.length : 0;
  query.set("limit", "20");
  query.set("offset", String(offset));
  try {
    // Refresh every loaded page while polling so pending items beyond page one also settle.
    const pages = await Promise.all(
      Array.from(
        { length: background ? Math.max(1, Math.ceil(bookmarks.value.length / 20)) : 1 },
        (_, index) => {
          const params = new URLSearchParams(query);
          params.set("offset", String(background ? index * 20 : offset));
          return api<Page<BookmarkItem> & { total: number }>(`/api/bookmarks?${params}`, {
            signal: controller!.signal,
          });
        },
      ),
    );
    if (current !== request || disposed) return;
    const items = pages.flatMap((page) => page.items);
    bookmarks.value = more
      ? [
          ...bookmarks.value,
          ...items.filter((item) => !bookmarks.value.some((b) => b.id === item.id)),
        ]
      : items;
    total.value = pages[0]!.total;
    if (background) await refreshCatalog();
  } catch (cause) {
    if (
      current === request &&
      !disposed &&
      !(cause instanceof Error && cause.name === "AbortError")
    )
      loadError.value = message(cause);
  } finally {
    if (current === request && !disposed) {
      loading.value = false;
      schedule();
    }
  }
}
const schedule = usePolling(
  () => load(false, true),
  () =>
    !loadError.value &&
    bookmarks.value.some((item) => ["pending", "processing"].includes(item.status)),
);
function apply() {
  void router.visit(filterUrl(filters), { preserveScroll: true });
}
function clearSearch() {
  filters.q = "";
  apply();
}
async function add() {
  if (mode.value === "asset") return;
  duplicateId.value = "";
  // Snapshot the input: the user may paste the next link while this one is saving.
  const submitted = url.value;
  const text = noteText.value;
  const title = noteTitle.value;
  const isNote = mode.value === "text";
  let saved = false;
  await run(async () => {
    const result = await api<{ bookmark: Bookmark; alreadyExists: boolean }>("/api/bookmarks", {
      method: "POST",
      body: {
        ...(isNote ? { type: "text", text, title: title || undefined } : { url: submitted }),
        listIds: newList.value ? [newList.value] : [],
      },
    });
    if (isNote) {
      if (noteText.value === text) noteText.value = "";
      if (noteTitle.value === title) noteTitle.value = "";
    } else if (url.value === submitted) url.value = "";
    if (result.alreadyExists) duplicateId.value = result.bookmark.id;
    else notice.value = "Saved. Processing…";
    saved = true;
  });
  // Refresh outside the busy window so the next link can be submitted right away.
  if (saved)
    await Promise.all([load(), refreshCatalog()]).catch((cause) => {
      loadError.value = message(cause);
    });
}
async function addFiles(files: File[]) {
  if (!features.value.files || busy.value || !files.length) return;
  mode.value = "asset";
  const listId = newList.value;
  uploads.value = files.map((file) => ({ name: file.name, status: "Waiting" }));
  await run(async () => {
    for (const [index, file] of files.entries()) {
      const item = uploads.value[index]!;
      if (!ASSET_MIMES.some((mime) => mime === file.type)) {
        item.status = "Use JPEG, PNG, WebP, GIF or PDF";
        continue;
      }
      if (!file.size || file.size > MAX_UPLOAD_BYTES) {
        item.status = "File must be between 1 byte and 25 MB";
        continue;
      }
      try {
        item.status = "Uploading…";
        await uploadFile(file, listId, (percent) => {
          item.status = percent === 100 ? "Checking file…" : `Uploading ${percent}%`;
        });
        item.status = "Saved";
      } catch (cause) {
        item.status = message(cause);
      }
    }
    if (fileInput.value) fileInput.value.value = "";
    await Promise.all([load(), refreshCatalog()]);
  });
}
function selectFiles(event: Event) {
  void addFiles(Array.from((event.target as HTMLInputElement).files ?? []));
}
function dragOver(event: DragEvent) {
  if (features.value.files && event.dataTransfer?.types.includes("Files")) event.preventDefault();
}
function drop(event: DragEvent) {
  if (!features.value.files || !event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  void addFiles(Array.from(event.dataTransfer.files));
}
function retry(id: string) {
  return run(async () => {
    try {
      await api(`/api/bookmarks/${id}/reprocess`, { method: "POST", body: {} });
    } finally {
      await load(false, true);
    }
  });
}
onMounted(() => {
  window.addEventListener("dragover", dragOver);
  window.addEventListener("drop", drop);
  void refreshCatalog().catch((cause) => {
    loadError.value = message(cause);
  });
  watch(
    () => router.url.search,
    () => {
      Object.assign(filters, readFilters(router.query));
      void load();
    },
    { immediate: true },
  );
});
onUnmounted(() => {
  window.removeEventListener("dragover", dragOver);
  window.removeEventListener("drop", drop);
  disposed = true;
  controller?.abort();
});
</script>
<template>
  <div class="page-head">
    <h1>Bookmarks</h1>
  </div>
  <div class="save-modes" role="group" aria-label="Bookmark type">
    <button
      v-for="option in saveOptions"
      :key="option.value"
      :aria-pressed="mode === option.value"
      :disabled="busy"
      @click="mode = option.value"
    >
      {{ option.label }}
    </button>
  </div>
  <form class="save" :class="{ 'save-note-form': mode === 'text' }" @submit.prevent="add">
    <template v-if="mode === 'link'">
      <label for="new-url" class="sr-only">Link to save</label>
      <Icon name="plus" class="save-icon" />
      <input
        id="new-url"
        v-model="url"
        type="url"
        placeholder="Paste a link to save it"
        required
        maxlength="8000"
        autocomplete="off"
      />
    </template>
    <template v-else-if="mode === 'text'">
      <label for="note-title" class="sr-only">Note title (optional)</label>
      <input id="note-title" v-model="noteTitle" placeholder="Title (optional)" maxlength="1000" />
      <MarkdownEditor v-model="noteText" class="note-editor" label="New note text" />
      <span class="small muted">{{ noteText.length.toLocaleString() }} / 100,000 characters</span>
    </template>
    <div v-else-if="features.files" class="file-picker">
      <label for="new-files"
        >Choose images or PDFs, or drop files anywhere on this page (25 MB each)</label
      >
      <input
        id="new-files"
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        multiple
        :disabled="busy"
        @change="selectFiles"
      />
    </div>
    <label for="new-list" class="sr-only">Add to list</label>
    <select v-if="lists.length" id="new-list" v-model="newList" class="save-list">
      <option value="">No list</option>
      <option v-for="list in lists" :key="list.id" :value="list.id">{{ list.name }}</option>
    </select>
    <button
      v-if="mode !== 'asset'"
      class="primary"
      :disabled="busy || (mode === 'text' && (!noteText.trim() || noteText.length > 100_000))"
    >
      {{ busy ? "Saving…" : "Save" }}
    </button>
  </form>
  <ul v-if="uploads.length" class="upload-status" aria-live="polite">
    <li v-for="(upload, index) in uploads" :key="index">
      <span class="break">{{ upload.name }}</span> — {{ upload.status }}
    </li>
  </ul>
  <p v-if="duplicateId" class="save-note fade-in" role="status">
    Already saved. Moved it to the top.
    <Link :href="`/b/${duplicateId}`" class="link">Open</Link>
  </p>
  <p v-if="error" class="alert save-note" role="alert">{{ error }}</p>
  <div class="collection">
    <aside class="sidebar" aria-label="Filters">
      <Link href="/" class="filter" :aria-current="!hasFilters ? 'page' : undefined"
        ><span>All bookmarks</span></Link
      >
      <div class="sidebar-head"><h2>Type</h2></div>
      <Link
        v-for="option in typeOptions"
        :key="option.value"
        :href="filterUrl({ ...filters, type: option.value })"
        class="filter"
        :aria-current="filters.type === option.value ? 'page' : undefined"
        >{{ option.label }}</Link
      >
      <div class="sidebar-head">
        <h2>Lists</h2>
        <Link href="/lists" class="sidebar-action" aria-label="Manage lists"
          ><Icon name="plus" :size="14"
        /></Link>
      </div>
      <p v-if="!lists.length" class="sidebar-empty">No lists yet</p>
      <Link
        v-for="list in lists"
        :key="list.id"
        :href="filterUrl({ ...filters, listId: filters.listId === list.id ? '' : list.id })"
        :aria-current="filters.listId === list.id ? 'page' : undefined"
        class="filter"
        ><span class="break">{{ list.name }}</span
        ><span class="count tabular">{{ list.count }}</span></Link
      >
      <div class="sidebar-head"><h2>Tags</h2></div>
      <p v-if="!usedTags.length" class="sidebar-empty">Tags appear as links are tagged</p>
      <Link
        v-for="tag in usedTags"
        :key="tag.id"
        :href="filterUrl({ ...filters, tag: filters.tag === tag.name ? '' : tag.name })"
        :aria-current="filters.tag === tag.name ? 'page' : undefined"
        class="filter"
        ><span class="break">{{ tag.name }}</span
        ><span class="count tabular">{{ tag.count }}</span></Link
      >
    </aside>
    <section class="results" aria-label="Bookmarks" :aria-busy="loading">
      <form class="toolbar" role="search" @submit.prevent="apply">
        <div class="search">
          <label for="search" class="sr-only">Search bookmarks</label>
          <Icon name="search" class="search-icon" />
          <input
            id="search"
            v-model="filters.q"
            type="search"
            placeholder="Search"
            maxlength="200"
          />
          <button
            v-if="filters.q"
            type="button"
            class="ghost icon search-clear"
            aria-label="Clear search"
            @click="clearSearch"
          >
            <Icon name="x" :size="14" />
          </button>
        </div>
        <div class="mobile-filters">
          <label for="filter-type" class="sr-only">Type</label>
          <select id="filter-type" v-model="filters.type" @change="apply">
            <option v-for="option in typeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <label for="filter-list" class="sr-only">List</label
          ><select id="filter-list" v-model="filters.listId" @change="apply">
            <option value="">All lists</option>
            <option v-for="list in lists" :key="list.id" :value="list.id">{{ list.name }}</option>
          </select>
          <label for="filter-tag" class="sr-only">Tag</label
          ><select id="filter-tag" v-model="filters.tag" @change="apply">
            <option value="">All tags</option>
            <option v-for="tag in usedTags" :key="tag.id" :value="tag.name">{{ tag.name }}</option>
          </select>
        </div>
        <button type="submit" class="sr-only">Search</button>
      </form>
      <div class="meta">
        <span class="muted small tabular"
          >{{ total }} {{ total === 1 ? "bookmark" : "bookmarks" }}</span
        >
        <Link v-if="activeList" :href="filterUrl({ ...filters, listId: '' })" class="chip"
          >{{ activeList.name }}<Icon name="x" :size="12"
        /></Link>
        <Link v-if="filters.tag" :href="filterUrl({ ...filters, tag: '' })" class="chip"
          >{{ filters.tag }}<Icon name="x" :size="12"
        /></Link>
      </div>
      <div v-if="loadError" class="alert" role="alert">
        <span>{{ loadError }}</span
        ><button @click="load()">Try again</button>
      </div>
      <div v-if="loading && !bookmarks.length" class="skeletons" aria-hidden="true">
        <div v-for="n in 4" :key="n" class="skeleton-row">
          <div class="skeleton thumb"></div>
          <div class="grow">
            <div class="skeleton line short"></div>
            <div class="skeleton line"></div>
            <div class="skeleton line mid"></div>
          </div>
        </div>
      </div>
      <div v-else-if="!bookmarks.length && !loadError" class="empty fade-in">
        <h2>{{ hasFilters ? "No matches" : "No bookmarks yet" }}</h2>
        <p>
          {{
            hasFilters
              ? "Try a different search, or clear the filters."
              : features.files
                ? "Save a link, write a note, or drop a file above."
                : "Save a link or write a note above."
          }}
        </p>
      </div>
      <div v-else class="list">
        <BookmarkCard
          v-for="bookmark in bookmarks"
          :key="bookmark.id"
          :bookmark="bookmark"
          :filters="filters"
          :busy="busy"
          @retry="retry"
        />
      </div>
      <button
        v-if="bookmarks.length < total"
        class="load-more"
        :disabled="loading"
        @click="load(true)"
      >
        {{ loading ? "Loading…" : "Show more" }}
      </button>
    </section>
  </div>
</template>
<style scoped>
.save-modes {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}
.save-modes button[aria-pressed="true"] {
  background: var(--accent-soft);
  color: var(--accent);
}
.save-note-form {
  flex-wrap: wrap;
  padding: 0.75rem;
}
.save-note-form input,
.note-editor {
  flex-basis: 100%;
  width: 100%;
}
.file-picker {
  flex: 1;
  min-width: 0;
  padding: 0.5rem;
  display: grid;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.file-picker input {
  max-width: 100%;
}
.upload-status {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.25rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.save {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
  transition:
    border-color 0.15s var(--ease),
    box-shadow 0.15s var(--ease);
}
.save:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.save-icon {
  margin-left: 0.5rem;
  color: var(--faint);
  flex-shrink: 0;
}
.save input {
  flex: 1;
  border: 0;
  height: 2.25rem;
  padding: 0 0.25rem;
  background: transparent;
  font-size: 0.95rem;
}
.save input:focus {
  box-shadow: none;
}
.save-list {
  width: auto;
  max-width: 11rem;
  border-color: transparent;
  background-color: var(--subtle);
  color: var(--muted);
  font-size: 0.86rem;
}
.save-list:focus {
  box-shadow: none;
  border-color: var(--line-strong);
}
.save-note {
  margin-top: 0.75rem;
  font-size: 0.88rem;
  color: var(--muted);
}
.collection {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 3rem;
  margin-top: 2.5rem;
}
.sidebar {
  position: sticky;
  top: 5.5rem;
  align-self: start;
  display: grid;
  gap: 1px;
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 1.5rem 0 0.35rem;
  padding: 0 0.6rem;
}
.sidebar-head h2 {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--faint);
}
.sidebar-action {
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 5px;
  color: var(--faint);
}
.sidebar-action:hover {
  background: var(--hover);
  color: var(--text);
}
.sidebar-empty {
  padding: 0.25rem 0.6rem;
  font-size: 0.84rem;
  color: var(--faint);
}
.filter {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.35rem 0.6rem;
  border-radius: 6px;
  color: var(--muted);
  font-size: 0.9rem;
  transition:
    background-color 0.15s var(--ease),
    color 0.15s var(--ease);
}
.filter:hover {
  background: var(--hover);
  color: var(--text);
}
.filter[aria-current] {
  background: var(--subtle);
  color: var(--text);
  font-weight: 500;
}
.count {
  color: var(--faint);
  font-size: 0.82rem;
  font-weight: 400;
}
.toolbar {
  display: flex;
  gap: 0.5rem;
}
.search {
  position: relative;
  flex: 1;
}
.search-icon {
  position: absolute;
  left: 0.7rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--faint);
  pointer-events: none;
}
.search input {
  padding-left: 2.1rem;
  padding-right: 2.25rem;
  background: transparent;
  border-color: var(--line);
}
.search input::-webkit-search-cancel-button {
  display: none;
}
.search-clear {
  position: absolute;
  right: 0.15rem;
  top: 50%;
  transform: translateY(-50%);
  width: 2rem;
  height: 2rem;
}
.mobile-filters {
  display: none;
  gap: 0.5rem;
}
.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-height: 1.5rem;
  margin: 1.25rem 0 0.75rem;
}
.meta .chip {
  background: var(--accent-soft);
  color: var(--accent);
}
.list {
  display: grid;
  gap: 2px;
  margin: 0 -0.75rem;
}
.skeletons {
  display: grid;
  gap: 2px;
}
.skeleton-row {
  display: flex;
  gap: 1rem;
  padding: 0.9rem 0;
}
.skeleton.thumb {
  width: 6.5rem;
  height: 4.125rem;
  border-radius: var(--radius);
  flex-shrink: 0;
}
.skeleton.line {
  height: 0.7rem;
  margin: 0.35rem 0 0.6rem;
}
.skeleton.short {
  width: 30%;
}
.skeleton.mid {
  width: 60%;
}
.load-more {
  display: flex;
  margin: 1.5rem auto 0;
}
@media (max-width: 820px) {
  .collection {
    grid-template-columns: 1fr;
    gap: 0;
    margin-top: 1.75rem;
  }
  .sidebar {
    display: none;
  }
  .toolbar {
    flex-wrap: wrap;
  }
  .search {
    flex-basis: 100%;
  }
  .mobile-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    flex-basis: 100%;
  }
}
@media (max-width: 520px) {
  .save {
    flex-wrap: wrap;
  }
  .save input {
    flex-basis: calc(100% - 2.5rem);
  }
  .save-list {
    flex: 1;
    max-width: none;
  }
  .list {
    margin: 0 -0.5rem;
  }
}
</style>
