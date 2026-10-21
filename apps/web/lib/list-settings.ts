import { DEFAULT_PROMPTS, promptKind } from "./prompts.ts";
import type { lists, profiles } from "../db/schema.ts";
import type { PromptKind } from "./prompts.ts";

type ListSettings = typeof lists.$inferSelect;
export function resolvePrompts(
  rows: { listId: string | null; kind: PromptKind; template: string }[],
  listId: string | null,
) {
  return Object.fromEntries(
    promptKind.options.map((kind) => {
      const inherited =
        rows.find((p) => p.kind === kind && p.listId === null)?.template ?? DEFAULT_PROMPTS[kind];
      const override = rows.find((p) => p.kind === kind && p.listId === listId);
      return [
        kind,
        {
          template: override?.template ?? inherited,
          defaultTemplate: listId ? inherited : DEFAULT_PROMPTS[kind],
          isDefault: !override,
        },
      ];
    }),
  ) as Record<PromptKind, { template: string; defaultTemplate: string; isDefault: boolean }>;
}
export function chooseProcessingList(
  ids: string[],
  rows: Pick<ListSettings, "id" | "provider" | "audioEnabled" | "ttsProvider">[],
  promptListIds: (string | null)[],
) {
  return (
    ids.find(
      (id) =>
        rows.some(
          (list) => list.id === id && (list.provider || list.audioEnabled || list.ttsProvider),
        ) || promptListIds.includes(id),
    ) ?? null
  );
}
export function listProfile(profile: typeof profiles.$inferSelect, list?: ListSettings) {
  return list?.provider
    ? {
        ...profile,
        provider: list.provider,
        model: list.model,
        reasoningEffort: list.reasoningEffort,
      }
    : profile;
}
