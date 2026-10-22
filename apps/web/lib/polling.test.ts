import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createPolling } from "./polling.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function documentVisibility() {
  return Object.assign(new EventTarget(), { hidden: false });
}

describe("bookmark polling", () => {
  it("backs off from 3s to 15s even when the load schedules again, and resets for new work", async () => {
    const refresh = vi.fn(async () => {
      polling.schedule();
    });
    const polling = createPolling(refresh, () => true, documentVisibility());
    polling.schedule();
    for (const [index, delay] of [3000, 4500, 6750, 10125, 15000, 15000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(refresh).toHaveBeenCalledTimes(index);
      await vi.advanceTimersByTimeAsync(1);
      expect(refresh).toHaveBeenCalledTimes(index + 1);
    }
    polling.schedule(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(refresh).toHaveBeenCalledTimes(7);
    polling.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(7);
  });

  it("pauses while hidden and refreshes immediately on return", async () => {
    const visibility = documentVisibility();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const polling = createPolling(refresh, () => true, visibility);
    const toggle = (hidden: boolean) => {
      visibility.hidden = hidden;
      visibility.dispatchEvent(new Event("visibilitychange"));
    };
    polling.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    toggle(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
    polling.schedule(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).not.toHaveBeenCalled();
    toggle(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    toggle(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4500);
    expect(refresh).toHaveBeenCalledTimes(2);
    polling.stop();
    toggle(true);
    toggle(false);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not overlap slow requests and preserves a reset during a request", async () => {
    let resolve!: () => void;
    const refresh = vi.fn().mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const polling = createPolling(refresh, () => true, documentVisibility());
    polling.schedule();
    await vi.advanceTimersByTimeAsync(3000);
    polling.schedule(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(2999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    polling.stop();
    resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("leaves an in-flight request alone when hidden and stops when work settles or errors", async () => {
    const visibility = documentVisibility();
    let pending = true;
    let resolve!: () => void;
    const refresh = vi.fn().mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const polling = createPolling(refresh, () => pending, visibility);
    polling.schedule();
    await vi.advanceTimersByTimeAsync(3000);
    visibility.hidden = true;
    visibility.dispatchEvent(new Event("visibilitychange"));
    resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    pending = false;
    visibility.hidden = false;
    visibility.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    pending = true;
    refresh.mockImplementationOnce(async () => {
      pending = false;
      throw new Error("Offline");
    });
    polling.schedule(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    polling.stop();
  });
});
