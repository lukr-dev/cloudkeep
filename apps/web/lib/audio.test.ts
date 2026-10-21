import { beforeEach, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({
  enabled: true,
  claims: [] as unknown[],
  bookmark: {} as Record<string, unknown>,
  profile: {} as Record<string, unknown>,
  patches: [] as Record<string, unknown>[],
  synthesize: vi.fn(),
  complete: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: undefined as unknown,
}));
vi.mock("void/db", async (original) => {
  const actual = await original<typeof import("void/db")>();
  return {
    ...actual,
    db: {
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          mocks.patches.push(patch);
          return {
            where: () =>
              Object.assign(Promise.resolve(), {
                returning: async () =>
                  patch.status === "processing" ? mocks.claims : [{ bookmarkId: "b" }],
              }),
          };
        },
      }),
      select: () => ({
        from: (table: { userId?: unknown; id?: unknown }) => ({
          where: async () => [table.id ? mocks.bookmark : mocks.profile],
        }),
      }),
    },
  };
});
vi.mock("void/storage", () => ({ storage: { put: mocks.put, delete: mocks.delete } }));
vi.mock("./assets.ts", () => ({ filesEnabled: () => mocks.enabled }));
vi.mock("./processing-list.ts", () => ({ processingList: async () => mocks.list }));
vi.mock("./settings.ts", () => ({
  complete: mocks.complete,
  effectivePrompts: async () => ({
    summary: { template: "short {{content}}" },
    detailed_summary: { template: "long {{content}}" },
  }),
}));
vi.mock("./speech.ts", () => ({
  speechSettings: () => ({ provider: "workers-ai", model: "tts", voice: "luna" }),
  synthesize: mocks.synthesize,
}));
import { processAudio } from "./audio.ts";
const job = {
  type: "audio" as const,
  bookmarkId: "b",
  userId: "u",
  runId: "audio",
  kind: "short" as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled = true;
  mocks.patches.length = 0;
  mocks.claims = [{ r2Key: null }];
  mocks.list = undefined;
  mocks.bookmark = {
    id: "b",
    runId: "r",
    noteText: "Article",
    summary: "old",
    processingListId: null,
  };
  mocks.profile = { userId: "u", provider: "workers-ai", autoSummary: false };
  mocks.complete.mockResolvedValue("Fresh summary");
  mocks.synthesize.mockResolvedValue(new Blob(["mp3"]));
  mocks.delete.mockResolvedValue(undefined);
});
it("forces a fresh summary for audio even with autoSummary off and stores MP3 independently", async () => {
  await processAudio(job);
  expect(mocks.complete).toHaveBeenCalledWith(mocks.profile, "short Article", 1024);
  expect(mocks.synthesize).toHaveBeenCalledWith(
    mocks.profile,
    { provider: "workers-ai", model: "tts", voice: "luna" },
    "Fresh summary",
  );
  expect(mocks.put).toHaveBeenCalledWith(
    expect.stringMatching(/^audio\/u\/b\/short-.*\.mp3$/),
    expect.any(ReadableStream),
    { httpMetadata: { contentType: "audio/mpeg" } },
  );
  expect(mocks.patches.at(-1)).toMatchObject({ status: "done", text: "Fresh summary", size: 3 });
});
it("generates full text with the list AI override and only deletes the old object after replacement", async () => {
  mocks.claims = [{ r2Key: "old-key" }];
  mocks.list = { provider: "openrouter", model: "list-model", reasoningEffort: "high" };
  await processAudio({ ...job, kind: "full" });
  expect(mocks.complete).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "openrouter", model: "list-model" }),
    "long Article",
    2048,
  );
  expect(mocks.delete).toHaveBeenCalledWith("old-key");
  expect(mocks.patches.at(-1)).toMatchObject({ status: "done", text: "Fresh summary" });
});
it("records a clean audio error without changing the bookmark status or deleting its previous audio", async () => {
  mocks.claims = [{ r2Key: "old-key" }];
  mocks.synthesize.mockRejectedValue(new Error("secret provider body"));
  await processAudio({ ...job, kind: "full" });
  expect(mocks.patches.at(-1)).toMatchObject({
    status: "failed",
    error: "Could not generate audio. Check your AI and TTS settings, then retry.",
  });
  expect(mocks.patches.some((p) => p.text === "Fresh summary")).toBe(false);
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
});
it("does no AI or storage work for a stale job or when storage is off", async () => {
  mocks.claims = [];
  await processAudio(job);
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.synthesize).not.toHaveBeenCalled();
  mocks.enabled = false;
  await processAudio(job);
  expect(mocks.put).not.toHaveBeenCalled();
});
