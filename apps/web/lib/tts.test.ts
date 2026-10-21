import { expect, it } from "vite-plus/test";
import {
  chunkSpeech,
  speechRequest,
  workersSpeechInput,
  parseAudioRange,
  DEFAULT_TTS,
  TTS_INPUT_LIMITS,
} from "./tts.ts";
it("builds MP3 requests for both external providers without mixing speech and chat formats", () => {
  for (const provider of ["openai", "openrouter"] as const) {
    const { url, init } = speechRequest(
      provider,
      DEFAULT_TTS[provider].model,
      "alloy",
      "secret",
      "Hello.",
    );
    expect(url).toBe(
      provider === "openai"
        ? "https://api.openai.com/v1/audio/speech"
        : "https://openrouter.ai/api/v1/audio/speech",
    );
    expect(JSON.parse(init.body)).toEqual({
      model: DEFAULT_TTS[provider].model,
      voice: "alloy",
      input: "Hello.",
      response_format: "mp3",
    });
    expect(init.headers.Authorization).toBe("Bearer secret");
  }
  expect(workersSpeechInput("Hello.", "luna")).toEqual({
    text: "Hello.",
    speaker: "luna",
    encoding: "mp3",
    container: "none",
  });
});
it("splits on sentence boundaries, then words, then hard splits without breaking surrogate pairs", () => {
  expect(chunkSpeech(" First sentence. Second sentence! Last. ", 32)).toEqual([
    "First sentence. Second sentence!",
    "Last.",
  ]);
  expect(chunkSpeech("abcd efgh ijkl", 8)).toEqual(["abcd", "efgh", "ijkl"]);
  expect(chunkSpeech("😀".repeat(7), 5)).toEqual(["😀😀", "😀😀", "😀😀", "😀"]);
  expect(chunkSpeech(" ", 20)).toEqual([]);
  for (const limit of Object.values(TTS_INPUT_LIMITS)) {
    const text = "Sentence with words. ".repeat(1000).trim();
    const chunks = chunkSpeech(text, limit);
    expect(chunks.every((chunk) => chunk.length <= limit)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  }
});
it("parses bounded, open-ended and suffix ranges and rejects unsatisfiable or multiple ranges", () => {
  expect(parseAudioRange(null, 100)).toBeNull();
  expect(parseAudioRange("bytes=10-19", 100)).toEqual({ offset: 10, length: 10 });
  expect(parseAudioRange("bytes=90-", 100)).toEqual({ offset: 90, length: 10 });
  expect(parseAudioRange("bytes=-10", 100)).toEqual({ offset: 90, length: 10 });
  expect(parseAudioRange("bytes=-200", 100)).toEqual({ offset: 0, length: 100 });
  expect(parseAudioRange("bytes=90-200", 100)).toEqual({ offset: 90, length: 10 });
  for (const header of [
    "bytes=100-",
    "bytes=20-10",
    "bytes=-0",
    "bytes=-",
    "bytes=0-1,3-4",
    "bytes=1.5-3",
    "items=0-1",
    "bytes=999999999999999999999-",
  ])
    expect(parseAudioRange(header, 100)).toBe("invalid");
  expect(parseAudioRange("bytes=0-", 0)).toBe("invalid");
});
