import { HTTPException } from "hono/http-exception";
import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { storage } from "void/storage";
import { db, and, eq, inArray } from "void/db";
import { bookmarks, bookmarkLists, lists } from "../../../db/schema.ts";
import { fail, publicBookmark } from "../../../lib/http.ts";
import { listIds } from "../../../lib/validators.ts";
import {
  filesEnabled,
  FILES_DISABLED_MESSAGE,
  assetMimeSchema,
  uploadLengthSchema,
  MAX_UPLOAD_BYTES,
  sanitizeFilename,
  matchesMagic,
} from "../../../lib/assets.ts";
import { enqueue } from "../../../lib/enqueue.ts";

export const POST = defineHandler(async (c) => {
  const userId = requireAuth(c).id;
  if (!filesEnabled()) return fail(503, FILES_DISABLED_MESSAGE);
  const mime = assetMimeSchema.safeParse(c.req.header("Content-Type"));
  if (!mime.success) return fail(415, "Use a JPEG, PNG, WebP, GIF or PDF file");
  const lengthHeader = c.req.header("Content-Length");
  if (!lengthHeader) return fail(411, "Content-Length is required");
  if (/^[0-9]+$/.test(lengthHeader) && Number(lengthHeader) > MAX_UPLOAD_BYTES)
    return fail(413, "File exceeds 25 MB");
  const length = uploadLengthSchema.safeParse(lengthHeader);
  if (!length.success || !c.req.raw.body) return fail(400, "Invalid file length");
  const selected = listIds.safeParse(c.req.queries("listId") ?? []);
  if (!selected.success) return fail(400, "Invalid list IDs");
  if (selected.data.length) {
    const owned = await db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.userId, userId), inArray(lists.id, selected.data)));
    if (owned.length !== selected.data.length) return fail(404, "List not found");
  }
  let name: string;
  try {
    name = sanitizeFilename(c.req.header("X-File-Name") ?? "Untitled file");
  } catch {
    return fail(400, "Invalid filename encoding");
  }
  const id = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const key = `assets/${userId}/${id}`;
  let row: typeof bookmarks.$inferSelect;
  try {
    const object = await storage.put(key, c.req.raw.body, {
      httpMetadata: { contentType: mime.data },
    });
    if (!object || object.size !== length.data)
      return fail(400, "File length does not match Content-Length");
    const header = await storage.get(key, {
      range: { offset: 0, length: Math.min(12, object.size) },
    });
    if (!header || !matchesMagic(new Uint8Array(await header.arrayBuffer()), mime.data))
      return fail(415, "File content does not match Content-Type");
    const now = Date.now();
    const [created] = await db.batch([
      db
        .insert(bookmarks)
        .values({
          id,
          userId,
          type: "asset",
          assetKey: key,
          assetType: mime.data === "application/pdf" ? "pdf" : "image",
          assetMime: mime.data,
          assetName: name,
          assetSize: object.size,
          title: name.replace(/\.[^.]+$/, "") || name,
          runId,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
      ...(selected.data.length
        ? [
            db
              .insert(bookmarkLists)
              .values(selected.data.map((listId) => ({ bookmarkId: id, listId }))),
          ]
        : []),
    ]);
    row = created[0]!;
  } catch (error) {
    await storage.delete(key).catch(() => {});
    // The DB batch is atomic; an unsuccessful save never leaves a bookmark row.
    if (error instanceof HTTPException) throw error;
    return fail(503, "Could not save file; please retry");
  }
  const queued = await enqueue({ bookmarkId: id, userId, runId });
  return c.json(
    {
      bookmark: publicBookmark({
        ...row,
        ...(queued
          ? {}
          : {
              status: "failed" as const,
              error: "Could not enqueue processing; reprocess to retry",
            }),
      }),
    },
    201,
  );
});
