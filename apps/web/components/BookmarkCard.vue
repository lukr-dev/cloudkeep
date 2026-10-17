<script setup lang="ts">
import { computed, ref } from "vue";
import { Link } from "@void/vue";
import Icon from "./Icon.vue";
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
const working = computed(() => ["pending", "processing"].includes(props.bookmark.status));
const age = computed(() => {
  const seconds = (props.bookmark.createdAt - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
  for (const [unit, size] of [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ] as const)
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return "just now";
});
</script>
<template>
  <article class="bookmark" :class="{ working }">
    <div class="thumb">
      <img
        v-if="bookmark.imageUrl && !imageFailed"
        :src="bookmark.imageUrl"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="imageFailed = true"
      />
      <span v-else-if="working" class="skeleton fill"></span>
      <span v-else class="letter">{{ domain.charAt(0).toUpperCase() }}</span>
    </div>
    <div class="body">
      <div class="source">
        <img
          v-if="bookmark.faviconUrl && !faviconFailed"
          :src="bookmark.faviconUrl"
          alt=""
          class="favicon"
          loading="lazy"
          referrerpolicy="no-referrer"
          @error="faviconFailed = true"
        />
        <span class="break">{{ bookmark.siteName || domain }}</span>
        <span aria-hidden="true">·</span>
        <time :datetime="new Date(bookmark.createdAt).toISOString()">{{ age }}</time>
      </div>
      <h2 class="title">
        <Link :href="`/b/${bookmark.id}`" class="stretched">{{
          bookmark.title || bookmark.url
        }}</Link>
      </h2>
      <p v-if="bookmark.description" class="description">{{ bookmark.description }}</p>
      <p v-if="working" class="status" role="status">
        <span class="dot pulse"></span>Fetching details
      </p>
      <div v-else-if="bookmark.status === 'failed'" class="failed">
        <span>{{ bookmark.error || "Couldn’t fetch this page." }}</span>
        <button class="small" :disabled="busy" @click="$emit('retry', bookmark.id)">
          <Icon name="refresh" :size="13" />Retry
        </button>
      </div>
      <div v-if="bookmark.tags.length" class="tags">
        <Link
          v-for="tag in bookmark.tags"
          :key="tag.id"
          class="chip"
          :href="filterUrl({ q: '', listId: '', ...filters, tag: tag.name })"
          >{{ tag.name }}</Link
        >
      </div>
    </div>
    <a
      :href="bookmark.url"
      target="_blank"
      rel="noopener noreferrer"
      class="open"
      :aria-label="`Open ${bookmark.title || domain} in a new tab`"
      ><Icon name="external" :size="15"
    /></a>
  </article>
</template>
<style scoped>
.bookmark {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.85rem 0.75rem;
  border-radius: var(--radius-lg);
  transition: background-color 0.15s var(--ease);
  animation: fade-in 0.35s var(--ease) both;
}
.bookmark:hover {
  background: var(--subtle);
}
.thumb {
  width: 6.5rem;
  aspect-ratio: 1.6;
  flex-shrink: 0;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--subtle);
  box-shadow: inset 0 0 0 1px var(--line);
  display: grid;
  place-items: center;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb .fill {
  width: 100%;
  height: 100%;
  border-radius: 0;
}
.letter {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--faint);
}
.body {
  flex: 1;
  min-width: 0;
}
.source {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.favicon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.title {
  margin-top: 0.2rem;
  font-size: 0.975rem;
  font-weight: 550;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.stretched::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
.stretched:focus-visible {
  outline: none;
}
.stretched:focus-visible::after {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.description {
  margin-top: 0.2rem;
  font-size: 0.875rem;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.status {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.4rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.failed {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.45rem;
  font-size: 0.84rem;
  color: var(--danger);
}
.bookmark:hover .chip {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.tags {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.55rem;
}
.open {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: var(--radius);
  color: var(--muted);
  opacity: 0;
  transition:
    opacity 0.15s var(--ease),
    background-color 0.15s var(--ease),
    color 0.15s var(--ease);
}
.bookmark:hover .open,
.open:focus-visible {
  opacity: 1;
}
.open:hover {
  background: var(--hover);
  color: var(--text);
}
@media (hover: none) {
  .open {
    opacity: 1;
  }
}
@media (max-width: 520px) {
  .bookmark {
    gap: 0.75rem;
    padding: 0.75rem 0.5rem;
  }
  .thumb {
    width: 4.5rem;
  }
  .open {
    display: none;
  }
}
</style>
