import { ref } from "vue";
import { message } from "../lib/api.ts";
export function useTask() {
  const busy = ref(false);
  const error = ref("");
  const notice = ref("");
  async function run(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      await action();
    } catch (cause) {
      error.value = message(cause);
    } finally {
      busy.value = false;
    }
  }
  return { busy, error, notice, run };
}
