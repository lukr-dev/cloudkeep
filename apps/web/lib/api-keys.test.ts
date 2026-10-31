import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { Miniflare } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { Hono } from "hono";
import type { CloudEnv } from "void";
import { requireAuth } from "void/auth";
import { withRuntimeEnv } from "void/_env";
import apiMiddleware from "../middleware/01.api.ts";
import keyMiddleware from "../middleware/02.api-keys.ts";
import { GET, POST } from "../routes/api/api-keys/index.ts";
import { DELETE } from "../routes/api/api-keys/[id].ts";
import { apiKeyHash, generateApiKey } from "./api-keys.ts";

const mf = new Miniflare({
  workers: [
    {
      config: {
        name: "api-keys-test",
        compatibilityDate: "2026-10-17",
        manifest: {
          mainModule: "index.js",
          modules: {
            "index.js": {
              type: "esm",
              contents: "export default { fetch() { return new Response('test'); } }",
            },
          },
        },
        env: { DB: { type: "d1", id: "api-keys-test" } },
      },
    },
  ],
});
const database = await mf.getD1Database("DB");
const users = Object.fromEntries(
  ["owner", "other"].map((id) => [
    id,
    {
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    },
  ]),
);
const app = new Hono<CloudEnv>();
app.use("*", apiMiddleware);
app.use("*", async (c, next) => {
  c.set("user", users[c.req.header("x-test-session") ?? ""] ?? null);
  await next();
});
app.use("*", keyMiddleware);
app.get("/api/me", (c) => c.json({ user: requireAuth(c) }));
app.get("/api/api-keys", async (c) => c.json(await GET(c)));
app.post("/api/api-keys", async (c) => {
  const response = await POST(c);
  if (!(response instanceof Response)) throw new Error("Expected a response from key creation");
  return response;
});
app.delete("/api/api-keys/:id", async (c) => c.json(await DELETE(c)));
app.post("/api/auth/change-password", (c) => c.json({ ok: true }));
function request(path: string, method = "GET", session?: string, token?: string, body?: unknown) {
  return withRuntimeEnv({ DB: database }, () =>
    app.request(`https://cloudkeep.example${path}`, {
      method,
      headers: {
        ...(session ? { "x-test-session": session } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
async function create(expiresAt: number | null = null) {
  const response = await request("/api/api-keys", "POST", "owner", undefined, {
    name: "Import",
    expiresAt,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { item: { id: string; prefix: string }; key: string };
}
beforeAll(async () => {
  const dir = new URL("../db/migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    for (const statement of readFileSync(new URL(name, dir), "utf8").split(
      "--> statement-breakpoint",
    ))
      if (statement.trim())
        await database.exec(statement.replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  for (const user of Object.values(users)) {
    await database
      .prepare(
        "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 0, 0)",
      )
      .bind(user.id, user.name, user.email)
      .run();
    await database
      .prepare("INSERT INTO profiles (user_id, role) VALUES (?, 'user')")
      .bind(user.id)
      .run();
  }
});
afterAll(() => mf.dispose());
it("generates independent high-entropy keys and stores only a one-way hash", async () => {
  const a = generateApiKey();
  const b = generateApiKey();
  expect(a).toMatch(/^ck_[a-f0-9]{64}$/);
  expect(a).not.toBe(b);
  expect(await apiKeyHash(a)).not.toContain(a);
  for (const invalid of ["", "ck_short", a + "x", a.replace("ck_", "other_")])
    expect(await apiKeyHash(invalid)).toBeNull();
  const { item, key } = await create();
  const row = await database.prepare("SELECT * FROM api_keys WHERE id = ?").bind(item.id).first();
  expect(row?.key_hash).toBe(await apiKeyHash(key));
  expect(Object.values(row ?? {})).not.toContain(key);
  const listed = await request("/api/api-keys", "GET", "owner");
  const text = await listed.text();
  expect(text).toContain(item.prefix);
  expect(text).not.toContain(key);
  expect(text).not.toContain("keyHash");
  expect(text).not.toContain("key_hash");
});
it("authenticates as the owner, isolates management by owner, and revokes immediately", async () => {
  const { item, key } = await create();
  const authenticated = await request("/api/me", "GET", undefined, key);
  expect(authenticated.status).toBe(200);
  expect(await authenticated.json()).toMatchObject({ user: { id: "owner" } });
  expect((await request(`/api/api-keys/${item.id}`, "DELETE", "other")).status).toBe(404);
  const otherKeys = await request("/api/api-keys", "GET", "other");
  expect(await otherKeys.json()).toEqual({ items: [] });
  expect((await request(`/api/api-keys/${item.id}`, "DELETE", "owner")).status).toBe(200);
  expect((await request("/api/me", "GET", undefined, key)).status).toBe(401);
});
it("rejects malformed, unknown and expired keys even with a valid cookie session", async () => {
  const { item, key } = await create();
  await database
    .prepare("UPDATE api_keys SET expires_at = ? WHERE id = ?")
    .bind(Date.now() - 1, item.id)
    .run();
  for (const token of [key, generateApiKey(), "ck_invalid"])
    expect((await request("/api/me", "GET", "owner", token)).status).toBe(401);
  expect((await request("/api/me", "GET", "owner")).status).toBe(200);
});
it("requires a normal session for key management and blocks keys from auth endpoints", async () => {
  const { item, key } = await create();
  for (const [path, method, body] of [
    ["/api/api-keys", "GET", undefined],
    ["/api/api-keys", "POST", { name: "Nested key" }],
    [`/api/api-keys/${item.id}`, "DELETE", undefined],
    ["/api/auth/change-password", "POST", {}],
  ] as const)
    expect((await request(path, method, "owner", key, body)).status).toBe(403);
  expect((await request("/api/api-keys")).status).toBe(401);
  expect(
    (await request("/api/api-keys", "POST", undefined, undefined, { name: "No session" })).status,
  ).toBe(401);
  for (const body of [
    { name: "" },
    { name: "Valid", expiresAt: Date.now() - 1 },
    { name: "Valid", userId: "other" },
  ])
    expect((await request("/api/api-keys", "POST", "owner", undefined, body)).status).toBe(400);
});
