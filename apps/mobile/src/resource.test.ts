import { expect, it, vi } from "vite-plus/test";
import { resource } from "./resource.ts";

function deferred() {
  let resolve!: () => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("dedupes ensures and reuses a successful load until invalidated", async () => {
  const request = deferred();
  const task = vi.fn(() => request.promise);
  const data = resource(task);
  const first = data.ensure();
  expect(data.ensure()).toBe(first);
  expect(task).toHaveBeenCalledTimes(1);
  request.resolve();
  await first;
  await data.ensure();
  expect(task).toHaveBeenCalledTimes(1);
  data.invalidate();
  await data.ensure();
  expect(task).toHaveBeenCalledTimes(2);
});

it("coalesces mutation refreshes, waits for a newer request, and can queue again", async () => {
  const first = deferred();
  const second = deferred();
  const third = deferred();
  const task = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(third.promise);
  const data = resource(task);
  const initial = data.ensure();
  const refresh = data.refresh();
  expect(data.refresh()).toBe(refresh);
  expect(data.ensure()).toBe(refresh);
  expect(task).toHaveBeenCalledTimes(1);
  first.resolve();
  await initial;
  expect(data.refresh()).toBe(refresh);
  await Promise.resolve();
  expect(task).toHaveBeenCalledTimes(2);
  const afterSecondMutation = data.refresh();
  second.resolve();
  await refresh;
  await Promise.resolve();
  expect(task).toHaveBeenCalledTimes(3);
  third.resolve();
  await afterSecondMutation;
  await data.ensure();
  expect(task).toHaveBeenCalledTimes(3);
});

it("retries failed loads and still refreshes after an in-flight failure", async () => {
  const first = deferred();
  const task = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
  const data = resource(task);
  const initial = data.ensure();
  const failure = expect(initial).rejects.toThrow("Offline");
  const refresh = data.refresh();
  first.reject(new Error("Offline"));
  await failure;
  await refresh;
  expect(task).toHaveBeenCalledTimes(2);
  task.mockRejectedValueOnce(new Error("Offline again"));
  await expect(data.refresh()).rejects.toThrow("Offline again");
  await data.ensure();
  expect(task).toHaveBeenCalledTimes(4);
});

it("fetches again when a mutation invalidates a request already in flight", async () => {
  const first = deferred();
  const task = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
  const data = resource(task);
  const initial = data.ensure();
  data.invalidate();
  const updated = data.ensure();
  expect(task).toHaveBeenCalledTimes(1);
  first.resolve();
  await initial;
  await updated;
  expect(task).toHaveBeenCalledTimes(2);
});

it("clears queued account work without letting old completions clear new requests", async () => {
  const first = deferred();
  const second = deferred();
  const task = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockResolvedValue(undefined);
  const data = resource(task);
  const initial = data.ensure();
  const oldRefresh = data.refresh();
  data.clear();
  const current = data.ensure();
  first.resolve();
  await initial;
  await oldRefresh;
  expect(data.ensure()).toBe(current);
  expect(task).toHaveBeenCalledTimes(2);
  const newRefresh = data.refresh();
  second.resolve();
  await current;
  await newRefresh;
  expect(task).toHaveBeenCalledTimes(3);
});
