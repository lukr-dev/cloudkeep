<script setup lang="ts">
import { onMounted, provide, ref, watch } from "vue";
import { Link, useRouter } from "@void/vue";
import { api, message, type User } from "../lib/api.ts";
import { sessionKey } from "../composables/session.ts";
import "../style.css";
const router = useRouter();
const user = ref<User | null>(null);
provide(sessionKey, user);
const ready = ref(false);
const error = ref("");
const signingOut = ref(false);
let generation = 0;
async function check() {
  const current = ++generation;
  ready.value = false;
  error.value = "";
  try {
    const { needsSetup } = await api<{ needsSetup: boolean }>("/api/setup/status");
    if (current !== generation) return;
    const path = router.path;
    if (needsSetup) {
      user.value = null;
      if (path !== "/setup") {
        await router.visit("/setup", { replace: true });
        return;
      }
    } else {
      try {
        user.value = (await api<{ user: User }>("/api/me", { redirectOnUnauthorized: false })).user;
      } catch (cause) {
        if (!(cause instanceof Error && "status" in cause && cause.status === 401)) throw cause;
        user.value = null;
      }
      if (current !== generation) return;
      if (path === "/setup" || (user.value && ["/login", "/register"].includes(path))) {
        await router.visit(user.value ? "/" : "/login", { replace: true });
        return;
      }
      if (!user.value && !["/login", "/register"].includes(path)) {
        await router.visit("/login", { replace: true });
        return;
      }
      if (path.startsWith("/admin") && user.value?.role !== "admin") {
        await router.visit("/", { replace: true });
        return;
      }
    }
    ready.value = true;
  } catch (cause) {
    if (current === generation) error.value = message(cause);
  }
}
onMounted(() => {
  watch(
    () => router.path,
    () => void check(),
    { immediate: true },
  );
});
async function signOut() {
  signingOut.value = true;
  error.value = "";
  try {
    await api("/api/auth/sign-out", { method: "POST", body: {} });
    user.value = null;
    await router.visit("/login");
  } catch (cause) {
    error.value = message(cause);
  } finally {
    signingOut.value = false;
  }
}
</script>
<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="header">
    <Link href="/" class="brand">CloudKeep<span class="brand-dot">.</span></Link>
    <nav v-if="user" aria-label="Main navigation">
      <Link href="/" :aria-current="router.path === '/' ? 'page' : undefined">Bookmarks</Link>
      <Link href="/lists" :aria-current="router.path === '/lists' ? 'page' : undefined">Lists</Link>
      <Link href="/settings" :aria-current="router.path === '/settings' ? 'page' : undefined"
        >Settings</Link
      >
      <Link
        v-if="user.role === 'admin'"
        href="/admin/invites"
        :aria-current="router.path === '/admin/invites' ? 'page' : undefined"
        >Invites</Link
      >
      <button class="text-button" :disabled="signingOut" @click="signOut">Sign out</button>
    </nav>
    <span v-else class="muted small">Your links. Your space.</span>
  </header>
  <main id="main" class="main" tabindex="-1">
    <div v-if="error" role="alert" class="alert">
      {{ error }} <button @click="check">Try again</button>
    </div>
    <slot v-if="ready" />
    <p v-else-if="!error" role="status" class="muted">Opening your space…</p>
  </main>
</template>
