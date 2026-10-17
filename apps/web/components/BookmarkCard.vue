<script setup lang="ts">
import { computed, ref } from "vue";
import { Link } from "@void/vue";
import type { BookmarkItem, BookmarkDetail } from "../lib/api.ts";
import { filterUrl, type Filters } from "../lib/filters.ts";
const props = defineProps<{
  bookmark: BookmarkItem | BookmarkDetail;
  filters?: Filters;
  busy?: boolean;
}>();
defineEmits<{ retry: [id: string] }>();
const imageFailed = ref(false);
const faviconFailed = ref(false);
const domain = computed(() => {
  try {
    return new URL(props.bookmark.url).hostname.replace(/^www\./, "");
  } catch {
    return props.bookmark.url;
  }
});
const image = computed(() =>
  !imageFailed.value && props.bookmark.imageUrl
    ? props.bookmark.imageUrl
    : !faviconFailed.value
      ? props.bookmark.faviconUrl
      : null,
);
function failed() {
  if (!imageFailed.value && props.bookmark.imageUrl) imageFailed.value = true;
  else faviconFailed.value = true;
}
</script>
<template>
  <article class="bookmark">
    <Link :href="`/b/${bookmark.id}`" class="thumbnail" tabindex="-1" aria-hidden="true">
      <img
        v-if="image"
        :src="image"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        :class="{ favicon: image !== bookmark.imageUrl }"
        @error="failed"
      />
      <span v-else class="fallback">{{ domain.charAt(0).toUpperCase() }}</span>
    </Link>
    <div class="content">
      <p class="muted small site">
        {{ bookmark.siteName || domain }}
        <span
          v-if="bookmark.status === 'pending' || bookmark.status === 'processing'"
          role="status"
          class="processing"
          >· {{ bookmark.status === "pending" ? "Queued" : "Processing" }}</span
        >
      </p>
      <h2>
        <Link :href="`/b/${bookmark.id}`">{{ bookmark.title || bookmark.url }}</Link>
      </h2>
      <p v-if="bookmark.description" class="description muted">{{ bookmark.description }}</p>
      <div v-if="bookmark.tags.length" class="row tags">
        <Link
          v-for="tag in bookmark.tags"
          :key="tag.id"
          class="chip"
          :href="filterUrl({ q: '', listId: '', ...filters, tag: tag.name })"
          >{{ tag.name }}</Link
        >
      </div>
      <div v-if="bookmark.status === 'failed'" class="failure small">
        <span>{{ bookmark.error || "Processing failed." }}</span>
        <button class="text-button" :disabled="busy" @click="$emit('retry', bookmark.id)">
          Retry
        </button>
      </div>
    </div>
    <a
      :href="bookmark.url"
      target="_blank"
      rel="noopener noreferrer"
      class="open small"
      :aria-label="`Open ${bookmark.title || domain} in a new tab`"
      >Open ↗</a
    >
  </article>
</template>
<style scoped>
.bookmark {
  display: flex;
  align-items: flex-start;
  gap: 1.1rem;
  padding: 1.3rem 0;
  border-bottom: 1px solid var(--line);
}
.thumbnail {
  width: 96px;
  height: 76px;
  flex-shrink: 0;
  background: var(--tint);
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}
.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumbnail img.favicon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.fallback {
  color: var(--accent);
  font-size: 1.5rem;
  opacity: 0.6;
}
.content {
  flex: 1;
  min-width: 0;
}
h2 {
  margin: 0.15rem 0 0.35rem;
  font-size: 1.05rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
h2 a {
  color: var(--text);
  text-decoration: none;
}
h2 a:hover {
  color: var(--accent);
}
.site {
  margin: 0;
}
.description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0 0 0.6rem;
  font-size: 0.9rem;
}
.tags {
  gap: 0.4rem;
}
.processing {
  color: var(--accent);
}
.failure {
  margin-top: 0.6rem;
  color: var(--danger);
}
.open {
  white-space: nowrap;
  text-decoration: none;
}
@media (max-width: 650px) {
  .thumbnail {
    width: 56px;
    height: 56px;
  }
  .bookmark {
    gap: 0.75rem;
  }
  .open {
    display: none;
  }
}
</style>
