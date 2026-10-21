<script setup lang="ts">
import ListSettings from "../components/ListSettings.vue";
import { onMounted, ref } from "vue";
import { Link } from "@void/vue";
import { allItems, api, type List } from "../lib/api.ts";
import { filterUrl } from "../lib/filters.ts";
import { useTask } from "../composables/task.ts";
const settingsId = ref("");
const lists = ref<List[]>([]);
const name = ref("");
const editId = ref("");
const editName = ref("");
const loaded = ref(false);
const { busy, error, notice, run } = useTask();
async function load() {
  lists.value = await allItems<List>("/api/lists");
  loaded.value = true;
}
onMounted(() => void run(load));
function create() {
  return run(async () => {
    await api("/api/lists", { method: "POST", body: { name: name.value } });
    name.value = "";
    await load();
    notice.value = "List created";
  });
}
function rename(id: string) {
  return run(async () => {
    await api(`/api/lists/${id}`, { method: "PATCH", body: { name: editName.value } });
    editId.value = "";
    await load();
    notice.value = "List renamed";
  });
}
function remove(list: List) {
  if (window.confirm(`Delete “${list.name}”? The bookmarks in it stay saved.`))
    return run(async () => {
      await api(`/api/lists/${list.id}`, { method: "DELETE" });
      await load();
    });
}
</script>
<template>
  <div class="lists">
    <div class="page-head">
      <div>
        <h1>Lists</h1>
        <p>Group bookmarks by topic or project.</p>
      </div>
    </div>
    <form class="create" @submit.prevent="create">
      <label for="list-name" class="sr-only">New list name</label>
      <input
        id="list-name"
        v-model="name"
        placeholder="New list name"
        required
        maxlength="100"
        autocomplete="off"
      />
      <button class="primary" :disabled="busy">Create</button>
    </form>
    <div v-if="error" class="alert" role="alert">
      <span>{{ error }}</span
      ><button v-if="!loaded" @click="run(load)">Try again</button>
    </div>
    <div v-if="!loaded && !error" class="rows" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="skeleton placeholder"></div>
    </div>
    <div v-else-if="loaded && !lists.length" class="empty fade-in">
      <h2>No lists yet</h2>
      <p>Create one above, then add bookmarks to it from their page.</p>
    </div>
    <ul v-else class="rows">
      <li v-for="list in lists" :key="list.id" class="list-row fade-in">
        <form v-if="editId === list.id" class="rename" @submit.prevent="rename(list.id)">
          <label :for="`rename-${list.id}`" class="sr-only">List name</label>
          <input
            :id="`rename-${list.id}`"
            v-model="editName"
            required
            maxlength="100"
            @keydown.esc="editId = ''"
          />
          <button type="button" class="ghost small" :disabled="busy" @click="editId = ''">
            Cancel</button
          ><button class="primary small" :disabled="busy">Save</button>
        </form>
        <template v-else>
          <Link
            :href="filterUrl({ q: '', tag: '', type: '', listId: list.id })"
            class="name break"
            >{{ list.name }}</Link
          >
          <span class="count tabular">{{ list.count }}</span>
          <div class="actions">
            <button
              class="ghost small"
              :aria-expanded="settingsId === list.id"
              @click="settingsId = settingsId === list.id ? '' : list.id"
            >
              Settings
            </button>
            <button
              class="ghost small"
              :disabled="busy"
              @click="
                editId = list.id;
                editName = list.name;
              "
            >
              Rename</button
            ><button class="ghost small danger" :disabled="busy" @click="remove(list)">
              Delete
            </button>
          </div>
        </template>
        <ListSettings v-if="settingsId === list.id" :id="list.id" />
      </li>
    </ul>
  </div>
</template>
<style scoped>
.lists {
  max-width: 640px;
}
.create {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.75rem;
}
.rows {
  list-style: none;
  margin: 0 -0.75rem;
  padding: 0;
  display: grid;
  gap: 2px;
}
.placeholder {
  height: 2.75rem;
  margin: 0 0.75rem;
}
.list-row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  min-height: 3rem;
  padding: 0.35rem 0.4rem 0.35rem 0.75rem;
  border-radius: var(--radius);
  transition: background-color 0.15s var(--ease);
}
.list-row:hover,
.list-row:focus-within {
  background: var(--subtle);
}
.name {
  flex: 1;
  font-weight: 500;
}
.name:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--line-strong);
}
.count {
  padding-right: 0.5rem;
  color: var(--faint);
  font-size: 0.86rem;
  transition: opacity 0.15s var(--ease);
}
/* Actions replace the count on hover so nothing shifts. */
.actions {
  position: absolute;
  right: 0.4rem;
  top: 0.5rem;
  display: flex;
  gap: 0.15rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s var(--ease);
}
.list-row:hover .actions,
.list-row:focus-within .actions {
  opacity: 1;
  pointer-events: auto;
}
.list-row:hover .count,
.list-row:focus-within .count {
  opacity: 0;
}
@media (hover: none) {
  .actions {
    position: static;
    opacity: 1;
    pointer-events: auto;
  }
}
.rename {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
}
.rename input {
  flex: 1;
  height: 2rem;
}
</style>
