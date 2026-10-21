import { watch } from "vue";

let nextId = 0;
// Native input has default-value + setValue, rather than a controlled value prop.
export function inputBinding(value: () => string, changed: (value: string) => void) {
  const id = `cloudkeep-input-${++nextId}`;
  let nativeValue = value();
  const initialValue = nativeValue;
  watch(
    value,
    (next) => {
      if (next === nativeValue) return;
      nativeValue = next;
      lynx
        .createSelectorQuery()
        .select(`#${id}`)
        .invoke({ method: "setValue", params: { value: next } })
        .exec();
    },
    { flush: "post" },
  );
  return {
    id,
    initialValue,
    input(next: string) {
      nativeValue = next;
      changed(next);
    },
  };
}
