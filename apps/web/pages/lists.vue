<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Link } from "@void/vue";
import { allItems, api, type List } from "../lib/api.ts";
import { filterUrl } from "../lib/filters.ts";
import { useTask } from "../composables/task.ts";
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
    notice.value = "List created.";
  });
}
function rename(id: string) {
  return run(async () => {
    await api(`/api/lists/${id}`, { method: "PATCH", body: { name: editName.value } });
    editId.value = "";
    await load();
  });
}
function remove(list: List) {
  if (window.confirm(`Delete “${list.name}”? Your bookmarks will stay in your collection.`))
    return run(async () => {
      await api(`/api/lists/${list.id}`, { method: "DELETE" });
      await load();
    });
}
</script>
<template>
  <section class="narrow">
    <div class="page-heading">
      <h1>Your lists</h1>
      <p class="muted">Keep a few things together.</p>
    </div>
    <form class="row create" @submit.prevent="create">
      <div class="grow">
        <label for="list-name">New list</label
        ><input
          id="list-name"
          v-model="name"
          placeholder="e.g. Weekend reading"
          required
          maxlength="100"
        />
      </div>
      <button class="primary" :disabled="busy">Create list</button>
    </form>
    <p v-if="error" class="alert" role="alert">
      {{ error }} <button v-if="!loaded" @click="run(load)">Try again</button>
    </p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="!loaded && !error" role="status" class="muted">Loading lists…</p>
    <div v-else-if="loaded && !lists.length" class="empty">
      <h2>A place for your next collection.</h2>
      <p class="muted">Create your first list above.</p>
    </div>
    <div v-for="list in lists" :key="list.id" class="list-row">
      <form v-if="editId === list.id" class="row" @submit.prevent="rename(list.id)">
        <div class="grow">
          <label :for="`rename-${list.id}`" class="small">List name</label
          ><input :id="`rename-${list.id}`" v-model="editName" required maxlength="100" />
        </div>
        <button :disabled="busy">Save</button
        ><button type="button" :disabled="busy" @click="editId = ''">Cancel</button>
      </form>
      <div v-else class="row">
        <div class="grow">
          <Link :href="filterUrl({ q: '', tag: '', listId: list.id })">{{ list.name }}</Link>
          <p class="muted small">
            {{ list.count }} {{ list.count === 1 ? "bookmark" : "bookmarks" }}
          </p>
        </div>
        <button
          class="text-button"
          :disabled="busy"
          @click="
            editId = list.id;
            editName = list.name;
          "
        >
          Rename</button
        ><button class="text-button danger" :disabled="busy" @click="remove(list)">Delete</button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.create {
  align-items: flex-end;
  margin-bottom: 2rem;
}
.create button {
  padding: 0.65rem 0.9rem;
}
.list-row {
  padding: 1.1rem 0;
  border-bottom: 1px solid var(--line);
}
.list-row p {
  margin: 0.3rem 0 0;
}
.list-row form {
  align-items: flex-end;
}
</style>
