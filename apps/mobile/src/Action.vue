<script setup lang="ts">
withDefaults(
  defineProps<{ label: string; disabled?: boolean; primary?: boolean; danger?: boolean }>(),
  { disabled: false, primary: false, danger: false },
);
const emit = defineEmits<{ press: [] }>();
</script>
<template>
  <view
    class="action"
    :class="{ primary, danger, disabled }"
    accessibility-element
    accessibility-traits="button"
    :accessibility-label="label"
    @tap="!disabled && emit('press')"
  >
    <text class="caption" :class="{ primary, danger }">{{ label }}</text>
  </view>
</template>
<style scoped>
.action {
  min-height: 44px;
  padding: 12px 14px;
  margin-bottom: 8px;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  background-color: #fff;
}
.caption {
  font-size: 14px;
  color: #27272a;
  text-align: center;
}
.action.primary {
  background-color: #15803d;
  border-color: #15803d;
}
.caption.primary {
  color: #fff;
}
.caption.danger {
  color: #b91c1c;
}
.disabled {
  opacity: 0.45;
}
</style>
