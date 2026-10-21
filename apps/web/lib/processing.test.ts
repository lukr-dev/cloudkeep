import { beforeEach, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({
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
vi.mock("void/storage", () => ({ storage: { get: mocks.get } }));
vi.mock("./metadata.ts", () => ({ fetchMetadata: mocks.fetchMetadata, MAX_CONTENT_CHARS: 20_000 }));
vi.mock("./settings.ts", () => ({
  complete: mocks.complete,
  effectivePrompts: async () => ({
    tagging: { template: "{{content}}" },
    summary: { template: "{{content}}" },
  }),
}));
vi.mock("./tags.ts", () => ({ linkTag: mocks.linkTag }));
import { processBookmark } from "./processing.ts";
const job = { bookmarkId: "b", userId: "u", runId: "r" };
beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.get.mockRejectedValue(new Error("private binding error"));
  await processBookmark(job);
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
