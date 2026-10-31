import { afterEach, expect, it, vi } from "vite-plus/test";
import { Hono } from "hono";
import { encrypt } from "./crypto.ts";
import type { profiles, lists } from "../db/schema.ts";
import { listProfile } from "./list-settings.ts";
const secret = vi.hoisted(() => btoa("a".repeat(32)));
vi.mock("void/env", () => ({ env: { ENCRYPTION_KEY: secret } }));
vi.mock("void/ai", () => ({ ai: { run: vi.fn() } }));
import { complete } from "./settings.ts";
import { POST as testConnection } from "../routes/api/settings/ai/test.ts";
const state = vi.hoisted(() => ({ profile: {} }));
vi.mock("./http.ts", async (original) => ({
  ...(await original<typeof import("./http.ts")>()),
  profileFor: async () => state.profile,
}));
afterEach(() => vi.unstubAllGlobals());
it("sends the decrypted key for the effective list provider, retaining user credentials", async () => {
  const profile = {
    userId: "owner",
    provider: "openai",
    model: "user-model",
    reasoningEffort: null,
    openaiKey: await encrypt("sk-openai", secret, "owner:openai"),
    openrouterKey: await encrypt("sk-openrouter", secret, "owner:openrouter"),
  } as typeof profiles.$inferSelect;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) =>
      new Headers(init?.headers).get("Authorization") === "Bearer sk-openrouter"
        ? Response.json({ choices: [{ message: { content: "OK" } }] })
        : new Response(null, { status: 401 }),
    );
  vi.stubGlobal("fetch", fetcher);
  const effective = listProfile(profile, {
    provider: "openrouter",
    model: "list-model",
    reasoningEffort: null,
  } as typeof lists.$inferSelect);
  expect(await complete(effective, "hello")).toBe("OK");
  expect(fetcher.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
});
it("does not send a request if the stored key cannot be decrypted", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const profile = {
    userId: "owner",
    provider: "openai",
    model: null,
    reasoningEffort: null,
    openaiKey: await encrypt("sk-private", btoa("b".repeat(32)), "owner:openai"),
  } as typeof profiles.$inferSelect;
  await expect(complete(profile, "hello")).rejects.toThrow("Cannot decrypt the saved API key");
  expect(fetcher).not.toHaveBeenCalled();
});
it("preserves safe provider authentication diagnostics in the settings test endpoint", async () => {
  state.profile = {
    userId: "owner",
    provider: "openai",
    model: null,
    reasoningEffort: null,
    openaiKey: await encrypt("sk-private", secret, "owner:openai"),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("private provider response", { status: 401 })),
  );
  const app = new Hono();
  app.post("/test", async (c) => (await testConnection(c as never)) as Response);
  const response = await app.request("/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(response.status).toBe(502);
  const body = await response.text();
  expect(body).toContain("openai rejected the saved API key");
  expect(body).not.toContain("private provider response");
  expect(body).not.toContain("sk-private");
});
