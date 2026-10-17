import { z } from "zod";

export const providerSchema = z.enum(["workers-ai", "openrouter", "openai"]);
export type Provider = z.infer<typeof providerSchema>;
export const DEFAULT_MODELS: Record<Provider, string> = {
  "workers-ai": "@cf/google/gemma-4-26b-a4b-it",
  openrouter: "deepseek/deepseek-v4.1-flash",
  openai: "gpt-5.6-luna",
};
export const reasoningEffortSchema = z.enum(["none", "low", "medium", "high"]);
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;
export const DEFAULT_REASONING_EFFORT: Record<Provider, ReasoningEffort | null> = {
  "workers-ai": null,
  openrouter: null,
  openai: "low",
};
export function effectiveReasoningEffort(profile: {
  provider: Provider | null;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
}) {
  return (
    profile.reasoningEffort ??
    (profile.provider && profile.model === null ? DEFAULT_REASONING_EFFORT[profile.provider] : null)
  );
}
export function workersAiInput(prompt: string, maxTokens: number, effort: ReasoningEffort | null) {
  return {
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: maxTokens,
    ...(effort === null ? {} : { reasoning_effort: effort }),
  };
}
export function parseWorkersAiResponse(response: unknown): string {
  const data = z
    .object({
      choices: z
        .array(
          z.object({
            message: z.object({ content: z.string().max(32_000).nullable().optional() }),
          }),
        )
        .optional(),
      response: z.string().max(32_000).optional(),
    })
    .parse(response);
  const content = data.choices?.[0]?.message.content ?? data.response;
  if (!content?.trim())
    throw new Error("AI returned empty content; the output budget may have been used by reasoning");
  return content;
}
export function providerRequest(
  provider: Exclude<Provider, "workers-ai">,
  model: string,
  key: string,
  prompt: string,
  maxTokens: number,
  effort: ReasoningEffort | null = null,
) {
  return {
    url:
      provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        ...(effort === null
          ? {}
          : provider === "openrouter"
            ? { reasoning: { effort } }
            : { reasoning_effort: effort }),
        messages: [{ role: "user", content: prompt }],
        // OpenAI's reasoning models reject max_tokens; OpenRouter normalizes max_tokens itself.
        ...(provider === "openai"
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
      }),
    } satisfies RequestInit,
  };
}
export async function externalCompletion(
  provider: Exclude<Provider, "workers-ai">,
  model: string,
  key: string,
  prompt: string,
  maxTokens = 1024,
  effort: ReasoningEffort | null = null,
  fetcher: typeof fetch = fetch,
) {
  const { url, init } = providerRequest(provider, model, key, prompt, maxTokens, effort);
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`AI provider returned HTTP ${response.status}`);
  }
  // Do not return provider error bodies: they can contain credentials or request text.
  const data = z
    .object({
      choices: z.array(z.object({ message: z.object({ content: z.string().max(32_000) }) })).min(1),
    })
    .parse(await response.json());
  return data.choices[0]!.message.content;
}
