<script setup lang="ts">
import Icon from "./Icon.vue";
defineProps<{ active: string; disabled?: boolean }>();
defineEmits<{ navigate: [screen: "bookmarks" | "lists" | "settings"] }>();
const tabs = [
  { id: "bookmarks", label: "Bookmarks", icon: "bookmark" },
  { id: "lists", label: "Lists", icon: "lists" },
  { id: "settings", label: "Settings", icon: "settings" },
] as const;
</script>
<template>
  <view class="bottom-nav"
    ><view
      v-for="tab in tabs"
      :key="tab.id"
      class="nav-tab"
      accessibility-element
      accessibility-traits="button"
      :accessibility-label="`${tab.label}${active === tab.id ? ', selected' : ''}`"
      @tap="!disabled && $emit('navigate', tab.id)"
      ><view class="nav-pill" :class="{ selected: active === tab.id }"
        ><Icon :name="tab.icon" :tone="active === tab.id ? 'accent' : 'muted'" /></view
      ><text class="nav-label" :class="{ 'accent-text': active === tab.id }">{{
        tab.label
      }}</text></view
    ></view
  >
</template>
