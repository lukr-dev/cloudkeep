import { onUnmounted } from "vue";
export function usePolling(refresh: () => Promise<void>, needed: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  function schedule() {
    clearTimeout(timer);
    if (!stopped && needed())
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, 3000);
  }
  onUnmounted(() => {
    stopped = true;
    clearTimeout(timer);
  });
  return schedule;
}
