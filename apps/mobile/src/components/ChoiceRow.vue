<script setup lang="ts">
import Icon from "./Icon.vue";
defineProps<{
  label: string;
  description?: string;
  checked: boolean;
  radio?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ press: [] }>();
</script>
<template>
  <view
    class="choice-row"
    :class="{ disabled }"
    accessibility-element
    accessibility-traits="button"
    :accessibility-label="`${label}, ${checked ? 'selected' : 'not selected'}`"
    @tap="!disabled && $emit('press')"
    ><view class="grow"
      ><text class="medium">{{ label }}</text
      ><text v-if="description" class="meta">{{ description }}</text></view
    ><view class="choice" :class="{ checked, radio }"
      ><view v-if="radio && checked" class="radio-dot" /><Icon
        v-else-if="checked"
        name="check"
        tone="on-ink" /></view
  ></view>
</template>
