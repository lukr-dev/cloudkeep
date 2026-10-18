<script setup lang="ts">
import Button from "./Button.vue";
defineProps<{ title: string; back?: boolean; close?: boolean; disabled?: boolean }>();
defineEmits<{ back: [] }>();
</script>
<template>
  <view class="app-bar"
    ><Button
      v-if="back || close"
      :icon="close ? 'close' : 'back'"
      :label="close ? 'Cancel' : 'Back'"
      icon-only
      quiet
      :disabled="disabled"
      @press="$emit('back')" /><text class="screen-title">{{ title }}</text
    ><slot
  /></view>
</template>
