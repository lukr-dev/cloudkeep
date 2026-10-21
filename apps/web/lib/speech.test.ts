import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { profiles, lists } from "../db/schema.ts";
const mocks = vi.hoisted(() => ({ run: vi.fn(), decrypt: vi.fn() }));
vi.mock("void/ai", () => ({ ai: { run: mocks.run } }));
vi.mock("void/env", () => ({ env: { ENCRYPTION_KEY: "test-key" } }));
vi.mock("./crypto.ts", () => ({ decrypt: mocks.decrypt }));
import { speechSettings, synthesize } from "./speech.ts";
const profile = {
  userId: "owner",
  ttsProvider: null,
  ttsModel: null,
  ttsVoice: null,
  openaiKey: "encrypted",
} as typeof profiles.$inferSelect;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.decrypt.mockResolvedValue("decrypted");
});
afterEach(() => vi.unstubAllGlobals());
it("inherits all user TTS fields as a unit, with provider defaults for list overrides", () => {
  const user = {
    ...profile,
    ttsProvider: "openai" as const,
    ttsModel: "custom",
    ttsVoice: "custom-voice",
  };
  expect(speechSettings(user)).toEqual({
    provider: "openai",
    model: "custom",
    voice: "custom-voice",
  });
  expect(
    speechSettings(user, {
      ttsProvider: "workers-ai",
      ttsModel: null,
      ttsVoice: null,
    } as typeof lists.$inferSelect),
  ).toEqual({ provider: "workers-ai", model: "@cf/deepgram/aura-2-en", voice: "luna" });
});
it("consumes Workers AI streams and concatenates chunks in order", async () => {
  mocks.run.mockImplementation(async () => new Response("MP3").body);
  const blob = await synthesize(profile, speechSettings(profile), "Sentence. ".repeat(500));
  expect(mocks.run.mock.calls.length).toBeGreaterThan(1);
  expect(await blob.text()).toBe("MP3".repeat(mocks.run.mock.calls.length));
  expect(mocks.run).toHaveBeenCalledWith(
    "@cf/deepgram/aura-2-en",
    expect.objectContaining({ encoding: "mp3", speaker: "luna" }),
  );
});
it("accepts the legacy base64 response shape", async () => {
  mocks.run.mockResolvedValue({ audio: btoa("MP3") });
  expect(await (await synthesize(profile, speechSettings(profile), "Hello")).text()).toBe("MP3");
});
it("uses the owner's stored key and returns only HTTP status on provider failure", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("provider body with secret", { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  const settings = { provider: "openai" as const, model: "tts", voice: "alloy" };
  await expect(synthesize(profile, settings, "Hello")).rejects.toThrow(
    "TTS provider returned HTTP 401",
  );
  expect(mocks.decrypt).toHaveBeenCalledWith("encrypted", "test-key", "owner:openai");
  await expect(synthesize({ ...profile, openaiKey: null }, settings, "Hello")).rejects.toThrow(
    "Set an API key for the selected TTS provider",
  );
  expect(fetcher).toHaveBeenCalledOnce();
});
