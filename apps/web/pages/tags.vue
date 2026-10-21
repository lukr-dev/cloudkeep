<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Link } from "@void/vue";
import BookmarkLayout from "../components/BookmarkLayout.vue";
import { api, type Tag } from "../lib/api.ts";
import { filterUrl } from "../lib/filters.ts";
import { tagFontSize } from "../lib/tag-cloud.ts";
import { useTask } from "../composables/task.ts";
const tags = ref<Tag[]>([]);
const query = ref("");
const loaded = ref(false);
const { busy, error, run } = useTask();
const visibleTags = computed(() => {
  const search = query.value.trim().toLowerCase();
  return tags.value.filter((tag) => tag.name.toLowerCase().includes(search));
});
const maxCount = computed(() => tags.value.reduce((max, tag) => Math.max(max, tag.count), 0));
async function load() {
  tags.value = (await api<{ items: Tag[] }>("/api/tags/cloud")).items;
  loaded.value = true;
}
onMounted(() => void run(load));
</script>
<template>
  <BookmarkLayout>
    <div class="page-head">
      <div>
        <h1>
          Tags <span v-if="loaded" class="muted small tabular">{{ tags.length }}</span>
        </h1>
        <p>Explore bookmarks by tag.</p>
      </div>
    </div>
    <div class="tag-search field">
      <label for="tag-search" class="sr-only">Filter tags</label>
      <input id="tag-search" v-model="query" type="search" placeholder="Filter tags" />
    </div>
    <section aria-label="Tags" :aria-busy="busy || (!loaded && !error)">
      <div v-if="error" class="alert" role="alert">
        <span>{{ error }}</span
        ><button :disabled="busy" @click="run(load)">Try again</button>
      </div>
      <div v-else-if="!loaded" class="cloud" aria-hidden="true">
        <div v-for="n in 12" :key="n" class="skeleton placeholder"></div>
      </div>
      <div v-else-if="!tags.length" class="empty fade-in">
        <h2>No tags yet</h2>
        <p>Tags appear as bookmarks are tagged.</p>
      </div>
      <div v-else-if="!visibleTags.length" class="empty fade-in" role="status">
        <h2>No matching tags</h2>
        <p>Try a different filter.</p>
      </div>
      <ul v-else class="cloud fade-in">
        <li v-for="tag in visibleTags" :key="tag.id">
          <Link
            :href="filterUrl({ archived: false, q: '', listId: '', tag: tag.name })"
            :style="{ fontSize: `${tagFontSize(tag.count, maxCount)}rem` }"
            :title="`${tag.count} ${tag.count === 1 ? 'bookmark' : 'bookmarks'}`"
            class="cloud-tag break"
            >{{ tag.name
            }}<span class="sr-only"
              >, {{ tag.count }} {{ tag.count === 1 ? "bookmark" : "bookmarks" }}</span
            ></Link
          >
        </li>
      </ul>
    </section>
  </BookmarkLayout>
</template>
<style scoped>
.tag-search {
  max-width: 20rem;
  margin-bottom: 1.75rem;
}
.cloud {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.65rem 1.25rem;
  list-style: none;
  padding: 0;
  margin: 0;
}
.cloud li {
  min-width: 0;
  max-width: 100%;
}
.cloud-tag {
  display: inline-block;
  padding: 0.15rem 0;
  color: var(--accent);
  line-height: 1.4;
  text-underline-offset: 4px;
}
.cloud-tag:hover {
  text-decoration: underline;
}
.placeholder {
  width: 6rem;
  height: 1.75rem;
}
.placeholder:nth-child(3n) {
  width: 9rem;
  height: 2.5rem;
}
</style>
