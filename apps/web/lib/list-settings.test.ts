import { expect, it } from "vite-plus/test";
import { chooseProcessingList, resolvePrompts, listProfile } from "./list-settings.ts";
import { DEFAULT_PROMPTS } from "./prompts.ts";
import type { lists, profiles } from "../db/schema.ts";
it("inherits user prompts then built-ins, with each list kind independently resettable", () => {
  const rows = [
    { listId: null, kind: "summary" as const, template: "user" },
    { listId: "a", kind: "summary" as const, template: "list" },
    { listId: "b", kind: "tagging" as const, template: "other" },
  ];
  expect(resolvePrompts(rows, "a").summary).toEqual({
    template: "list",
    defaultTemplate: "user",
    isDefault: false,
  });
  expect(resolvePrompts(rows, "b").summary).toEqual({
    template: "user",
    defaultTemplate: "user",
    isDefault: true,
  });
  expect(resolvePrompts(rows, null).summary).toEqual({
    template: "user",
    defaultTemplate: DEFAULT_PROMPTS.summary,
    isDefault: false,
  });
  expect(resolvePrompts(rows, "a").detailed_summary.template).toBe(
    DEFAULT_PROMPTS.detailed_summary,
  );
  expect(
    resolvePrompts(
      rows.filter((p) => p.listId !== "a"),
      "a",
    ).summary.template,
  ).toBe("user");
});
it("chooses only the first customized list in request order, including prompt-only or TTS-only customization", () => {
  const rows = [
    { id: "plain", provider: null, audioEnabled: false, ttsProvider: null },
    { id: "model", provider: "openai" as const, audioEnabled: false, ttsProvider: null },
    { id: "audio", provider: null, audioEnabled: true, ttsProvider: null },
    { id: "tts", provider: null, audioEnabled: false, ttsProvider: "workers-ai" as const },
  ];
  expect(chooseProcessingList(["plain", "prompt", "model"], rows, ["prompt"])).toBe("prompt");
  expect(chooseProcessingList(["audio", "model"], rows, [])).toBe("audio");
  expect(chooseProcessingList(["model", "audio"], rows, [])).toBe("model");
  expect(chooseProcessingList(["plain", "tts"], rows, [])).toBe("tts");
  expect(chooseProcessingList(["plain"], rows, [])).toBeNull();
  expect(chooseProcessingList([], rows, ["prompt"])).toBeNull();
});
it("uses only list AI fields and retains the user's encrypted keys and automation preferences", () => {
  const profile = {
    provider: "openai",
    model: "user",
    openaiKey: "encrypted",
    autoTag: true,
  } as typeof profiles.$inferSelect;
  const list = {
    provider: "openrouter",
    model: null,
    reasoningEffort: "high",
    openaiKey: "untrusted",
  } as unknown as typeof lists.$inferSelect;
  expect(listProfile(profile, list)).toEqual({
    ...profile,
    provider: "openrouter",
    model: null,
    reasoningEffort: "high",
  });
  expect(listProfile(profile)).toBe(profile);
});
