import { beforeEach, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({
  enabled: true,
  list: undefined as unknown,
  effectivePrompts: vi.fn(),
  prepareAudio: vi.fn(),
  processAudio: vi.fn(),
  claim: [] as unknown[],
  profile: [] as unknown[],
  patches: [] as Record<string, unknown>[],
  fetchMetadata: vi.fn(),
  get: vi.fn(),
  toMarkdown: vi.fn(),
  complete: vi.fn(),
  linkTag: vi.fn(),
}));
vi.mock("void/db", async (original) => {
  const actual = await original<typeof import("void/db")>();
  return {
    ...actual,
    db: {
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          mocks.patches.push(patch);
          return { where: () => ({ returning: async () => mocks.claim }) };
        },
      }),
      select: () => ({
        from: () => ({
          where: () => Object.assign(Promise.resolve(mocks.profile), { limit: async () => [] }),
        }),
      }),
    },
  };
});
vi.mock("void/ai", () => ({ ai: { toMarkdown: mocks.toMarkdown } }));
vi.mock("void/storage", () => ({
  storage: new Proxy(
    { get: mocks.get, put: () => {} },
    {
      get(target, prop) {
        if (!mocks.enabled) throw new Error("Missing storage");
        return Reflect.get(target, prop);
      },
    },
  ),
}));
vi.mock("./metadata.ts", () => ({ fetchMetadata: mocks.fetchMetadata, MAX_CONTENT_CHARS: 20_000 }));
vi.mock("./processing-list.ts", () => ({ processingList: async () => mocks.list }));
vi.mock("./audio.ts", () => ({
  prepareAudio: mocks.prepareAudio,
  processAudio: mocks.processAudio,
}));
vi.mock("./settings.ts", () => ({
  complete: mocks.complete,
  effectivePrompts: mocks.effectivePrompts,
}));
vi.mock("./tags.ts", () => ({ linkTag: mocks.linkTag }));
import { processBookmark } from "./processing.ts";
const job = { bookmarkId: "b", userId: "u", runId: "r" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled = true;
  mocks.list = undefined;
  mocks.effectivePrompts.mockResolvedValue({
    tagging: { template: "{{content}}" },
    summary: { template: "{{content}}" },
  });
  mocks.patches.length = 0;
  mocks.profile = [];
  mocks.claim = [
    {
      type: "text",
      title: null,
      noteText: "# Full note",
      titleEdited: false,
      descriptionEdited: false,
    },
  ];
});
it("processes note Markdown without fetching a page and uses it for the user's AI provider", async () => {
  mocks.enabled = false;
  mocks.profile = [{ provider: "workers-ai", autoSummary: true }];
  mocks.complete.mockResolvedValue("Summary");
  await processBookmark(job);
  expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  expect(mocks.toMarkdown).not.toHaveBeenCalled();
  expect(mocks.complete).toHaveBeenCalledWith(mocks.profile[0], "# Full note");
  expect(mocks.patches).toContainEqual({ summary: "Summary" });
  expect(mocks.patches.at(-1)).toMatchObject({ status: "done", error: null });
});
it("extracts asset Markdown and caps persisted content", async () => {
  mocks.claim = [
    {
      type: "asset",
      assetKey: "private",
      assetName: "document.pdf",
      assetMime: "application/pdf",
      title: "document",
    },
  ];
  mocks.get.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(10) });
  mocks.toMarkdown.mockResolvedValue({ format: "markdown", data: "a".repeat(25_000) });
  await processBookmark(job);
  expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  expect(mocks.toMarkdown).toHaveBeenCalledWith({ name: "document.pdf", blob: expect.any(Blob) });
  expect(mocks.patches[1]?.contentText).toHaveLength(20_000);
  expect(mocks.patches.at(-1)).toMatchObject({ status: "done" });
});
it("continues with filename/title when extraction is unavailable", async () => {
  mocks.claim = [{ type: "asset", assetKey: "private", assetName: "image.png", title: "image" }];
  mocks.get.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(10) });
  mocks.toMarkdown.mockRejectedValue(new Error("private AI binding error"));
  await processBookmark(job);
  expect(mocks.patches[1]?.contentText).toBe("image.png");
  expect(mocks.patches.at(-1)).toMatchObject({ status: "done", error: null });
});
it("leaves stale jobs alone", async () => {
  mocks.claim = [];
  await processBookmark(job);
  expect(mocks.patches).toHaveLength(1);
  expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
});
it("still fetches link metadata and stores only controlled errors", async () => {
  mocks.claim = [{ type: "link", url: "https://example.com" }];
  mocks.fetchMetadata.mockRejectedValue(new Error("secret provider token"));
  await processBookmark(job);
  expect(mocks.fetchMetadata).toHaveBeenCalledWith("https://example.com");
  expect(mocks.patches.at(-1)).toMatchObject({
    status: "failed",
    error: "Couldn’t process this bookmark. Check your AI settings, then retry.",
  });
});

it("marks existing assets failed with a controlled message while storage is disabled", async () => {
  mocks.enabled = false;
  mocks.claim = [{ type: "asset", assetKey: "private", assetName: "image.png" }];
  await processBookmark(job);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.toMarkdown).not.toHaveBeenCalled();
  expect(mocks.patches.at(-1)).toMatchObject({
    status: "failed",
    error: "File uploads are disabled on this server",
  });
});

it("reuses the processing list's model and prompts while preserving the user's keys", async () => {
  mocks.claim = [{ type: "text", processingListId: "l", noteText: "Note" }];
  mocks.list = { id: "l", provider: "openrouter", model: "list-model", reasoningEffort: "high" };
  mocks.profile = [
    {
      userId: "u",
      provider: "openai",
      model: "user-model",
      openrouterKey: "encrypted",
      autoSummary: true,
    },
  ];
  mocks.complete.mockResolvedValue("List summary");
  await processBookmark(job);
  expect(mocks.effectivePrompts).toHaveBeenCalledWith("u", "l");
  expect(mocks.complete).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: "openrouter",
      model: "list-model",
      reasoningEffort: "high",
      openrouterKey: "encrypted",
    }),
    "Note",
  );
  expect(mocks.patches.at(-1)).toMatchObject({ status: "done" });
});
it("reports a missing key for a list override clearly", async () => {
  mocks.list = { id: "l", provider: "openai" };
  mocks.profile = [{ provider: "workers-ai" }];
  await processBookmark(job);
  expect(mocks.patches.at(-1)).toMatchObject({
    status: "failed",
    error: "Set an API key for the selected list provider",
  });
});
it("starts short audio after normal processing even with automatic summaries off", async () => {
  mocks.list = { id: "l", audioEnabled: true };
  mocks.profile = [{ provider: null, autoSummary: false }];
  mocks.prepareAudio.mockResolvedValue({ runId: "audio-run" });
  await processBookmark(job);
  expect(mocks.prepareAudio).toHaveBeenCalledWith("b", "short");
  expect(mocks.processAudio).toHaveBeenCalledWith({
    ...job,
    type: "audio",
    kind: "short",
    runId: "audio-run",
  });
  expect(mocks.patches.at(-1)).toMatchObject({ status: "done" });
});
it("silently skips list audio when storage is disabled", async () => {
  mocks.enabled = false;
  mocks.list = { id: "l", audioEnabled: true };
  await processBookmark(job);
  expect(mocks.prepareAudio).not.toHaveBeenCalled();
  expect(mocks.processAudio).not.toHaveBeenCalled();
  expect(mocks.patches.at(-1)).toMatchObject({ status: "done" });
});
