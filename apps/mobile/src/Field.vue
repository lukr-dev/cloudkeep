<script setup lang="ts">
import { inputBinding } from "./input.ts";

const props = withDefaults(
  defineProps<{
    label: string;
    value: string;
    placeholder?: string;
    password?: boolean;
    maxLength?: number;
  }>(),
  { placeholder: "", password: false, maxLength: 8000 },
);
const emit = defineEmits<{ change: [value: string] }>();
const binding = inputBinding(
  () => props.value,
  (value) => emit("change", value),
);
</script>
<template>
  <view class="field">
    <text class="label">{{ label }}</text>
    <input
      :id="binding.id"
      :default-value="binding.initialValue"
      :placeholder="placeholder"
      :type="password ? 'password' : 'text'"
      :maxlength="maxLength"
      :accessibility-label="label"
      @input="binding.input($event.detail.value)"
    />
  </view>
</template>
<style scoped>
.field {
  margin-bottom: 14px;
}
.label {
  font-size: 13px;
  color: #52525b;
  margin-bottom: 6px;
}
input {
  width: 100%;
  height: 46px;
  padding: 10px 12px;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  color: #18181b;
  background-color: #fff;
  font-size: 16px;
}
</style>
