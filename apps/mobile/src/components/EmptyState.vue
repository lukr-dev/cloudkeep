<script setup lang="ts">
import Icon from "./Icon.vue";
import Button from "./Button.vue";
import type { IconName } from "../icons.ts";
defineProps<{
  title: string;
  description?: string;
  icon?: IconName;
  action?: string;
  disabled?: boolean;
}>();
defineEmits<{ action: [] }>();
</script>
<template>
  <view class="empty-state"
    ><view class="empty-icon"><Icon :name="icon || 'bookmark'" tone="muted" /></view
    ><text class="section-title">{{ title }}</text
    ><text v-if="description" class="muted centered">{{ description }}</text
    ><Button v-if="action" :label="action" :disabled="disabled" @press="$emit('action')"
  /></view>
</template>
