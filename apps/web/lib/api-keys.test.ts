import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { Hono } from "hono";
import type { CloudEnv } from "void";
import { betterAuth } from "better-auth";
import { requireAuth } from "void/auth";
import configureAuth from "../auth.ts";
import apiMiddleware from "../middleware/01.api.ts";
import keyMiddleware from "../middleware/02.api-keys.ts";

const database = new DatabaseSync(":memory:");
const directory = new URL("../db/migrations/", import.meta.url);
for (const file of readdirSync(directory)
  .filter((file) => file.endsWith(".sql"))
  .sort())
  database.exec(readFileSync(new URL(file, directory), "utf8"));
const origin = "https://cloudkeep.example.com";
const auth = betterAuth(
  configureAuth({
    defaults: {
      database,
      baseURL: origin,
      secret: "test-secret-with-at-least-thirty-two-characters",
      trustedOrigins: [origin],
      rateLimit: { enabled: false },
      logger: { disabled: true },
    },
  } as Parameters<typeof configureAuth>[0]),
);
const app = new Hono<CloudEnv>();
// Match Void's normal-session middleware before application middleware.
app.use("*", async (c, next) => {
  const state = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", state?.user ?? null);
  c.set("session", state?.session ?? null);
  c.set("__voidAuth", auth);
  await next();
});
app.use("*", apiMiddleware);
app.use("*", keyMiddleware);
app.get("/api/me", (c) => c.json({ user: requireAuth(c) }));
app.post("/api/bookmarks", (c) => c.json({ userId: requireAuth(c).id }));
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
const sessions: Record<string, string> = {};
const userIds: Record<string, string> = {};
function request(
  path: string,
  method = "GET",
  session?: string,
  key?: string,
  body?: unknown,
  keyHeader = "x-api-key",
) {
  return app.request(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(session ? { Authorization: `Bearer ${sessions[session]}` } : {}),
      ...(key !== undefined
        ? { [keyHeader]: keyHeader === "Authorization" ? `Bearer ${key}` : key }
        : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function create(expiresIn: number | null = null) {
  const response = await request("/api/auth/api-key/create", "POST", "owner", undefined, {
    name: "Import",
    expiresIn,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    id: string;
    key: string;
    start: string;
    expiresAt: string | null;
  };
}
beforeAll(async () => {
  const context = await auth.$context;
  for (const name of ["owner", "other"]) {
    const user = await context.internalAdapter.createUser(
      { name, email: `${name}@example.com`, emailVerified: true },
      { method: "email-password" },
    );
    userIds[name] = user.id;
    await context.internalAdapter.createAccount({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await context.password.hash("password-for-api-key-tests"),
    });
    const signedIn = await request("/api/auth/sign-in/email", "POST", undefined, undefined, {
      email: user.email,
      password: "password-for-api-key-tests",
    });
    expect(signedIn.status).toBe(200);
    sessions[name] = ((await signedIn.json()) as { token: string }).token;
  }
});
afterAll(() => database.close());
it("uses Better Auth creation, hash-only storage and secret-free listing", async () => {
  const first = await create(30 * 86400);
  const second = await create();
  expect(first.key).toMatch(/^ck_[a-zA-Z]{64}$/);
  expect(first.key).not.toBe(second.key);
  expect(second.expiresAt).toBeNull();
  const row = database.prepare("SELECT * FROM apikey WHERE id = ?").get(first.id);
  expect(row?.key).toEqual(expect.any(String));
  expect(row?.key).not.toBe(first.key);
  expect(Object.values(row ?? {})).not.toContain(first.key);
  const listed = await request("/api/auth/api-key/list", "GET", "owner");
  expect(listed.status).toBe(200);
  const text = await listed.text();
  expect(text).toContain(first.start);
  expect(text).not.toContain(first.key);
  expect(text).not.toContain(String(row?.key));
});
it("authenticates through both headers as the owner and revokes immediately", async () => {
  const { id, key } = await create();
  for (const header of ["x-api-key", "Authorization"]) {
    const authenticated = await request("/api/me", "GET", undefined, key, undefined, header);
    expect(authenticated.status).toBe(200);
    expect(await authenticated.json()).toMatchObject({ user: { id: userIds.owner } });
    const override = await request("/api/me", "GET", "other", key, undefined, header);
    expect(await override.json()).toMatchObject({ user: { id: userIds.owner } });
    const saved = await request("/api/bookmarks", "POST", undefined, key, {}, header);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ userId: userIds.owner });
  }
  expect(
    (await request("/api/auth/api-key/delete", "POST", "other", undefined, { keyId: id })).status,
  ).toBe(404);
  const otherKeys = await request("/api/auth/api-key/list", "GET", "other");
  expect(await otherKeys.json()).toMatchObject({ apiKeys: [] });
  expect(
    (await request("/api/auth/api-key/delete", "POST", "owner", undefined, { keyId: id })).status,
  ).toBe(200);
  expect((await request("/api/me", "GET", undefined, key)).status).toBe(401);
});
it("rejects malformed, unknown, empty and expired keys without session fallback", async () => {
  const { id, key } = await create();
  database.prepare("UPDATE apikey SET expiresAt = ? WHERE id = ?").run(Date.now() - 1, id);
  for (const token of [key, "ck_" + "x".repeat(64), "ck_invalid", ""])
    expect((await request("/api/me", "GET", "owner", token)).status).toBe(401);
  expect((await request("/api/me", "GET", "owner")).status).toBe(200);
});
it("requires a real login for key management and prevents account credential changes", async () => {
  const { id, key } = await create();
  for (const [path, method, body] of [
    ["/api/auth/api-key/list", "GET", undefined],
    ["/api/auth/api-key/create", "POST", { name: "Nested key" }],
    ["/api/auth/api-key/delete", "POST", { keyId: id }],
    ["/api/auth/change-password", "POST", {}],
  ] as const)
    expect((await request(path, method, "owner", key, body)).status).toBe(403);
  expect((await request("/api/auth/api-key/list")).status).toBe(401);
  expect(
    (
      await request("/api/auth/api-key/create", "POST", undefined, undefined, {
        name: "No session",
      })
    ).status,
  ).toBe(401);
  for (const body of [
    { name: "" },
    { name: "Valid", expiresIn: -1 },
    { name: "Valid", userId: userIds.other },
  ])
    expect((await request("/api/auth/api-key/create", "POST", "owner", undefined, body)).ok).toBe(
      false,
    );
});
it("enforces the plugin's per-key rate limit and returns 429", async () => {
  const { id, key } = await create();
  database
    .prepare("UPDATE apikey SET rateLimitMax = 1, rateLimitTimeWindow = 60000 WHERE id = ?")
    .run(id);
  expect((await request("/api/me", "GET", undefined, key)).status).toBe(200);
  expect((await request("/api/me", "GET", undefined, key)).status).toBe(429);
});
