<script setup lang="ts">
import { inputBinding } from "./input.ts";

const props = withDefaults(
  defineProps<{
    label: string;
    value: string;
    placeholder?: string;
    password?: boolean;
    maxLength?: number;
    hideLabel?: boolean;
    confirmType?: "search" | "done";
  }>(),
  { placeholder: "", password: false, maxLength: 8000, confirmType: "done" },
);
const emit = defineEmits<{ change: [value: string]; confirm: [] }>();
const binding = inputBinding(
  () => props.value,
  (value) => emit("change", value),
);
</script>
<template>
  <view class="field">
    <text v-if="!hideLabel" class="label">{{ label }}</text>
    <input
      :id="binding.id"
      :default-value="binding.initialValue"
      :placeholder="placeholder"
      :type="password ? 'password' : 'text'"
      :maxlength="maxLength"
      :confirm-type="confirmType"
      :accessibility-label="label"
      @input="binding.input($event.detail.value)"
      @confirm="emit('confirm')"
    />
  </view>
</template>
<style scoped>
.field {
  width: 100%;
  margin-bottom: 12px;
}
.label {
  font-family: GeistMedium, sans-serif;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 8px;
}
input {
  width: 100%;
  height: 48px;
  padding: 12px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  color: var(--text);
  background-color: var(--surface);
  font-family: Geist, sans-serif;
  font-size: 15px;
}
</style>
