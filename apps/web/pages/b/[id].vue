<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Link, useParams, useRouter } from "@void/vue";
import { allItems, api, message, type BookmarkDetail, type List } from "../../lib/api.ts";
import { useTask } from "../../composables/task.ts";
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
const { busy, error, notice, run } = useTask();
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
    if (initial) lists.value = await allItems<List>("/api/lists");
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
    notice.value = "Changes saved.";
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
    await load();
  });
}
function reprocess() {
  return run(async () => {
    try {
      await api(`${path}/reprocess`, { method: "POST", body: {} });
      notice.value = "Processing again. Your manual edits will be kept.";
    } finally {
      await load();
    }
  });
}
function remove() {
  if (!window.confirm("Delete this bookmark? This cannot be undone.")) return;
  return run(async () => {
    await api(path, { method: "DELETE" });
    await router.visit("/");
  });
}
</script>
<template>
  <section class="narrow">
    <Link href="/" class="small">← Back to bookmarks</Link>
    <p v-if="loadError" class="alert" role="alert">
      {{ loadError }} <button @click="load(!bookmark)">Try again</button>
    </p>
    <p v-if="loading" class="muted" role="status">Loading bookmark…</p>
    <template v-if="bookmark">
      <div class="page-heading detail-heading">
        <p class="muted small">{{ bookmark.siteName || "SAVED BOOKMARK" }}</p>
        <h1 class="break">{{ bookmark.title || "Untitled bookmark" }}</h1>
        <a :href="bookmark.url" target="_blank" rel="noopener noreferrer" class="break"
          >{{ bookmark.url }} ↗</a
        >
      </div>
      <p v-if="['pending', 'processing'].includes(bookmark.status)" class="notice" role="status">
        {{ bookmark.status === "pending" ? "Waiting to process…" : "Reading the page…" }} Updates
        appear automatically.
      </p>
      <p v-if="bookmark.status === 'failed'" class="alert" role="alert">
        {{ bookmark.error || "Processing failed." }}
        <button :disabled="busy" @click="reprocess">Retry</button>
      </p>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <form class="panel stack" @submit.prevent="save">
        <h2>Details</h2>
        <div>
          <label for="title">Title</label><input id="title" v-model="title" maxlength="1000" />
        </div>
        <div>
          <label for="description">Description</label
          ><textarea id="description" v-model="description" rows="4" maxlength="4000" />
        </div>
        <div><button class="primary" :disabled="busy">Save changes</button></div>
      </form>
      <section v-if="bookmark.summary" class="panel section">
        <h2>Summary <span class="muted small">· AI</span></h2>
        <p class="summary">{{ bookmark.summary }}</p>
      </section>
      <section class="panel section">
        <h2>Tags</h2>
        <p v-if="!bookmark.tags.length" class="muted small">No tags yet.</p>
        <div class="row">
          <span v-for="tag in bookmark.tags" :key="tag.id" class="chip row"
            >{{ tag.name }} <span v-if="tag.source === 'ai'" class="muted small">AI</span
            ><button
              class="text-button"
              :disabled="busy"
              :aria-label="`Remove tag ${tag.name}`"
              @click="removeTag(tag.id)"
            >
              ×
            </button></span
          >
        </div>
        <form class="row tag-form" @submit.prevent="addTag">
          <div class="grow">
            <label for="tag-name" class="small">Add a tag</label
            ><input
              id="tag-name"
              v-model="tagName"
              placeholder="e.g. reading"
              required
              maxlength="40"
            />
          </div>
          <button :disabled="busy">Add tag</button>
        </form>
        <p class="muted small hint">
          Tags you add are manual. Adding an AI tag again marks it as yours.
        </p>
      </section>
      <section class="panel section">
        <h2>Lists</h2>
        <p v-if="!lists.length" class="muted">
          No lists yet. <Link href="/lists">Create one</Link>.
        </p>
        <div class="stack">
          <label v-for="list in lists" :key="list.id" class="check"
            ><input
              type="checkbox"
              :checked="bookmark.listIds.includes(list.id)"
              :disabled="busy"
              @change="membership(list.id)"
            />{{ list.name }}</label
          >
        </div>
      </section>
      <div class="row spread section">
        <button :disabled="busy" @click="reprocess">Reprocess</button
        ><button class="danger" :disabled="busy" @click="remove">Delete bookmark</button>
      </div>
      <p class="muted small section">
        Saved {{ new Date(bookmark.createdAt).toLocaleDateString() }}
      </p>
    </template>
  </section>
</template>
<style scoped>
.detail-heading {
  margin-top: 1.5rem;
}
.section {
  margin-top: 1.5rem;
}
.summary {
  white-space: pre-wrap;
  margin-bottom: 0;
}
.tag-form {
  margin-top: 1rem;
  align-items: flex-end;
}
.tag-form button {
  padding: 0.65rem 0.9rem;
}
.hint {
  margin: 0.75rem 0 0;
}
</style>
