<script setup lang="ts">
import type { List } from "../lib/api.ts";
import type { Filters } from "../lib/filters.ts";
import Sidebar from "./Sidebar.vue";
defineProps<{
  lists?: List[];
  filters?: Filters;
  typeOptions?: { value: string; label: string }[];
}>();
</script>
<template>
  <div class="collection">
    <Sidebar :lists="lists" :filters="filters" :type-options="typeOptions" />
    <div class="content"><slot /></div>
  </div>
</template>
<style scoped>
.collection {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 3rem;
}
.content {
  min-width: 0;
}
@media (max-width: 820px) {
  .collection {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
