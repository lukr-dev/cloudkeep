import { ref } from "vue";
import { allItems, message, type List } from "../lib/api.ts";

const lists = ref<List[]>([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref("");
let pending: Promise<void> | undefined;
let queued: Promise<void> | undefined;
let generation = 0;

function load(): Promise<void> {
  const current = generation;
  loading.value = true;
  error.value = "";
  const request: Promise<void> = allItems<List>("/api/lists")
    .then((items) => {
      if (current !== generation) return;
      lists.value = items;
      loaded.value = true;
    })
    .catch((cause) => {
      if (current === generation) error.value = message(cause);
      throw cause;
    })
    .finally(() => {
      if (pending !== request) return;
      loading.value = false;
      pending = undefined;
    });
  pending = request;
  return request;
}

// Callers refresh after a mutation, so a request already in flight may be stale: fetch once more.
function refresh(): Promise<void> {
  if (!pending) return load();
  const current = generation;
  return (queued ??= pending
    .catch(() => {})
    .then(() => {
      queued = undefined;
      if (current === generation) return load();
    }));
}

function revalidate() {
  return pending ?? load();
}

function ensure() {
  return pending ?? (loaded.value ? Promise.resolve() : load());
}

function clear() {
  ++generation;
  pending = undefined;
  queued = undefined;
  lists.value = [];
  loaded.value = false;
  loading.value = false;
  error.value = "";
}

// The persistent layout owns this single listener, including on pages without a sidebar.
function revalidateOnVisible() {
  let hiddenAt = document.hidden ? Date.now() : undefined;
  function visibility() {
    if (document.hidden) hiddenAt = Date.now();
    else {
      if (hiddenAt !== undefined && Date.now() - hiddenAt > 60_000 && loaded.value)
        void revalidate().catch(() => {});
      hiddenAt = undefined;
    }
  }
  document.addEventListener("visibilitychange", visibility);
  return () => document.removeEventListener("visibilitychange", visibility);
}

export const listsStore = {
  lists,
  loading,
  loaded,
  error,
  ensure,
  refresh,
  clear,
  revalidateOnVisible,
};
