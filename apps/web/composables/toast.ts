import { ref } from "vue";

// One app-wide toast for confirmations; errors stay inline next to their cause.
export const toast = ref<{ id: number; text: string } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
export function showToast(text: string) {
  toast.value = { id: Date.now(), text };
  clearTimeout(timer);
  timer = setTimeout(() => (toast.value = null), 2800);
}
