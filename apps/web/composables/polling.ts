import { onMounted, onUnmounted } from "vue";
import { createPolling } from "../lib/polling.ts";
export function usePolling(refresh: () => Promise<void>, needed: () => boolean) {
  let polling: ReturnType<typeof createPolling> | undefined;
  onMounted(() => {
    polling = createPolling(refresh, needed, document);
  });
  onUnmounted(() => polling?.stop());
  return (reset = false) => polling?.schedule(reset);
}
