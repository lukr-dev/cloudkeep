import { z } from "zod";

export const providerSchema = z.enum(["workers-ai", "openrouter", "openai"]);
export type Provider = z.infer<typeof providerSchema>;
export const DEFAULT_MODELS: Record<Provider, string> = {
  "workers-ai": "@cf/meta/llama-3.1-8b-instruct-fp8",
  openrouter: "openai/gpt-4o-mini",
  openai: "gpt-4o-mini",
};
export function providerRequest(
  provider: Exclude<Provider, "workers-ai">,
  model: string,
  key: string,
  prompt: string,
  maxTokens: number,
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
  fetcher: typeof fetch = fetch,
) {
  const { url, init } = providerRequest(provider, model, key, prompt, maxTokens);
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
