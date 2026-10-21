<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Link, useRouter } from "@void/vue";
import { allItems, message, type List } from "../lib/api.ts";
import { filterUrl, readFilters, type Filters } from "../lib/filters.ts";
import Icon from "./Icon.vue";
const props = defineProps<{ lists?: List[]; filters?: Filters }>();
const router = useRouter();
const dashboard = computed(() => router.path === "/");
const filters = computed(
  () => props.filters ?? readFilters(dashboard.value ? router.query : new URLSearchParams()),
);
const loaded = ref<List[]>([]);
const items = computed(() => props.lists ?? loaded.value);
const error = ref("");
async function load() {
  error.value = "";
  try {
    loaded.value = await allItems<List>("/api/lists");
  } catch (cause) {
    error.value = message(cause);
  }
}
onMounted(() => {
  if (props.lists === undefined) void load();
});
</script>
<template>
  <aside class="sidebar" aria-label="Filters">
    <Link
      href="/"
      class="filter"
      :aria-current="
        dashboard && !filters.q && !filters.listId && !filters.tag && !filters.archived
          ? 'page'
          : undefined
      "
      ><span>All bookmarks</span></Link
    >
    <Link href="/tags" class="filter" :aria-current="router.path === '/tags' ? 'page' : undefined"
      ><span>Tags</span></Link
    >
    <Link
      href="/?archived=1"
      class="filter"
      :aria-current="dashboard && filters.archived ? 'page' : undefined"
      ><span>Archive</span></Link
    >
    <div class="sidebar-head">
      <h2>Lists</h2>
      <Link href="/lists" class="sidebar-action" aria-label="Manage lists"
        ><Icon name="plus" :size="14"
      /></Link>
    </div>
    <p v-if="!items.length && !error" class="sidebar-empty">No lists yet</p>
    <Link
      v-for="list in items"
      :key="list.id"
      :href="filterUrl({ ...filters, listId: filters.listId === list.id ? '' : list.id })"
      :aria-current="dashboard && filters.listId === list.id ? 'page' : undefined"
      class="filter"
      ><span class="break">{{ list.name }}</span
      ><span class="count tabular">{{ list.count }}</span></Link
    >
    <div v-if="error" class="sidebar-empty" role="alert">
      {{ error }} <button class="ghost small" @click="load">Try again</button>
    </div>
  </aside>
</template>
<style scoped>
.sidebar {
  position: sticky;
  top: 5.5rem;
  align-self: start;
  display: grid;
  gap: 1px;
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 1.5rem 0 0.35rem;
  padding: 0 0.6rem;
}
.sidebar-head h2 {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--faint);
}
.sidebar-action {
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 5px;
  color: var(--faint);
}
.sidebar-action:hover {
  background: var(--hover);
  color: var(--text);
}
.sidebar-empty {
  padding: 0.25rem 0.6rem;
  font-size: 0.84rem;
  color: var(--faint);
}
.filter {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.35rem 0.6rem;
  border-radius: 6px;
  color: var(--muted);
  font-size: 0.9rem;
  transition:
    background-color 0.15s var(--ease),
    color 0.15s var(--ease);
}
.filter:hover {
  background: var(--hover);
  color: var(--text);
}
.filter[aria-current] {
  background: var(--subtle);
  color: var(--text);
  font-weight: 500;
}
.count {
  color: var(--faint);
  font-size: 0.82rem;
  font-weight: 400;
}
@media (max-width: 820px) {
  .sidebar {
    display: none;
  }
}
</style>
