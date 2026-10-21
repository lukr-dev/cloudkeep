import type { Provider } from "./providers.ts";
export const DEFAULT_TTS: Record<Provider, { model: string; voice: string }> = {
  "workers-ai": { model: "@cf/deepgram/aura-2-en", voice: "luna" },
  openai: { model: "gpt-4o-mini-tts", voice: "alloy" },
  openrouter: { model: "openai/gpt-4o-mini-tts-2025-12-15", voice: "alloy" },
};
// Aura's REST input limit is 2000 characters; OpenAI speech accepts 4096.
export const TTS_INPUT_LIMITS: Record<Provider, number> = {
  "workers-ai": 2000,
  openai: 4096,
  openrouter: 4096,
};
export function chunkSpeech(text: string, limit: number): string[] {
  if (limit < 2) throw new Error("Invalid speech chunk limit");
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let end = 0;
    for (const match of rest.slice(0, limit).matchAll(/[.!?。！？](?:\s+|$)/gu))
      end = match.index + match[0].length;
    if (!end) end = rest.lastIndexOf(" ", limit);
    if (end <= 0) end = limit;
    if (/[\uD800-\uDBFF]/u.test(rest[end - 1]!)) end--;
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
export function workersSpeechInput(text: string, voice: string) {
  return { text, speaker: voice, encoding: "mp3" as const, container: "none" as const };
}
export function speechRequest(
  provider: Exclude<Provider, "workers-ai">,
  model: string,
  voice: string,
  key: string,
  input: string,
) {
  return {
    url:
      provider === "openai"
        ? "https://api.openai.com/v1/audio/speech"
        : "https://openrouter.ai/api/v1/audio/speech",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, voice, input, response_format: "mp3" }),
    } satisfies RequestInit,
  };
}
export function parseAudioRange(
  header: string | null,
  size: number,
): { offset: number; length: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return "invalid";
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= size ||
    end < start ||
    (!match[1] && Number(match[2]) === 0)
  )
    return "invalid";
  return { offset: start, length: end - start + 1 };
}
