import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { betterAuth } from "better-auth";
import { readFileSync, readdirSync } from "node:fs";
import configureAuth from "../auth.ts";
import apiMiddleware from "../middleware/01.api.ts";

const origin = `chrome-extension://${"a".repeat(32)}`;
const database = new DatabaseSync(":memory:");
const directory = new URL("../db/migrations/", import.meta.url);
for (const file of readdirSync(directory)
  .filter((file) => file.endsWith(".sql"))
  .sort())
  database.exec(readFileSync(new URL(file, directory), "utf8"));

const auth = betterAuth(
  configureAuth({
    defaults: {
      database,
      baseURL: "https://cloudkeep.example.com",
      secret: "test-secret-with-at-least-thirty-two-characters",
      trustedOrigins: ["https://cloudkeep.example.com"],
      advanced: { disableOriginCheck: false, disableCSRFCheck: false },
      rateLimit: { enabled: false },
      logger: { disabled: true },
    },
  } as Parameters<typeof configureAuth>[0]),
);
const app = new Hono();
app.use("*", apiMiddleware);
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.post("/api/bookmarks", (c) => c.json({ ok: true }));
app.put("/api/auth/sign-in/email", (c) => c.json({ ok: true }));
app.patch("/api/auth/sign-out", (c) => c.json({ ok: true }));
const password = "password-for-extension-tests";

beforeAll(async () => {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    {
      name: "Extension",
      email: "extension@example.com",
      emailVerified: true,
    },
    { method: "email-password" },
  );
  await context.internalAdapter.createAccount({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await context.password.hash(password),
  });
});
afterAll(() => database.close());
function request(
  path: string,
  requestOrigin = origin,
  body: unknown = {},
  headers = {},
  method = "POST",
) {
  return app.request(`https://cloudkeep.example.com${path}`, {
    method,
    headers: { origin: requestOrigin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
it("signs in with the real Better Auth origin check and uses a bearer token without cookies", async () => {
  const response = await request("/api/auth/sign-in/email", origin, {
    email: "extension@example.com",
    password,
  });
  expect(response.status).toBe(200);
  const data = (await response.json()) as { token: string };
  const headerToken = response.headers.get("set-auth-token");
  expect(headerToken).toEqual(expect.any(String));
  for (const token of [data.token, headerToken]) {
    const session = await app.request("https://cloudkeep.example.com/api/auth/get-session", {
      headers: { Authorization: `Bearer ${token}`, origin },
    });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { email: "extension@example.com" } });
  }
  const logout = await request(
    "/api/auth/sign-out",
    origin,
    {},
    { Authorization: `Bearer ${data.token}` },
  );
  expect(logout.status).toBe(200);
  const expired = await app.request("https://cloudkeep.example.com/api/auth/get-session", {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  expect(await expired.json()).toBeNull();
});
it("allows extension sign-out without a bearer header but keeps other origins and paths blocked", async () => {
  expect((await request("/api/auth/sign-out")).status).toBe(200);
  for (const path of ["/api/auth/sign-in/email", "/api/auth/sign-out", "/api/bookmarks"]) {
    expect((await request(path, "https://evil.example.com")).status).toBe(403);
    expect((await request(path, "chrome-extension://invalid")).status).toBe(403);
  }
  for (const path of [
    "/api/bookmarks",
    "/api/auth/sign-up/email",
    "/api/auth/change-password",
    "/api/auth/sign-in/email/extra",
  ]) {
    expect((await request(path)).status).toBe(403);
  }
  expect((await request("/api/auth/sign-in/email", origin, {}, {}, "PUT")).status).toBe(403);
  expect((await request("/api/auth/sign-out", origin, {}, {}, "PATCH")).status).toBe(403);
  expect(
    (await request("/api/bookmarks", origin, {}, { Authorization: "Bearer token" })).status,
  ).toBe(200);
  expect((await request("/api/bookmarks", "https://cloudkeep.example.com")).status).toBe(200);
});
it("Better Auth independently rejects a foreign origin and accepts an extension origin with cookies", async () => {
  async function signIn(requestOrigin: string) {
    return auth.handler(
      new Request("https://cloudkeep.example.com/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          origin: requestOrigin,
          "Content-Type": "application/json",
          cookie: "unrelated=value",
        },
        body: JSON.stringify({ email: "extension@example.com", password }),
      }),
    );
  }
  expect((await signIn("https://evil.example.com")).status).toBe(403);
  expect((await signIn(origin)).status).toBe(200);
  expect((await signIn("https://cloudkeep.example.com")).status).toBe(200);
});
