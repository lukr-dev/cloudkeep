<script setup lang="ts">
import Button from "./Button.vue";
defineProps<{ message: string; busy: boolean }>();
defineEmits<{ cancel: []; confirm: [] }>();
</script>
<template>
  <view class="dialog-scrim"
    ><view class="dialog" accessibility-element :accessibility-label="message"
      ><text class="section-title">{{ message }}</text
      ><view class="row dialog-actions"
        ><Button label="Cancel" :disabled="busy" @press="$emit('cancel')" /><Button
          label="Delete"
          danger
          :disabled="busy"
          @press="$emit('confirm')" /></view></view
  ></view>
</template>
