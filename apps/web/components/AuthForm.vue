<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { Link, useRouter } from "@void/vue";
import { api } from "../lib/api.ts";
import { setupTokenRequiredKey } from "../composables/session.ts";
import { useTask } from "../composables/task.ts";
const props = defineProps<{ mode: "setup" | "login" | "register" }>();
const router = useRouter();
const name = ref("");
const email = ref("");
const password = ref("");
const setupToken = ref("");
const tokenRequired = inject(setupTokenRequiredKey, ref(false));
const code = computed(() => router.query.get("code") ?? "");
const { busy, error, run } = useTask();
const copy = computed(
  () =>
    ({
      setup: {
        heading: "Set up CloudKeep",
        lead: "Create the admin account. Everyone else joins with an invite link.",
        action: "Create account",
      },
      login: { heading: "Sign in", lead: "Welcome back to CloudKeep.", action: "Sign in" },
      register: {
        heading: "Create your account",
        lead: "You’ve been invited to CloudKeep.",
        action: "Create account",
      },
    })[props.mode],
);
function submit() {
  return run(async () => {
    if (props.mode !== "login") {
      await api(props.mode === "setup" ? "/api/setup" : "/api/register", {
        method: "POST",
        redirectOnUnauthorized: false,
        body: {
          name: name.value,
          email: email.value,
          password: password.value,
          ...(props.mode === "register" ? { inviteCode: code.value } : {}),
          ...(props.mode === "setup" && tokenRequired.value
            ? { setupToken: setupToken.value }
            : {}),
        },
      });
    }
    await api("/api/auth/sign-in/email", {
      method: "POST",
      body: { email: email.value, password: password.value },
      redirectOnUnauthorized: false,
    });
    // A document navigation refreshes the layout's cookie-backed session after signing in.
    window.location.assign("/");
  });
}
</script>
<template>
  <section class="auth fade-in">
    <div class="head">
      <h1>{{ copy.heading }}</h1>
      <p>{{ copy.lead }}</p>
    </div>
    <div v-if="mode === 'register' && !code" class="alert" role="alert">
      <span>This page needs an invite link. Ask your admin for one.</span>
    </div>
    <form v-else class="stack" @submit.prevent="submit">
      <div v-if="mode === 'setup' && tokenRequired" class="field">
        <label for="setup-token">Setup token</label
        ><input
          id="setup-token"
          v-model="setupToken"
          type="password"
          autocomplete="off"
          required
          maxlength="200"
          spellcheck="false"
          aria-describedby="setup-token-hint"
        /><span id="setup-token-hint" class="hint"
          >Set as <code>SETUP_TOKEN</code> when this app was deployed.</span
        >
      </div>
      <div v-if="mode !== 'login'" class="field">
        <label for="name">Name</label
        ><input id="name" v-model="name" autocomplete="name" required maxlength="100" />
      </div>
      <div class="field">
        <label for="email">Email</label
        ><input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          maxlength="254"
        />
      </div>
      <div class="field">
        <label for="password">Password</label
        ><input
          id="password"
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          required
          :minlength="mode === 'login' ? undefined : 12"
          maxlength="128"
          :aria-describedby="mode !== 'login' ? 'password-hint' : undefined"
        /><span v-if="mode !== 'login'" id="password-hint" class="hint"
          >At least 12 characters.</span
        >
      </div>
      <div v-if="error" class="alert" role="alert">
        <span>{{ error }}</span>
      </div>
      <button class="primary submit" :disabled="busy">
        {{ busy ? "One moment…" : copy.action }}
      </button>
    </form>
    <p class="foot">
      <template v-if="mode === 'login'">No account? Ask your admin for an invite link.</template>
      <template v-else-if="mode === 'register'"
        >Already have an account? <Link href="/login" class="link">Sign in</Link></template
      >
    </p>
  </section>
</template>
<style scoped>
.auth {
  max-width: 22rem;
  margin: 10vh auto 0;
}
.head {
  margin-bottom: 1.75rem;
}
.head p {
  margin-top: 0.35rem;
  color: var(--muted);
}
.submit {
  width: 100%;
  height: 2.5rem;
  margin-top: 0.25rem;
}
.foot {
  margin-top: 1.5rem;
  font-size: 0.86rem;
  color: var(--muted);
}
</style>
