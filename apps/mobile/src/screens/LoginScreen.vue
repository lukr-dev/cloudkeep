<script setup lang="ts">
import Field from "../Field.vue";
import Button from "../components/Button.vue";
defineProps<{
  server: string;
  email: string;
  password: string;
  busy: boolean;
  shared: boolean;
  nativeHost: boolean;
}>();
defineEmits<{
  server: [value: string];
  email: [value: string];
  password: [value: string];
  login: [];
  cancel: [];
}>();
</script>
<template>
  <scroll-view class="content" scroll-orientation="vertical"
    ><view class="login"
      ><view class="login-brand"
        ><text class="wordmark">CloudKeep</text
        ><text class="muted">Your links, kept close.</text></view
      ><text v-if="shared" class="muted"
        >Sign in to save your shared link. It will be waiting here.</text
      ><Field label="Server URL" :value="server" @change="$emit('server', $event)" /><Field
        label="Email"
        :value="email"
        :max-length="254"
        @change="$emit('email', $event)"
      /><Field
        label="Password"
        :value="password"
        password
        :max-length="128"
        @change="$emit('password', $event)"
        @confirm="$emit('login')"
      /><Button
        :label="busy ? 'Signing in…' : 'Sign in'"
        primary
        :disabled="busy || !email || !password"
        @press="$emit('login')"
      /><Button
        v-if="shared"
        label="Cancel and return"
        quiet
        :disabled="busy"
        @press="$emit('cancel')"
      /><text v-if="!nativeHost" class="caption dev-note"
        >Explorer preview · credentials last only for this session. Native sharing and browser
        actions require the APK.</text
      ></view
    ></scroll-view
  >
</template>
