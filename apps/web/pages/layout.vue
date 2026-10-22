<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref, watch } from "vue";
import { Link, useRouter } from "@void/vue";
import { api, message, type Features, type Me, type User } from "../lib/api.ts";
import { featuresKey, sessionKey, setupTokenRequiredKey } from "../composables/session.ts";
import { listsStore } from "../composables/lists.ts";
import { toast } from "../composables/toast.ts";
import Icon from "../components/Icon.vue";
import { trackNavigation } from "../lib/navigation.ts";
import "../style.css";
const repository = "https://github.com/lukr-dev/cloudkeep";
const router = useRouter();
const user = ref<User | null>(null);
provide(sessionKey, user);
const features = ref<Features>({ files: false, audio: false });
provide(featuresKey, features);
const ready = ref(false);
const error = ref("");
const signingOut = ref(false);
const setupTokenRequired = ref(false);
provide(setupTokenRequiredKey, setupTokenRequired);
let generation = 0;
let checked = false;
let checking = false;
let needsSetup = false;
function guard() {
  if (!checked) return;
  const path = router.path;
  let target: string | undefined;
  if (needsSetup) {
    if (path !== "/setup") target = "/setup";
  } else if (path === "/setup" || (user.value && ["/login", "/register"].includes(path))) {
    target = user.value ? "/" : "/login";
  } else if (!user.value && !["/login", "/register"].includes(path)) {
    target = "/login";
  } else if (path.startsWith("/admin") && user.value?.role !== "admin") {
    target = "/";
  }
  if (target) {
    void router.visit(target, { replace: true }).catch((cause) => {
      error.value = message(cause);
    });
  } else ready.value = true;
}
async function check() {
  if (checking) return;
  checking = true;
  const current = ++generation;
  error.value = "";
  try {
    const status = await api<{ needsSetup: boolean; tokenRequired?: boolean }>("/api/setup/status");
    let me: Me | null = null;
    if (!status.needsSetup) {
      try {
        me = await api<Me>("/api/me", { redirectOnUnauthorized: false });
      } catch (cause) {
        if (!(cause instanceof Error && "status" in cause && cause.status === 401)) throw cause;
      }
    }
    if (current !== generation) return;
    needsSetup = status.needsSetup;
    setupTokenRequired.value = status.tokenRequired ?? false;
    user.value = me?.user ?? null;
    features.value = me?.features ?? { files: false, audio: false };
    checked = true;
    guard();
  } catch (cause) {
    if (current === generation) error.value = message(cause);
  } finally {
    checking = false;
  }
}
let stopTracking: (() => void) | undefined;
let stopRevalidation: (() => void) | undefined;
onUnmounted(() => {
  ++generation;
  stopTracking?.();
  stopRevalidation?.();
});
onMounted(() => {
  stopTracking = trackNavigation();
  stopRevalidation = listsStore.revalidateOnVisible();
  watch(() => router.path, guard);
  void check();
});
async function signOut() {
  signingOut.value = true;
  error.value = "";
  try {
    await api("/api/auth/sign-out", { method: "POST", body: {} });
    ++generation;
    user.value = null;
    listsStore.clear();
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
    <div class="shell">
      <Link href="/" class="brand" aria-label="CloudKeep home"
        ><span class="brand-mark"><Icon name="mark" :size="13" /></span>CloudKeep</Link
      >
      <nav v-if="user" class="nav" aria-label="Main">
        <Link href="/" :aria-current="router.path === '/' ? 'page' : undefined">Bookmarks</Link>
        <Link href="/lists" :aria-current="router.path === '/lists' ? 'page' : undefined"
          >Lists</Link
        >
        <Link href="/settings" :aria-current="router.path === '/settings' ? 'page' : undefined"
          >Settings</Link
        >
        <Link
          v-if="user.role === 'admin'"
          href="/admin/invites"
          :aria-current="router.path === '/admin/invites' ? 'page' : undefined"
          >Invites</Link
        >
      </nav>
      <button v-if="user" class="ghost small sign-out" :disabled="signingOut" @click="signOut">
        Sign out
      </button>
    </div>
  </header>
  <main id="main" class="main shell" tabindex="-1">
    <div v-if="error" role="alert" class="alert">
      <span>{{ error }}</span
      ><button @click="check">Try again</button>
    </div>
    <slot v-if="ready" />
    <p v-else-if="!error" role="status" class="sr-only">Loading</p>
  </main>
  <footer class="footer">
    <div class="shell">
      <p class="footer-brand">
        <span class="brand-mark"><Icon name="mark" :size="11" /></span>
        <span
          ><strong>CloudKeep</strong> · Simple bookmarking that runs entirely on Cloudflare.</span
        >
      </p>
      <nav class="footer-links" aria-label="Project">
        <a :href="repository" target="_blank" rel="noopener noreferrer"
          ><Icon name="github" :size="14" />GitHub</a
        >
        <a :href="`${repository}/issues`" target="_blank" rel="noopener noreferrer"
          >Report an issue</a
        >
      </nav>
    </div>
  </footer>
  <Transition name="toast">
    <div v-if="toast" :key="toast.id" class="toast" role="status" aria-live="polite">
      <Icon name="check" :size="14" />{{ toast.text }}
    </div>
  </Transition>
</template>
<style>
.toast {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  z-index: 30;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  background: var(--ink);
  color: var(--on-ink);
  font-size: 0.86rem;
  font-weight: 500;
  box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.25);
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.25s var(--ease),
    transform 0.25s var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
