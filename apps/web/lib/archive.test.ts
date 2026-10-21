import { afterAll, beforeAll, expect, it, vi } from "vite-plus/test";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import type { CloudEnv } from "void";
import { createDb } from "void/db";
import { GET, POST } from "../routes/api/bookmarks/index.ts";
import { PATCH } from "../routes/api/bookmarks/[id]/index.ts";
import { GET as getLists } from "../routes/api/lists/index.ts";
import { GET as getTags } from "../routes/api/tags/index.ts";
import { GET as getCloud } from "../routes/api/tags/cloud.ts";
import type { Bookmark, BookmarkItem, List, Tag } from "./api.ts";

let database: ReturnType<typeof createDb>;
vi.mock("void/db", async (original) => ({
  ...(await original<typeof import("void/db")>()),
  db: new Proxy({}, { get: (_, key) => Reflect.get(database, key) }),
}));
const runtime = new Miniflare({
  workers: [
    {
      config: {
        name: "archive-tests",
        compatibilityDate: "2026-10-17",
        manifest: {
          mainModule: "index.js",
          modules: {
            "index.js": {
              type: "esm",
              contents: "export default { fetch() { return new Response('ok'); } }",
            },
          },
        },
        env: { DB: { type: "d1", id: "archive-tests" } },
      },
      dev: { unsafeRegisterWorker: false },
    },
  ],
});
const userId = crypto.randomUUID();
const otherUserId = crypto.randomUUID();
const id = crypto.randomUUID();
const listId = crypto.randomUUID();
const tagId = crypto.randomUUID();
const app = new Hono<CloudEnv>();
app.use("*", async (c, next) => {
  c.set("user", {
    id: userId,
    email: "test@example.com",
    name: "Test",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await next();
});
app.get("/api/bookmarks", async (c) => (await GET(c)) as Response);
app.post("/api/bookmarks", async (c) => (await POST(c)) as Response);
app.patch("/api/bookmarks/:id", async (c) => (await PATCH(c)) as Response);
app.get("/api/lists", async (c) => (await getLists(c)) as Response);
app.get("/api/tags", async (c) => (await getTags(c)) as Response);
app.get("/api/tags/cloud", async (c) => c.json(await getCloud(c)));
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  expect(response.status).toBe(200);
  return response.json();
}
beforeAll(async () => {
  const binding = await runtime.getD1Database("DB");
  database = createDb(binding as unknown as Parameters<typeof createDb>[0]);
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    for (const statement of readFileSync(new URL(file, directory), "utf8").split(
      "--> statement-breakpoint",
    ))
      if (statement.trim()) await binding.prepare(statement).run();
  await binding
    .prepare("INSERT INTO profiles (user_id) VALUES (?), (?)")
    .bind(userId, otherUserId)
    .run();
  await binding
    .prepare(
      "INSERT INTO bookmarks (id, user_id, url, title, status, run_id, created_at, updated_at) VALUES (?, ?, 'https://example.com/archive-test', 'Archive test', 'done', 'run', 1, 1), (?, ?, 'https://example.com/private', 'Private', 'done', 'run', 2, 2)",
    )
    .bind(id, userId, crypto.randomUUID(), otherUserId)
    .run();
  await binding
    .prepare(
      "INSERT INTO lists (id, user_id, name, created_at, updated_at) VALUES (?, ?, 'Reading', 1, 1)",
    )
    .bind(listId, userId)
    .run();
  await binding
    .prepare("INSERT INTO bookmark_lists (bookmark_id, list_id) VALUES (?, ?)")
    .bind(id, listId)
    .run();
  await binding
    .prepare("INSERT INTO tags (id, user_id, name) VALUES (?, ?, 'design')")
    .bind(tagId, userId)
    .run();
  await binding
    .prepare("INSERT INTO bookmark_tags (bookmark_id, tag_id, source) VALUES (?, ?, 'manual')")
    .bind(id, tagId)
    .run();
}, 20_000);
afterAll(() => runtime.dispose());

it("archives and restores without editing metadata, filters totals, and updates catalog counts", async () => {
  const query = `q=Archive&tag=design&listId=${listId}`;
  const listing = () =>
    request<{ items: BookmarkItem[]; total: number }>(`/api/bookmarks?${query}`);
  const catalogs = async (count: number) => {
    expect((await request<{ items: List[] }>("/api/lists")).items[0]?.count).toBe(count);
    expect((await request<{ items: Tag[] }>("/api/tags")).items[0]?.count).toBe(count);
    expect((await request<{ items: Tag[] }>("/api/tags/cloud")).items).toHaveLength(count);
  };
  expect((await listing()).total).toBe(1);
  expect((await request<{ total: number }>("/api/bookmarks")).total).toBe(1);
  await catalogs(1);
  const archived = await request<{ bookmark: Bookmark }>(`/api/bookmarks/${id}`, "PATCH", {
    archived: true,
  });
  expect(archived.bookmark.archivedAt).toEqual(expect.any(Number));
  expect(archived.bookmark).not.toHaveProperty("titleEdited");
  expect(await listing()).toMatchObject({ items: [], total: 0 });
  for (const flag of ["1", "true"])
    expect(await request(`/api/bookmarks?${query}&archived=${flag}`)).toMatchObject({
      items: [{ id, archivedAt: archived.bookmark.archivedAt }],
      total: 1,
    });
  await catalogs(0);
  const binding = await runtime.getD1Database("DB");
  expect(
    await binding
      .prepare("SELECT title_edited, description_edited FROM bookmarks WHERE id = ?")
      .bind(id)
      .first(),
  ).toEqual({ title_edited: 0, description_edited: 0 });
  expect(
    (await request<{ bookmark: Bookmark }>(`/api/bookmarks/${id}`, "PATCH", { archived: false }))
      .bookmark.archivedAt,
  ).toBeNull();
  expect((await listing()).total).toBe(1);
  await catalogs(1);
});
it("re-saving an archived URL restores it and keeps memberships", async () => {
  await request(`/api/bookmarks/${id}`, "PATCH", { archived: true });
  const result = await request<{ bookmark: Bookmark; alreadyExists: boolean }>(
    "/api/bookmarks",
    "POST",
    { url: "https://example.com/archive-test" },
  );
  expect(result.alreadyExists).toBe(true);
  expect(result.bookmark).toMatchObject({ id, archivedAt: null });
  expect(await request(`/api/bookmarks?listId=${listId}&tag=design`)).toMatchObject({
    items: [{ id }],
    total: 1,
  });
});
