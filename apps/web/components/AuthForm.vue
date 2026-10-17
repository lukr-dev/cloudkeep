<script setup lang="ts">
import { computed, ref } from "vue";
import { Link, useRouter } from "@void/vue";
import { api } from "../lib/api.ts";
import { useTask } from "../composables/task.ts";
const props = defineProps<{ mode: "setup" | "login" | "register" }>();
const router = useRouter();
const name = ref("");
const email = ref("");
const password = ref("");
const code = computed(() => router.query.get("code") ?? "");
const { busy, error, run } = useTask();
const heading = computed(
  () =>
    ({
      setup: "A home for your links.",
      login: "Welcome back.",
      register: "Make yourself at home.",
    })[props.mode],
);
const action = computed(
  () =>
    ({ setup: "Create admin account", login: "Sign in", register: "Create account" })[props.mode],
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
  <section class="auth">
    <div class="page-heading">
      <p class="muted small">{{ mode === "setup" ? "FIRST-RUN SETUP" : "CLOUDKEEP" }}</p>
      <h1>{{ heading }}</h1>
      <p class="muted">
        {{
          mode === "setup"
            ? "Create the first account to start saving. You’ll be the admin."
            : mode === "register"
              ? "Your invitation is a place to start collecting."
              : "Sign in to your personal collection."
        }}
      </p>
    </div>
    <p v-if="mode === 'register' && !code" class="alert" role="alert">
      An invite is required. Open the complete link shared by your admin.
    </p>
    <form v-else class="panel stack" @submit.prevent="submit">
      <div v-if="mode !== 'login'">
        <label for="name">Name</label
        ><input id="name" v-model="name" autocomplete="name" required maxlength="100" />
      </div>
      <div>
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
      <div>
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
        /><small v-if="mode !== 'login'" id="password-hint" class="muted"
          >At least 12 characters.</small
        >
      </div>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <button class="primary" :disabled="busy">{{ busy ? "Please wait…" : action }}</button>
    </form>
    <p v-if="mode === 'register' || mode === 'setup'" class="small muted" style="margin-top: 1rem">
      Already created an account? <Link href="/login">Sign in</Link>
    </p>
    <p v-else class="small muted" style="margin-top: 1rem">
      New here? Ask your admin for an invite link.
    </p>
  </section>
</template>
