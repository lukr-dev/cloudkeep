import { effectScope, nextTick, ref } from "vue";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { inputBinding } from "./input.ts";

afterEach(() => vi.unstubAllGlobals());
it("prefills native input, preserves typing and applies programmatic resets", async () => {
  const exec = vi.fn();
  const invoke = vi.fn(() => ({ exec }));
  const select = vi.fn(() => ({ invoke }));
  vi.stubGlobal("lynx", { createSelectorQuery: () => ({ select }) });
  const value = ref("https://keep.example");
  const scope = effectScope();
  const binding = scope.run(() =>
    inputBinding(
      () => value.value,
      (next) => {
        value.value = next;
      },
    ),
  )!;
  expect(binding.initialValue).toBe("https://keep.example");
  binding.input("https://keep.example/typed");
  await nextTick();
  expect(value.value).toBe("https://keep.example/typed");
  expect(invoke).not.toHaveBeenCalled();
  value.value = "";
  await nextTick();
  expect(select).toHaveBeenCalledWith(`#${binding.id}`);
  expect(invoke).toHaveBeenCalledWith({ method: "setValue", params: { value: "" } });
  expect(exec).toHaveBeenCalledOnce();
  scope.stop();
});
