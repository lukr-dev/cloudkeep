import { describe, expect, it, vi } from "vite-plus/test";
import { normalizeUrl } from "./url.ts";
import { DEFAULT_PROMPTS, parseTags, renderPrompt } from "./prompts.ts";
import { decrypt, encrypt, hashPassword, verifyPassword } from "./crypto.ts";
import { externalCompletion, providerRequest } from "./providers.ts";

it("normalizes URLs without merging meaningful paths or query values", () => {
  expect(normalizeUrl(" HTTPS://Example.COM:443/a?utm_source=x&utm_medium=y&b=2&a=1#part ")).toBe(
    "https://example.com/a?a=1&b=2",
  );
  expect(normalizeUrl("https://example.com/a/")).not.toBe(normalizeUrl("https://example.com/a"));
  expect(normalizeUrl("https://example.com/?q=a+b")).toContain("q=a+b");
  for (const url of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://localhost/",
    "http://127.0.0.1/",
    "https://user:pass@example.com/",
    "http://[::1]/",
    "http://0x7f000001/",
  ])
    expect(() => normalizeUrl(url)).toThrow();
});
it("renders only known placeholders in one pass", () => {
  expect(
    renderPrompt("{{title}} / {{ content }} / {{unknown}}", {
      title: "{{content}}",
      content: "page",
    }),
  ).toBe("{{content}} / page / {{unknown}}");
  expect(DEFAULT_PROMPTS.tagging).toContain("3–5");
});
it("parses fenced JSON, normalizes and deduplicates tags, and rejects malformed output", () => {
  expect(parseTags('```json\n{"tags":[" Vue ","vue","Web"]}\n```')).toEqual(["vue", "web"]);
  expect(parseTags('["a","b","c","d","e","f"]')).toHaveLength(5);
  for (const output of [
    "not json",
    '{"tags":[5]}',
    '{"tags":[""]}',
    JSON.stringify({ tags: ["x".repeat(41)] }),
    JSON.stringify({ tags: Array.from({ length: 21 }, () => "x") }),
  ])
    expect(() => parseTags(output)).toThrow();
});
it("encrypts with random IVs and authenticates the user/provider context", async () => {
  const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const ciphertext = await encrypt("sk-secret", secret, "user:openai");
  expect(ciphertext).not.toContain("sk-secret");
  expect(await decrypt(ciphertext, secret, "user:openai")).toBe("sk-secret");
  expect(await encrypt("sk-secret", secret, "user:openai")).not.toBe(ciphertext);
  await expect(decrypt(ciphertext, secret, "other:openai")).rejects.toThrow();
  await expect(decrypt(ciphertext.slice(0, -4) + "AAAA", secret, "user:openai")).rejects.toThrow();
  await expect(encrypt("value", "short", "context")).rejects.toThrow();
});
it("hashes salted passwords and verifies without accepting a wrong password", async () => {
  const hash = await hashPassword("correct horse battery staple");
  expect(await verifyPassword({ hash, password: "correct horse battery staple" })).toBe(true);
  expect(await verifyPassword({ hash, password: "wrong horse battery staple" })).toBe(false);
  expect(await hashPassword("correct horse battery staple")).not.toBe(hash);
  expect(await verifyPassword({ hash: "invalid", password: "anything" })).toBe(false);
});
describe("external providers", () => {
  for (const provider of ["openai", "openrouter"] as const)
    it(`builds and sends the ${provider} request`, async () => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ choices: [{ message: { content: "OK" } }] }));
      expect(
        await externalCompletion(provider, "custom-model", "sk-test", "Hello", 8, fetcher),
      ).toBe("OK");
      const request = providerRequest(provider, "custom-model", "sk-test", "Hello", 8);
      expect(request.url).toBe(
        provider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://openrouter.ai/api/v1/chat/completions",
      );
      expect(fetcher).toHaveBeenCalledWith(
        request.url,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
        }),
      );
      expect(JSON.parse(request.init.body)).toEqual({
        model: "custom-model",
        messages: [{ role: "user", content: "Hello" }],
        ...(provider === "openai" ? { max_completion_tokens: 8 } : { max_tokens: 8 }),
      });
    });
  it("keeps upstream error bodies out of errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret key leaked here", { status: 401 }));
    await expect(externalCompletion("openai", "m", "k", "p", 8, fetcher)).rejects.toThrow(
      "AI provider returned HTTP 401",
    );
  });
});
