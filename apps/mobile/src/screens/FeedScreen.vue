<script setup lang="ts">
import type { BookmarkItem, List } from "../api.ts";
import Field from "../Field.vue";
import Button from "../components/Button.vue";
import Chip from "../components/Chip.vue";
import Icon from "../components/Icon.vue";
import BookmarkCard from "../components/BookmarkCard.vue";
import EmptyState from "../components/EmptyState.vue";
defineProps<{
  bookmarks: BookmarkItem[];
  lists: List[];
  total: number;
  query: string;
  listFilter: string;
  tagFilter: string;
  loading: boolean;
  busy: boolean;
  error: string;
}>();
defineEmits<{
  query: [value: string];
  search: [];
  list: [id: string];
  clear: [];
  all: [];
  more: [];
  detail: [id: string];
  add: [];
  retry: [];
}>();
</script>
<template>
  <view class="workspace"
    ><view class="feed-tools"
      ><view class="search-row"
        ><Icon name="search" tone="muted" /><Field
          class="grow"
          label="Search bookmarks"
          hide-label
          confirm-type="search"
          :value="query"
          placeholder="Search bookmarks"
          :max-length="200"
          @change="$emit('query', $event)"
          @confirm="$emit('search')" /><Button
          v-if="query"
          label="Clear search"
          icon="close"
          icon-only
          quiet
          :disabled="busy"
          @press="$emit('query', '')" /></view
      ><scroll-view class="chip-scroll" scroll-orientation="horizontal"
        ><view class="chips"
          ><Chip
            label="All"
            :selected="!listFilter && !tagFilter"
            :disabled="busy"
            @press="$emit('all')" /><Chip
            v-for="list in lists"
            :key="list.id"
            :label="list.name"
            :selected="listFilter === list.id"
            :disabled="busy"
            @press="$emit('list', list.id)" /></view></scroll-view
      ><text class="meta feed-meta"
        >{{ total }} links{{
          listFilter ? ` · ${lists.find((list) => list.id === listFilter)?.name || "List"}` : ""
        }}{{ tagFilter ? ` · #${tagFilter}` : "" }}</text
      ></view
    ><!-- shortcut: ordinary rows avoid Vue Lynx 0.5.1's broken dynamic list adapter; restore virtualization after device verification. --><scroll-view
      class="feed"
      scroll-orientation="vertical"
      ><view v-if="loading && !bookmarks.length"
        ><view v-for="n in 4" :key="n" class="bookmark-card"
          ><view class="thumb" /><view class="bookmark-body"
            ><view class="skeleton short" /><view class="skeleton" /><view
              class="skeleton" /></view></view></view
      ><EmptyState
        v-else-if="!bookmarks.length && error"
        title="Could not load bookmarks"
        :description="error"
        icon="alert"
        action="Retry"
        :disabled="busy"
        @action="$emit('retry')"
      /><EmptyState
        v-else-if="!bookmarks.length"
        :title="query || listFilter || tagFilter ? 'No matches' : 'No bookmarks yet'"
        :description="
          query || listFilter || tagFilter
            ? 'Try another search or clear your filters.'
            : 'Tap + to save your first link.'
        "
        :action="query || listFilter || tagFilter ? 'Clear filters' : undefined"
        @action="$emit('clear')"
      /><BookmarkCard
        v-for="bookmark in bookmarks"
        :key="bookmark.id"
        :bookmark="bookmark"
        :disabled="busy"
        @open="$emit('detail', $event)"
      /><view class="feed-footer"
        ><Button
          v-if="bookmarks.length < total"
          :label="loading ? 'Loading…' : 'Load more'"
          :disabled="loading || busy"
          @press="$emit('more')"
        /><text v-else-if="bookmarks.length" class="muted centered">All caught up</text></view
      ></scroll-view
    ><view
      class="fab"
      :class="{ disabled: busy }"
      accessibility-element
      accessibility-traits="button"
      accessibility-label="Add bookmark"
      @tap="!busy && $emit('add')"
      ><Icon name="plus" tone="on-ink" /></view
  ></view>
</template>
