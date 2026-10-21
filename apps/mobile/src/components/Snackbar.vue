<script setup lang="ts">
defineProps<{ message: string; nav: boolean }>();
</script>
<template>
  <view class="snackbar" :class="{ 'above-nav': nav }" accessibility-live-region="polite"
    ><text class="snackbar-text">{{ message }}</text></view
  >
</template>
