import { afterAll, beforeAll, expect, it, vi } from "vite-plus/test";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import type { CloudEnv } from "void";
import { createDb } from "void/db";
import { POST as retryFailed } from "../routes/api/bookmarks/retry-failed.ts";
import { POST as retryOne } from "../routes/api/bookmarks/[id]/reprocess.ts";
import { reprocess } from "./reprocess.ts";
import { GET, POST } from "../routes/api/bookmarks/index.ts";
import { GET as lookup } from "../routes/api/bookmarks/lookup.ts";
import { GET as detail, PATCH } from "../routes/api/bookmarks/[id]/index.ts";
import { GET as getLists } from "../routes/api/lists/index.ts";
import { GET as getTags } from "../routes/api/tags/index.ts";
import { GET as getCloud } from "../routes/api/tags/cloud.ts";
import type { Bookmark, BookmarkItem, BookmarkLookup, BookmarkCreate, List, Tag } from "./api.ts";

const queue = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("void/queues", () => ({ queues: { bookmarks: { send: queue.send } } }));

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
  if (c.req.header("x-anonymous")) return next();
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
app.post("/api/bookmarks/retry-failed", async (c) => (await retryFailed(c)) as Response);
app.post("/api/bookmarks/:id/reprocess", async (c) => (await retryOne(c)) as Response);
app.get("/api/bookmarks", async (c) => (await GET(c)) as Response);
app.post("/api/bookmarks", async (c) => (await POST(c)) as Response);
app.get("/api/bookmarks/lookup", async (c) => (await lookup(c)) as Response);
app.get("/api/bookmarks/:id", async (c) => (await detail(c)) as Response);
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
  const result = await request<BookmarkCreate>("/api/bookmarks", "POST", {
    url: "https://example.com/archive-test",
  });
  expect(result.alreadyExists).toBe(true);
  expect(result.bookmark).toMatchObject({ id, archivedAt: null, listIds: [listId] });
  expect(await request(`/api/bookmarks?listId=${listId}&tag=design`)).toMatchObject({
    items: [{ id }],
    total: 1,
  });
});

