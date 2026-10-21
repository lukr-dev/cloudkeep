<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { iconSvg, type IconName } from "../icons.ts";
const props = withDefaults(
  defineProps<{ name: IconName; tone?: "text" | "muted" | "accent" | "danger" | "on-ink" }>(),
  { tone: "text" },
);
const dark = inject("dark", ref(false));
const colors = {
  text: ["#18181b", "#ececee"],
  muted: ["#71717a", "#9a9aa3"],
  accent: ["#1f7a5a", "#6cc4a0"],
  danger: ["#b4372f", "#f1857c"],
  "on-ink": ["#fafafa", "#18181b"],
};
const content = computed(() => iconSvg(props.name, colors[props.tone][dark.value ? 1 : 0]!));
</script>
<template><svg class="icon" :content="content" /></template>
