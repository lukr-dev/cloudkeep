<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { Link, useRouter } from "@void/vue";
import BookmarkCard from "../components/BookmarkCard.vue";
import {
  allItems,
  api,
  ApiError,
  message,
  type BookmarkItem,
  type List,
  type Page,
  type Tag,
} from "../lib/api.ts";
import { filterQuery, filterUrl, readFilters } from "../lib/filters.ts";
import { useTask } from "../composables/task.ts";
import { usePolling } from "../composables/polling.ts";
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
const hasFilters = computed(() => !!(filters.q || filters.listId || filters.tag));
async function refreshCatalog() {
  const result = await Promise.all([allItems<List>("/api/lists"), allItems<Tag>("/api/tags")]);
  if (!disposed) [lists.value, tags.value] = result;
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
async function add() {
  duplicateId.value = "";
  // Snapshot the input: the user may paste the next link while this one is saving.
  const submitted = url.value;
  let saved = false;
  await run(async () => {
    try {
      await api("/api/bookmarks", {
        method: "POST",
        body: { url: submitted, listIds: newList.value ? [newList.value] : [] },
      });
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        typeof cause.data.existingBookmarkId === "string"
      ) {
        duplicateId.value = cause.data.existingBookmarkId;
        return;
      }
      throw cause;
    }
    if (url.value === submitted) url.value = "";
    notice.value = "Link saved. Metadata is on its way.";
    saved = true;
  });
  // Refresh outside the busy window so the next link can be submitted right away.
  if (saved)
    await Promise.all([load(), refreshCatalog()]).catch((cause) => {
      loadError.value = message(cause);
    });
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
  disposed = true;
  controller?.abort();
});
</script>
<template>
  <div class="page-heading">
    <p class="muted small">YOUR COLLECTION</p>
    <h1>Good things, kept.</h1>
    <p class="muted">A little space for everything worth coming back to.</p>
  </div>
  <form class="add-bar" @submit.prevent="add">
    <div class="grow">
      <label for="new-url" class="small">Save a bookmark</label
      ><input
        id="new-url"
        v-model="url"
        type="url"
        placeholder="Paste a link…"
        required
        maxlength="8000"
      />
    </div>
    <div class="add-list">
      <label for="new-list" class="small">Add to list</label
      ><select id="new-list" v-model="newList">
        <option value="">No list</option>
        <option v-for="list in lists" :key="list.id" :value="list.id">{{ list.name }}</option>
      </select>
    </div>
    <button class="primary" :disabled="busy">{{ busy ? "Saving…" : "Add link" }}</button>
  </form>
  <p v-if="duplicateId" class="notice" role="status">
    Already in your collection. <Link :href="`/b/${duplicateId}`">View the saved bookmark</Link>.
  </p>
  <p v-if="error" class="alert" role="alert">{{ error }}</p>
  <p v-if="notice" class="notice" role="status">{{ notice }}</p>
  <div class="collection">
    <aside class="sidebar" aria-label="Collection filters">
      <Link href="/" class="all" :aria-current="!hasFilters ? 'page' : undefined"
        >All bookmarks</Link
      >
      <div class="sidebar-heading row spread">
        <h2>Lists</h2>
        <Link href="/lists" class="small">Manage</Link>
      </div>
      <p v-if="!lists.length" class="muted small">Make a list to keep links together.</p>
      <Link
        v-for="list in lists"
        :key="list.id"
        :href="filterUrl({ ...filters, listId: filters.listId === list.id ? '' : list.id })"
        :aria-current="filters.listId === list.id ? 'page' : undefined"
        class="filter-item"
        ><span>{{ list.name }}</span
        ><span class="muted small">{{ list.count }}</span></Link
      >
      <h2 class="sidebar-heading">Tags</h2>
      <p v-if="!tags.some((tag) => tag.count)" class="muted small">Tags will appear here.</p>
      <Link
        v-for="tag in tags.filter((tag) => tag.count)"
        :key="tag.id"
        :href="filterUrl({ ...filters, tag: filters.tag === tag.name ? '' : tag.name })"
        :aria-current="filters.tag === tag.name ? 'page' : undefined"
        class="filter-item"
        ><span>{{ tag.name }}</span
        ><span class="muted small">{{ tag.count }}</span></Link
      >
    </aside>
    <section class="results" aria-label="Bookmarks" :aria-busy="loading">
      <form class="filters" @submit.prevent="apply">
        <div class="grow">
          <label for="search" class="small">Search</label
          ><input
            id="search"
            v-model="filters.q"
            type="search"
            placeholder="Search your bookmarks"
            maxlength="200"
          />
        </div>
        <div class="mobile-filter">
          <label for="filter-list" class="small">List</label
          ><select id="filter-list" v-model="filters.listId" @change="apply">
            <option value="">All lists</option>
            <option v-for="list in lists" :key="list.id" :value="list.id">
              {{ list.name }} ({{ list.count }})
            </option>
          </select>
        </div>
        <div class="mobile-filter">
          <label for="filter-tag" class="small">Tag</label
          ><select id="filter-tag" v-model="filters.tag" @change="apply">
            <option value="">All tags</option>
            <option v-for="tag in tags.filter((tag) => tag.count)" :key="tag.id" :value="tag.name">
              {{ tag.name }} ({{ tag.count }})
            </option>
          </select>
        </div>
        <button>Search</button>
      </form>
      <div class="row spread result-heading">
        <span class="muted small">{{ total }} {{ total === 1 ? "bookmark" : "bookmarks" }}</span
        ><Link v-if="hasFilters" href="/" class="small">Clear filters</Link>
      </div>
      <div v-if="hasFilters" class="row active-filters">
        <span v-if="filters.listId" class="chip"
          >List:
          {{ lists.find((list) => list.id === filters.listId)?.name || filters.listId }}</span
        ><span v-if="filters.tag" class="chip">Tag: {{ filters.tag }}</span>
      </div>
      <p v-if="loadError" class="alert" role="alert">
        {{ loadError }} <button @click="load()">Try again</button>
      </p>
      <p v-if="loading && !bookmarks.length" class="muted" role="status">Loading bookmarks…</p>
      <div v-else-if="!bookmarks.length && !loadError" class="empty">
        <h2>
          {{ hasFilters ? "Nothing matches just yet." : "Your collection starts with a link." }}
        </h2>
        <p class="muted">
          {{
            hasFilters
              ? "Try another search or clear your filters."
              : "Paste a URL above. We’ll take care of the details."
          }}
        </p>
      </div>
      <BookmarkCard
        v-for="bookmark in bookmarks"
        :key="bookmark.id"
        :bookmark="bookmark"
        :filters="filters"
        :busy="busy"
        @retry="retry"
      />
      <button
        v-if="bookmarks.length < total"
        class="load-more"
        :disabled="loading"
        @click="load(true)"
      >
        {{ loading ? "Loading…" : "Load more" }}
      </button>
    </section>
  </div>
