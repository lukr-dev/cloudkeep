<script setup lang="ts">
import { ref, watch } from "vue";
import { domain, relativeAge } from "../presentation.ts";
const props = defineProps<{
  url: string;
  siteName?: string | null;
  faviconUrl?: string | null;
  createdAt: number;
}>();
const failed = ref(false);
watch(
  () => props.faviconUrl,
  () => {
    failed.value = false;
  },
);
</script>
<template>
  <view class="source-row"
    ><image
      v-if="faviconUrl && !failed"
      class="favicon"
      :src="faviconUrl"
      mode="aspectFill"
      @error="failed = true"
    /><text v-else-if="faviconUrl && failed" class="favicon-letter">{{
      domain(url).charAt(0).toUpperCase()
    }}</text
    ><text class="source-name" :maxline="1">{{ siteName || domain(url) }}</text
    ><text class="meta">· {{ relativeAge(createdAt) }}</text></view
  >
</template>
