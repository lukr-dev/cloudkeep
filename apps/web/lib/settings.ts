import { db, and, eq, isNull } from "void/db";
import { ai } from "void/ai";
import { env } from "void/env";
import { profiles, prompts } from "../db/schema.ts";
import {
  DEFAULT_MODELS,
  DEFAULT_REASONING_EFFORT,
  effectiveReasoningEffort,
  externalCompletion,
  workersAiInput,
  parseWorkersAiResponse,
} from "./providers.ts";
import { decrypt } from "./crypto.ts";
import { DEFAULT_PROMPTS, PROMPT_VARIABLES, type PromptKind } from "./prompts.ts";

export function publicSettings(profile: typeof profiles.$inferSelect) {
  return {
    provider: profile.provider,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort,
    autoTag: profile.autoTag,
    autoSummary: profile.autoSummary,
    keys: {
      openai: { hasKey: !!profile.openaiKey },
      openrouter: { hasKey: !!profile.openrouterKey },
    },
    defaultModels: DEFAULT_MODELS,
    defaultReasoningEffort: DEFAULT_REASONING_EFFORT,
  };
}
export async function effectivePrompts(userId: string) {
  const overrides = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.userId, userId), isNull(prompts.listId)));
  const entry = (kind: PromptKind) => {
    const override = overrides.find((p) => p.kind === kind);
    return {
      template: override?.template ?? DEFAULT_PROMPTS[kind],
      defaultTemplate: DEFAULT_PROMPTS[kind],
      isDefault: !override,
    };
  };
  return { tagging: entry("tagging"), summary: entry("summary"), variables: PROMPT_VARIABLES };
}
export async function complete(
  profile: typeof profiles.$inferSelect,
  prompt: string,
  maxTokens = 1024,
) {
  const provider = profile.provider;
  if (!provider) throw new Error("Choose an AI provider in settings");
  const model = profile.model ?? DEFAULT_MODELS[provider];
  const effort = effectiveReasoningEffort(profile);
  if (provider === "workers-ai") {
    const response = await ai.run(model, workersAiInput(prompt, maxTokens, effort));
    return parseWorkersAiResponse(response);
  }
  const encrypted = provider === "openai" ? profile.openaiKey : profile.openrouterKey;
  if (!encrypted) throw new Error("Set an API key for the selected provider");
  const key = await decrypt(encrypted, env.ENCRYPTION_KEY, `${profile.userId}:${provider}`);
  return externalCompletion(provider, model, key, prompt, maxTokens, effort);
}
