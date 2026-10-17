<script setup lang="ts">
// A handful of 16px line icons; keeps the UI dependency-free.
defineProps<{
  name: "search" | "external" | "plus" | "x" | "arrow-left" | "mark" | "refresh" | "check";
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
    <template v-if="name === 'search'">
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
  </svg>
</template>
