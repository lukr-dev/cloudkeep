<script setup lang="ts">
defineProps<{ label: string; selected?: boolean; disabled?: boolean }>();
defineEmits<{ press: [] }>();
</script>
<template>
  <view
    class="chip-hit"
    :class="{ disabled }"
    accessibility-element
    accessibility-traits="button"
    :accessibility-label="label"
    @tap="!disabled && $emit('press')"
    ><view class="chip" :class="{ selected }"
      ><text class="chip-label" :class="{ 'accent-text': selected }">{{ label }}</text></view
    ></view
  >
</template>
