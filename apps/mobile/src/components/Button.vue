<script setup lang="ts">
import Icon from "./Icon.vue";
import type { IconName } from "../icons.ts";
withDefaults(
  defineProps<{
    label: string;
    icon?: IconName;
    iconOnly?: boolean;
    primary?: boolean;
    danger?: boolean;
    quiet?: boolean;
    disabled?: boolean;
  }>(),
  { disabled: false },
);
const emit = defineEmits<{ press: [] }>();
</script>
<template>
  <view
    class="button"
    :class="{ primary, danger, quiet, disabled, 'icon-button': iconOnly }"
    accessibility-element
    accessibility-traits="button"
    :accessibility-label="label"
    @tap="!disabled && emit('press')"
  >
    <Icon v-if="icon" :name="icon" :tone="primary ? 'on-ink' : danger ? 'danger' : 'text'" />
    <text
      v-if="!iconOnly"
      class="button-label"
      :class="{ 'on-ink': primary, 'danger-text': danger }"
      >{{ label }}</text
    >
  </view>
</template>
