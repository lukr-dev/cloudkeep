<script setup lang="ts">
// A handful of 16px line icons; keeps the UI dependency-free.
defineProps<{
  name:
    | "file"
    | "search"
    | "external"
    | "plus"
    | "x"
    | "arrow-left"
    | "mark"
    | "refresh"
    | "check"
    | "github";
  size?: number;
}>();
</script>
<template>
  <svg
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-if="name === 'file'" d="M9 1.5H3v13h10v-9L9 1.5zM9 1.5v4h4M5.5 9h5M5.5 11.5h3" />
    <template v-else-if="name === 'search'">
      <circle cx="7" cy="7" r="4.25" />
      <path d="m13.25 13.25-3.1-3.1" />
    </template>
    <path v-else-if="name === 'external'" d="M6.5 3.5h-3v9h9v-3M9.5 2.75h3.75V6.5M13 3 7.75 8.25" />
    <path v-else-if="name === 'plus'" d="M8 3.25v9.5M3.25 8h9.5" />
    <path v-else-if="name === 'x'" d="m4.25 4.25 7.5 7.5m0-7.5-7.5 7.5" />
    <path v-else-if="name === 'arrow-left'" d="M12.75 8H3.5M7.25 4.25 3.5 8l3.75 3.75" />
    <path v-else-if="name === 'mark'" d="M5 2.75h6v10.5L8 10.75l-3 2.5z" />
    <path
      v-else-if="name === 'refresh'"
      d="M12.75 5.5A5 5 0 0 0 3.5 6M3.25 10.5A5 5 0 0 0 12.5 10M12.75 2.75V5.5H10M3.25 13.25V10.5H6"
    />
    <path v-else-if="name === 'check'" d="m3.5 8.25 3 3 6-6.5" />
    <path
      v-else-if="name === 'github'"
      d="M6 12.75c-2.5.75-2.5-1.25-3.5-1.5m7 3v-1.94a1.7 1.7 0 0 0-.47-1.31c1.57-.18 3.22-.77 3.22-3.5a2.72 2.72 0 0 0-.75-1.88 2.53 2.53 0 0 0-.05-1.87s-.59-.18-1.95.73a6.7 6.7 0 0 0-3.5 0C4.64 3.57 4.05 3.75 4.05 3.75A2.53 2.53 0 0 0 4 5.62a2.72 2.72 0 0 0-.75 1.89c0 2.72 1.65 3.31 3.22 3.5a1.7 1.7 0 0 0-.47 1.29v1.95"
    />
  </svg>
</template>
