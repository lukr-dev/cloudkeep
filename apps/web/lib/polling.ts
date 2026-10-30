export function createPolling(
  refresh: () => Promise<void>,
  needed: () => boolean,
  visibility: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  let delay = 3000;
  let resets = 0;

  function schedule(reset = false) {
    clearTimeout(timer);
    if (reset || !needed()) {
      delay = 3000;
      ++resets;
    }
    if (!stopped && !running && !visibility.hidden && needed())
      timer = setTimeout(() => void tick().catch(() => {}), delay);
  }

  async function tick() {
    if (stopped || running || visibility.hidden || !needed()) return;
    running = true;
    const current = resets;
    try {
      await refresh();
    } finally {
      running = false;
      if (current === resets) delay = Math.min(delay * 1.5, 15_000);
      schedule();
    }
  }

  function onVisibility() {
    clearTimeout(timer);
    if (!visibility.hidden) void tick().catch(() => {});
  }
  visibility.addEventListener("visibilitychange", onVisibility);
  function stop() {
    stopped = true;
    clearTimeout(timer);
    visibility.removeEventListener("visibilitychange", onVisibility);
  }
  return { schedule, stop };
}
