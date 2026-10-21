import { publicAudio } from "../../../../lib/audio.ts";
import { processingList } from "../../../../lib/processing-list.ts";
import { filesEnabled } from "../../../../lib/assets.ts";
import { enqueue } from "../../../../lib/enqueue.ts";
import { storage } from "void/storage";
import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq } from "void/db";
import {
  bookmarkAudio,
  bookmarks,
  bookmarkTags,
  bookmarkLists,
  tags,
} from "../../../../db/schema.ts";
import { idParams, ownBookmark, publicBookmark, fail } from "../../../../lib/http.ts";
import { editBookmark } from "../../../../lib/validators.ts";

export const GET = defineHandler.withValidator({ params: idParams })(async (c, { params }) => {
  const userId = requireAuth(c).id;
  const bookmark = await ownBookmark(userId, params.id);
  const linkedTags = await db
    .select({ id: tags.id, name: tags.name, source: bookmarkTags.source })
    .from(bookmarkTags)
    .innerJoin(tags, eq(tags.id, bookmarkTags.tagId))
    .where(and(eq(bookmarkTags.bookmarkId, params.id), eq(tags.userId, userId)));
  const linkedLists = await db
    .select()
    .from(bookmarkLists)
    .where(eq(bookmarkLists.bookmarkId, params.id));
  const audio = (
    await db.select().from(bookmarkAudio).where(eq(bookmarkAudio.bookmarkId, params.id))
  ).map(publicAudio);
  return {
    bookmark: {
      ...publicBookmark(bookmark),
      audioEnabled:
        filesEnabled() && !!(await processingList(userId, bookmark.processingListId))?.audioEnabled,
      audio,
      hasAudio: audio.some((a) => a.hasAudio),
      tags: linkedTags,
      listIds: linkedLists.map((l) => l.listId),
    },
  };
});
export const PATCH = defineHandler.withValidator({ params: idParams, body: editBookmark })(async (
  c,
  { params, body },
) => {
  const userId = requireAuth(c).id;
  const existing = await ownBookmark(userId, params.id);
  if (body.text !== undefined && existing.type !== "text")
    return fail(400, "Text is only supported for notes");
  const { text, archived, ...fields } = body;
  const now = Date.now();
  const [bookmark] = await db
    .update(bookmarks)
    .set({
      ...fields,
      ...(text !== undefined
        ? { noteText: text, runId: crypto.randomUUID(), status: "pending" as const, error: null }
        : {}),
      ...(archived !== undefined ? { archivedAt: archived ? now : null } : {}),
      ...(body.title !== undefined ? { titleEdited: true } : {}),
      ...(body.description !== undefined ? { descriptionEdited: true } : {}),
      updatedAt: now,
    })
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, params.id)))
    .returning();
  if (text !== undefined && bookmark) {
    const queued = await enqueue({ bookmarkId: bookmark.id, userId, runId: bookmark.runId });
    if (!queued) {
      bookmark.status = "failed";
      bookmark.error = "Could not enqueue processing; reprocess to retry";
    }
  }
  return { bookmark: publicBookmark(bookmark!) };
});
export const DELETE = defineHandler.withValidator({ params: idParams })(async (c, { params }) => {
  const userId = requireAuth(c).id;
  const existing = await ownBookmark(userId, params.id);
  const audio = await db
    .select()
    .from(bookmarkAudio)
    .where(eq(bookmarkAudio.bookmarkId, params.id));
  await db.delete(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, params.id)));
  if (filesEnabled())
    await Promise.all(
      audio.filter((a) => a.r2Key).map((a) => storage.delete(a.r2Key!).catch(() => {})),
    );
  if (existing.assetKey && filesEnabled()) await storage.delete(existing.assetKey).catch(() => {});
  return { ok: true };
});
