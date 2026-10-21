<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { BookmarkItem } from "../api.ts";
import { domain } from "../presentation.ts";
import BookmarkSource from "./BookmarkSource.vue";
const props = defineProps<{ bookmark: BookmarkItem; disabled?: boolean }>();
defineEmits<{ open: [id: string] }>();
const failed = ref(false);
watch(
  () => props.bookmark.imageUrl,
  () => {
    failed.value = false;
  },
);
const working = computed(() => ["pending", "processing"].includes(props.bookmark.status));
</script>
<template>
  <view
    class="bookmark-card"
    accessibility-element
    accessibility-traits="button"
    :accessibility-label="bookmark.title || bookmark.url"
    @tap="!disabled && $emit('open', bookmark.id)"
    ><view class="thumb"
      ><image
        v-if="bookmark.imageUrl && !failed && !working"
        class="thumb-image"
        :src="bookmark.imageUrl"
        mode="aspectFill"
        @error="failed = true"
      /><text v-else-if="!working" class="letter">{{
        domain(bookmark.url).charAt(0).toUpperCase()
      }}</text></view
    ><view class="bookmark-body"
      ><BookmarkSource
        :url="bookmark.url"
        :site-name="bookmark.siteName"
        :favicon-url="bookmark.faviconUrl"
        :created-at="bookmark.createdAt"
      /><text class="bookmark-title" :maxline="2">{{ bookmark.title || bookmark.url }}</text
      ><text v-if="working" class="meta">Fetching details…</text
      ><view v-else-if="bookmark.tags.length" class="tag-row"
        ><text v-for="tag in bookmark.tags.slice(0, 3)" :key="tag.id" class="tag-label" :maxline="1"
          >#{{ tag.name }}</text
        ><text v-if="bookmark.tags.length > 3" class="meta"
          >+{{ bookmark.tags.length - 3 }}</text
        ></view
      ></view
    ></view
  >
</template>