it("looks up normalized URLs including archived bookmarks and their lists", async () => {
  await request(`/api/bookmarks/${id}`, "PATCH", { archived: true });
  const result = await request<BookmarkLookup>(
    `/api/bookmarks/lookup?url=${encodeURIComponent("https://EXAMPLE.com/archive-test?utm_source=extension&utm_medium=tab#section")}`,
  );
  expect(result).toEqual({
    bookmark: {
      id,
      url: "https://example.com/archive-test",
      title: "Archive test",
      archivedAt: expect.any(Number),
      listIds: [listId],
    },
  });
});
it("returns null for unknown URLs, other users' bookmarks and unsupported tabs", async () => {
  for (const url of [
    "https://example.com/missing",
    "https://example.com/private",
    "chrome://newtab",
    "file:///tmp/test",
    "https://localhost",
    "https://127.0.0.1",
    "http://[::1]",
    "https://host.internal",
    "not a URL",
    "",
  ]) {
    expect(await request(`/api/bookmarks/lookup?url=${encodeURIComponent(url)}`)).toEqual({
      bookmark: null,
    });
  }
});
it("requires authentication even for an invalid lookup URL", async () => {
  const response = await app.request("/api/bookmarks/lookup?url=chrome://newtab", {
    headers: { "x-anonymous": "1" },
  });
  expect(response.status).toBe(401);
});
it("returns full memberships on creation and merges them when re-saving", async () => {
  const binding = await runtime.getD1Database("DB");
  const extraListId = crypto.randomUUID();
  await binding
    .prepare(
      "INSERT INTO lists (id, user_id, name, created_at, updated_at) VALUES (?, ?, 'Extra', 1, 1)",
    )
    .bind(extraListId, userId)
    .run();
  async function save(body: unknown, status: number) {
    const response = await app.request("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(status);
    return response.json() as Promise<BookmarkCreate>;
  }
  const url = "https://example.com/new-memberships";
  const created = await save({ url, listIds: [listId] }, 201);
  expect(created.alreadyExists).toBe(false);
  expect(created.bookmark.listIds).toEqual([listId]);
  await request(`/api/bookmarks/${created.bookmark.id}`, "PATCH", { archived: true });
  const merged = await save({ url, listIds: [extraListId, listId] }, 200);
  expect(merged.alreadyExists).toBe(true);
  expect(merged.bookmark.archivedAt).toBeNull();
  expect(merged.bookmark.createdAt).toBeGreaterThan(created.bookmark.createdAt);
  expect(merged.bookmark.listIds.sort()).toEqual([listId, extraListId].sort());
  expect((await save({ url }, 200)).bookmark.listIds.sort()).toEqual([listId, extraListId].sort());
  expect((await save({ url: "https://example.com/no-lists" }, 201)).bookmark.listIds).toEqual([]);
});

it("retries all failures across pages and archive, isolates users, and leaves other statuses alone", async () => {
  const binding = await runtime.getD1Database("DB");
  const ids = Array.from({ length: 53 }, () => crypto.randomUUID()).sort();
  const privateId = crypto.randomUUID();
  const pendingId = crypto.randomUUID();
  for (const [index, bookmarkId] of [...ids, privateId, pendingId].entries()) {
    await binding
      .prepare(
        "INSERT INTO bookmarks (id,user_id,type,status,error,run_id,archived_at,created_at,updated_at) VALUES (?,?,'text',?,'old error','old-run',?,1,1)",
      )
      .bind(
        bookmarkId,
        bookmarkId === privateId ? otherUserId : userId,
        bookmarkId === pendingId ? "processing" : "failed",
        index % 2 ? 1 : null,
      )
      .run();
  }
  queue.send.mockClear();
  const before = await request<{ failedTotal: number }>("/api/bookmarks?limit=1&q=absent");
  expect(before.failedTotal).toBe(53);
  let after: string | null = null;
  let queued = 0;
  do {
    const result: { queued: number; failed: number; nextCursor: string | null } = await request(
      "/api/bookmarks/retry-failed",
      "POST",
      after ? { after } : {},
    );
    queued += result.queued;
    expect(result.failed).toBe(0);
    after = result.nextCursor;
  } while (after);
  expect(queued).toBe(53);
  expect(queue.send).toHaveBeenCalledTimes(53);
  for (const [job] of queue.send.mock.calls) {
    expect(job.userId).toBe(userId);
    expect(ids).toContain(job.bookmarkId);
    expect(job.runId).not.toBe("old-run");
  }
  expect(
    await binding
      .prepare("SELECT status,run_id,error FROM bookmarks WHERE id=?")
      .bind(ids[0]!)
      .first(),
  ).toEqual({ status: "pending", run_id: expect.any(String), error: null });
  expect(await reprocess(userId, ids[0]!, true)).toBeNull();
  expect(await reprocess(userId, privateId, true)).toBeNull();
  expect(queue.send).toHaveBeenCalledTimes(53);
  expect(await request("/api/bookmarks/retry-failed", "POST", {})).toEqual({
    queued: 0,
    failed: 0,
    nextCursor: null,
  });
  expect((await request<{ failedTotal: number }>("/api/bookmarks")).failedTotal).toBe(0);
  expect(
    await binding.prepare("SELECT status FROM bookmarks WHERE id=?").bind(privateId).first(),
  ).toEqual({ status: "failed" });
  expect(
    await binding.prepare("SELECT status FROM bookmarks WHERE id=?").bind(pendingId).first(),
  ).toEqual({ status: "processing" });
});
it("keeps queue failures retryable and shares the single-bookmark path", async () => {
  const binding = await runtime.getD1Database("DB");
  const bookmarkId = crypto.randomUUID();
  await binding
    .prepare(
      "INSERT INTO bookmarks (id,user_id,type,status,run_id,created_at,updated_at) VALUES (?,?,'text','failed','old',1,1)",
    )
    .bind(bookmarkId, userId)
    .run();
  queue.send.mockRejectedValueOnce(new Error("private queue details"));
  expect(await request("/api/bookmarks/retry-failed", "POST", {})).toEqual({
    queued: 0,
    failed: 1,
    nextCursor: null,
  });
  expect(
    await binding.prepare("SELECT status,error FROM bookmarks WHERE id=?").bind(bookmarkId).first(),
  ).toEqual({ status: "failed", error: "Could not enqueue processing; reprocess to retry" });
  const response = await app.request(`/api/bookmarks/${bookmarkId}/reprocess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    bookmark: { id: bookmarkId, status: "pending", error: null },
  });
});
it("requires authentication and validates bulk retry input", async () => {
  const response = await app.request("/api/bookmarks/retry-failed", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-anonymous": "1" },
    body: "{}",
  });
  expect(response.status).toBe(401);
  for (const body of [{ userId: otherUserId }, { after: "bad-id" }]) {
    const response = await app.request("/api/bookmarks/retry-failed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
  }
});
