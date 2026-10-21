<script setup lang="ts">
import { ref, watch } from "vue";
import type { BookmarkDetail, List } from "../api.ts";
import Field from "../Field.vue";
import Button from "../components/Button.vue";
import Chip from "../components/Chip.vue";
import ChoiceRow from "../components/ChoiceRow.vue";
import BookmarkSource from "../components/BookmarkSource.vue";
const props = defineProps<{
  bookmark: BookmarkDetail;
  lists: List[];
  tagName: string;
  busy: boolean;
}>();
defineEmits<{
  open: [];
  refresh: [];
  tagName: [value: string];
  addTag: [];
  removeTag: [id: string];
  list: [id: string];
}>();
const imageFailed = ref(false);
watch(
  () => props.bookmark.imageUrl,
  () => {
    imageFailed.value = false;
  },
);
</script>
<template>
  <scroll-view class="content" scroll-orientation="vertical"
    ><view class="page"
      ><image
        v-if="bookmark.imageUrl && !imageFailed"
        class="hero-image"
        :src="bookmark.imageUrl"
        mode="aspectFill"
        accessibility-label="Bookmark preview"
        @error="imageFailed = true" /><BookmarkSource
        :url="bookmark.url"
        :site-name="bookmark.siteName"
        :favicon-url="bookmark.faviconUrl"
        :created-at="bookmark.createdAt" /><text class="detail-title">{{
        bookmark.title || bookmark.url
      }}</text
      ><text class="muted" :maxline="1">{{ bookmark.url }}</text
      ><text v-if="bookmark.description" class="body spaced">{{ bookmark.description }}</text
      ><view v-if="bookmark.summary" class="summary"
        ><text class="caption summary-label">Summary</text
        ><text class="body">{{ bookmark.summary }}</text></view
      ><text
        v-if="bookmark.status !== 'done'"
        class="muted spaced"
        :class="{ 'danger-text': bookmark.status === 'failed' }"
        >{{
          bookmark.status === "failed"
            ? bookmark.error || "Could not fetch this page."
            : "Fetching details…"
        }}</text
      ><Button label="Open in browser" primary :disabled="busy" @press="$emit('open')" /><Button
        label="Refresh details"
        quiet
        :disabled="busy"
        @press="$emit('refresh')" /><text class="section-title section-space">Tags</text
      ><view class="chips wrap"
        ><Chip
          v-for="tag in bookmark.tags"
          :key="tag.id"
          :label="`#${tag.name} ×`"
          :disabled="busy"
          @press="$emit('removeTag', tag.id)" /></view
      ><view class="row input-row"
        ><Field
          class="grow"
          label="New tag"
          :value="tagName"
          :max-length="40"
          @change="$emit('tagName', $event)"
          @confirm="$emit('addTag')" /><Button
          label="Add"
          :disabled="busy || !tagName.trim()"
          @press="$emit('addTag')" /></view
      ><text class="section-title section-space">Lists</text
      ><text v-if="!lists.length" class="muted">Create a list in the Lists tab.</text
      ><view v-else class="surface-card"
        ><ChoiceRow
          v-for="list in lists"
          :key="list.id"
          :label="list.name"
          :checked="bookmark.listIds.includes(list.id)"
          :disabled="busy"
          @press="$emit('list', list.id)" /></view></view
  ></scroll-view>
</template>
