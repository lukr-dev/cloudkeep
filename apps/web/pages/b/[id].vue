<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Link, useParams, useRouter } from "@void/vue";
import {
  allItems,
  api,
  message,
  type Bookmark,
  type BookmarkDetail,
  type List,
} from "../../lib/api.ts";
import { useTask } from "../../composables/task.ts";
import Icon from "../../components/Icon.vue";
import BookmarkLayout from "../../components/BookmarkLayout.vue";
import { canGoBack } from "../../lib/navigation.ts";
import { usePolling } from "../../composables/polling.ts";
const params = useParams<{ id: string }>();
const router = useRouter();
const bookmark = ref<BookmarkDetail | null>(null);
const lists = ref<List[]>([]);
const title = ref("");
const description = ref("");
const tagName = ref("");
const loading = ref(true);
const loadError = ref("");
const imageFailed = ref(false);
const { busy, error, notice, run } = useTask();
const dirty = computed(
  () =>
    !!bookmark.value &&
    (title.value !== (bookmark.value.title ?? "") ||
      description.value !== (bookmark.value.description ?? "")),
);
const domain = computed(() => {
  try {
    return new URL(bookmark.value?.url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return bookmark.value?.url ?? "";
  }
});
function discard() {
  title.value = bookmark.value?.title ?? "";
  description.value = bookmark.value?.description ?? "";
}
async function refreshLists() {
  lists.value = await allItems<List>("/api/lists");
}
const path = `/api/bookmarks/${params.id}` as const;
async function load(initial = false) {
  loadError.value = "";
  try {
    const next = (await api<{ bookmark: BookmarkDetail }>(path)).bookmark;
    // Metadata can arrive while editing. Refresh untouched fields and keep unsaved edits.
    if (initial || title.value === (bookmark.value?.title ?? "")) title.value = next.title ?? "";
    if (initial || description.value === (bookmark.value?.description ?? ""))
      description.value = next.description ?? "";
    bookmark.value = next;
    if (initial) await refreshLists();
  } catch (cause) {
    loadError.value = message(cause);
  } finally {
    loading.value = false;
    schedule();
  }
}
const schedule = usePolling(
  () => load(),
  () =>
    !loadError.value &&
    !!bookmark.value &&
    ["pending", "processing"].includes(bookmark.value.status),
);
onMounted(() => void load(true));
function save() {
  return run(async () => {
    await api(path, {
      method: "PATCH",
      body: { title: title.value || null, description: description.value || null },
    });
    await load();
    notice.value = "Saved";
  });
}
function addTag() {
  return run(async () => {
    await api(`${path}/tags`, { method: "POST", body: { name: tagName.value } });
    tagName.value = "";
    await load();
  });
}
function removeTag(id: string) {
  return run(async () => {
    await api(`${path}/tags/${id}`, { method: "DELETE" });
    await load();
  });
}
function membership(id: string) {
  return run(async () => {
    await api(`${path}/lists/${id}`, {
      method: bookmark.value?.listIds.includes(id) ? "DELETE" : "PUT",
      ...(bookmark.value?.listIds.includes(id) ? {} : { body: {} }),
    });
    await Promise.all([load(), refreshLists()]);
  });
}
function reprocess() {
  return run(async () => {
    try {
      await api(`${path}/reprocess`, { method: "POST", body: {} });
      notice.value = "Fetching again. Your edits are kept.";
    } finally {
      await load();
    }
  });
}
function archive() {
  return run(async () => {
    if (!bookmark.value) return;
    const archived = bookmark.value.archivedAt === null;
    const result = await api<{ bookmark: Bookmark }>(path, { method: "PATCH", body: { archived } });
    bookmark.value.archivedAt = result.bookmark.archivedAt;
    bookmark.value.updatedAt = result.bookmark.updatedAt;
    notice.value = archived ? "Bookmark archived" : "Bookmark restored";
    await refreshLists();
  });
}
function back() {
  if (canGoBack()) window.history.back();
  else void router.visit("/");
}
function remove() {
  if (!window.confirm("Delete this bookmark? This can’t be undone.")) return;
  return run(async () => {
    await api(path, { method: "DELETE" });
    await router.visit("/");
  });
}
</script>
<template>
  <BookmarkLayout :lists="lists">
    <article class="detail">
      <button type="button" class="ghost small back" @click="back">
        <Icon name="arrow-left" :size="14" />Back
      </button>
      <div v-if="loadError" class="alert" role="alert">
        <span>{{ loadError }}</span
        ><button @click="load(!bookmark)">Try again</button>
      </div>
      <div v-if="loading" class="loading" aria-hidden="true">
        <div class="skeleton hero"></div>
        <div class="skeleton line short"></div>
        <div class="skeleton line"></div>
      </div>
      <template v-if="bookmark">
        <a
          v-if="bookmark.imageUrl && !imageFailed"
          :href="bookmark.url"
          target="_blank"
          rel="noopener noreferrer"
          class="hero fade-in"
          tabindex="-1"
          aria-hidden="true"
          ><img
            :src="bookmark.imageUrl"
            alt=""
            referrerpolicy="no-referrer"
            @error="imageFailed = true"
        /></a>
        <div class="source">
          <img
            v-if="bookmark.faviconUrl"
            :src="bookmark.faviconUrl"
            alt=""
            class="favicon"
            referrerpolicy="no-referrer"
          />
          <span>{{ bookmark.siteName || domain }}</span>
          <span aria-hidden="true">·</span>
          <span>Saved {{ new Date(bookmark.createdAt).toLocaleDateString() }}</span>
        </div>
        <p v-if="bookmark.archivedAt !== null" class="status">
          <Icon name="archive" :size="14" />Archived
        </p>
        <form class="edit" @submit.prevent="save">
          <label for="title" class="sr-only">Title</label>
          <textarea
            id="title"
            v-model="title"
            class="title-input"
            rows="1"
            maxlength="1000"
            :placeholder="bookmark.url"
            @keydown.enter.prevent="dirty && save()"
          />
          <label for="description" class="sr-only">Description</label>
          <textarea
            id="description"
            v-model="description"
            class="description-input"
            rows="3"
            maxlength="4000"
            placeholder="Add a description"
          />
          <div v-if="dirty" class="edit-actions fade-in">
            <button type="button" class="ghost small" :disabled="busy" @click="discard">
              Cancel</button
            ><button class="primary small" :disabled="busy">Save</button>
          </div>
        </form>
        <a :href="bookmark.url" target="_blank" rel="noopener noreferrer" class="url"
          ><span class="break">{{ bookmark.url }}</span
          ><Icon name="external" :size="13"
        /></a>
        <p v-if="['pending', 'processing'].includes(bookmark.status)" class="status" role="status">
          <span class="dot pulse"></span>Fetching details. This page updates on its own.
        </p>
        <div v-if="bookmark.status === 'failed'" class="alert" role="alert">
          <span>{{ bookmark.error || "Couldn’t process this page." }}</span
          ><button :disabled="busy" @click="reprocess">Retry</button>
        </div>
        <div v-if="error" class="alert" role="alert">
          <span>{{ error }}</span>
        </div>
        <section v-if="bookmark.summary" class="block">
          <h2>Summary</h2>
          <p class="summary">{{ bookmark.summary }}</p>
        </section>
        <section class="block">
          <h2>Tags</h2>
          <div class="pills">
            <span
              v-for="tag in bookmark.tags"
              :key="tag.id"
              class="chip tag"
              :title="tag.source === 'ai' ? 'Added by AI' : 'Added by you'"
              ><span v-if="tag.source === 'ai'" class="ai" aria-label="AI tag">AI</span>{{ tag.name
              }}<button
                class="remove"
                :disabled="busy"
                :aria-label="`Remove tag ${tag.name}`"
                @click="removeTag(tag.id)"
              >
                <Icon name="x" :size="11" /></button
            ></span>
            <form class="tag-form" @submit.prevent="addTag">
              <label for="tag-name" class="sr-only">Add a tag</label>
              <input
                id="tag-name"
                v-model="tagName"
                placeholder="Add tag"
                required
                maxlength="40"
                autocomplete="off"
              />
            </form>
          </div>
        </section>
        <section class="block">
          <h2>Lists</h2>
          <p v-if="!lists.length" class="muted small">
            No lists yet. <Link href="/lists" class="link">Create one</Link>
          </p>
          <div v-else class="pills">
            <button
              v-for="list in lists"
              :key="list.id"
              type="button"
              class="list-pill"
              :aria-pressed="bookmark.listIds.includes(list.id)"
              :disabled="busy"
              @click="membership(list.id)"
            >
              <Icon v-if="bookmark.listIds.includes(list.id)" name="check" :size="13" />{{
                list.name
              }}
            </button>
          </div>
        </section>
        <footer class="actions">
          <button class="ghost small" :disabled="busy" @click="reprocess">
            <Icon name="refresh" :size="13" />Fetch again</button
          ><button class="ghost small" :disabled="busy" @click="archive">
            <Icon name="archive" :size="13" />{{
              bookmark.archivedAt === null ? "Archive" : "Restore"
            }}</button
          ><button class="ghost small danger" :disabled="busy" @click="remove">Delete</button>
        </footer>
      </template>
    </article>
  </BookmarkLayout>
</template>
<style scoped>
.detail {
  max-width: 680px;
  margin: 0 auto;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 1.5rem;
  font-size: 0.86rem;
  color: var(--muted);
  transition: color 0.15s var(--ease);
}
.back:hover {
  color: var(--text);
}
.hero {
  display: block;
  aspect-ratio: 1.91;
  max-height: 300px;
  width: 100%;
  margin-bottom: 1.5rem;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--subtle);
  box-shadow: inset 0 0 0 1px var(--line);
}
.hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.loading .hero {
  margin-bottom: 1.5rem;
}
.loading .line {
  height: 0.8rem;
  margin-bottom: 0.75rem;
}
.loading .short {
  width: 35%;
}
.source {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--muted);
}
.favicon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.edit {
  margin: 0.4rem -0.5rem 0;
}
.edit textarea {
  display: block;
  width: 100%;
  border-color: transparent;
  background: transparent;
  padding: 0.3rem 0.5rem;
  resize: none;
  field-sizing: content;
}
.edit textarea:hover {
  background: var(--subtle);
}
.edit textarea:focus {
  background: var(--surface);
}
.title-input {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
}
.description-input {
  margin-top: 0.25rem;
  color: var(--muted);
  min-height: 2.5rem;
}
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  margin-top: 0.5rem;
  padding: 0 0.5rem;
}
.url {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.6rem;
  font-size: 0.86rem;
  color: var(--accent);
}
.url:hover span {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.25rem;
  font-size: 0.86rem;
  color: var(--muted);
}
.alert {
  margin-top: 1.25rem;
}
.block {
  margin-top: 2.25rem;
}
.block h2 {
  margin-bottom: 0.75rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--faint);
}
.summary {
  white-space: pre-wrap;
  line-height: 1.65;
}
.pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.tag {
  height: 1.75rem;
  padding: 0 0.3rem 0 0.65rem;
  font-size: 0.84rem;
  color: var(--text);
}
.ai {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent);
}
.remove {
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--faint);
}
.remove:hover {
  background: var(--hover);
  color: var(--text);
}
.tag-form input {
  width: 7rem;
  height: 1.75rem;
  padding: 0 0.65rem;
  border-style: dashed;
  border-radius: 999px;
  font-size: 0.84rem;
  background: transparent;
}
.tag-form input:focus {
  width: 10rem;
  border-style: solid;
}
.list-pill {
  height: 1.75rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 400;
  color: var(--muted);
  border-color: var(--line);
}
.list-pill[aria-pressed="true"] {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: transparent;
  font-weight: 500;
}
.actions {
  display: flex;
  gap: 1.5rem;
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}
.actions button {
  margin: 0 -0.65rem;
}
.actions .danger {
  margin-left: auto;
}
</style>