</template>
<style scoped>
.add-bar {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  padding: 1.2rem;
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 8px;
  margin-bottom: 2.5rem;
}
.grow {
  flex: 1;
  min-width: 0;
}
.add-list {
  width: 180px;
}
.add-bar button {
  padding: 0.65rem 1rem;
}
.collection {
  display: grid;
  grid-template-columns: 185px minmax(0, 1fr);
  gap: 2.75rem;
}
.sidebar {
  padding-top: 0.4rem;
}
.sidebar h2 {
  font-size: 0.85rem;
  margin: 0;
}
.sidebar-heading {
  margin: 1.6rem 0 0.65rem;
}
.filter-item {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.4rem 0.55rem;
  margin-left: -0.55rem;
  color: var(--muted);
  text-decoration: none;
  border-radius: 4px;
  overflow-wrap: anywhere;
}
.filter-item[aria-current],
.filter-item:hover {
  background: var(--tint);
  color: var(--accent);
}
.all {
  color: var(--text);
  text-decoration: none;
  font-size: 0.9rem;
}
.filters {
  display: flex;
  align-items: flex-end;
  gap: 0.65rem;
}
.filters button {
  padding: 0.65rem 0.9rem;
}
.mobile-filter {
  display: none;
}
.result-heading {
  margin: 1.2rem 0 0.3rem;
}
.active-filters {
  margin: 0.75rem 0;
}
.load-more {
  display: flex;
  margin: 1.5rem auto;
}
@media (max-width: 750px) {
  .collection {
    grid-template-columns: 1fr;
  }
  .sidebar {
    display: none;
  }
  .mobile-filter {
    display: block;
    width: calc(50% - 0.4rem);
  }
  .filters {
    flex-wrap: wrap;
  }
  .filters .grow {
    flex-basis: 70%;
  }
  .filters button {
    order: 0;
  }
  .mobile-filter {
    order: 1;
  }
  .add-list {
    width: 140px;
  }
}
@media (max-width: 500px) {
  .add-bar {
    flex-wrap: wrap;
    padding: 1rem;
  }
  .add-bar .grow {
    flex-basis: 100%;
  }
  .add-list {
    flex: 1;
  }
}
</style>
