import { ai } from "void/ai";
import { env } from "void/env";
import { decrypt } from "./crypto.ts";
import {
  chunkSpeech,
  DEFAULT_TTS,
  speechRequest,
  TTS_INPUT_LIMITS,
  workersSpeechInput,
} from "./tts.ts";
import type { profiles, lists } from "../db/schema.ts";
export function speechSettings(
  profile: typeof profiles.$inferSelect,
  list?: typeof lists.$inferSelect,
) {
  const custom = !!list?.ttsProvider;
  const provider = (custom ? list.ttsProvider : profile.ttsProvider) ?? "workers-ai";
  return {
    provider,
    model: (custom ? list.ttsModel : profile.ttsModel) ?? DEFAULT_TTS[provider].model,
    voice: (custom ? list.ttsVoice : profile.ttsVoice) ?? DEFAULT_TTS[provider].voice,
  };
}
export async function synthesize(
  profile: typeof profiles.$inferSelect,
  settings: ReturnType<typeof speechSettings>,
  text: string,
) {
  const { provider, model, voice } = settings;
  let key = "";
  if (provider !== "workers-ai") {
    const encrypted = provider === "openai" ? profile.openaiKey : profile.openrouterKey;
    if (!encrypted) throw new Error("Set an API key for the selected TTS provider");
    key = await decrypt(encrypted, env.ENCRYPTION_KEY, `${profile.userId}:${provider}`);
  }
  const buffers: ArrayBuffer[] = [];
  for (const input of chunkSpeech(text, TTS_INPUT_LIMITS[provider])) {
    if (provider === "workers-ai") {
      const result: unknown = await ai.run(model, workersSpeechInput(input, voice));
      // The binding returns a stream; older SDK typings describe the REST string output.
      if (result instanceof ReadableStream) buffers.push(await new Response(result).arrayBuffer());
      else if (typeof result === "string")
        buffers.push(Uint8Array.from(atob(result), (c) => c.charCodeAt(0)).buffer);
      else if (
        result &&
        typeof result === "object" &&
        "audio" in result &&
        typeof result.audio === "string"
      )
        buffers.push(Uint8Array.from(atob(result.audio), (c) => c.charCodeAt(0)).buffer);
      else throw new Error("TTS returned invalid audio");
    } else {
      const { url, init } = speechRequest(provider, model, voice, key, input);
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`TTS provider returned HTTP ${response.status}`);
      }
      buffers.push(await response.arrayBuffer());
    }
  }
  if (!buffers.length || buffers.some((buffer) => !buffer.byteLength))
    throw new Error("TTS returned empty audio");
  return new Blob(buffers, { type: "audio/mpeg" });
}
