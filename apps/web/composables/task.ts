import { customRef, ref } from "vue";
import { message } from "../lib/api.ts";
import { showToast } from "./toast.ts";
export function useTask() {
  const busy = ref(false);
  const error = ref("");
  // Setting a notice shows the global toast instead of rendering inline.
  const notice = customRef<string>(() => ({
    get: () => "",
    set: (text) => {
      if (text) showToast(text);
    },
  }));
  async function run(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
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
