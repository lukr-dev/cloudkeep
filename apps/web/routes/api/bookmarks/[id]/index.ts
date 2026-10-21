import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq } from "void/db";
import { bookmarks, bookmarkTags, bookmarkLists, tags } from "../../../../db/schema.ts";
import { idParams, ownBookmark, publicBookmark } from "../../../../lib/http.ts";
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
  return {
    bookmark: {
      ...publicBookmark(bookmark),
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
  await ownBookmark(userId, params.id);
  const { archived, ...edits } = body;
  const now = Date.now();
  const [bookmark] = await db
    .update(bookmarks)
    .set({
      ...edits,
      ...(archived !== undefined ? { archivedAt: archived ? now : null } : {}),
      ...(body.title !== undefined ? { titleEdited: true } : {}),
      ...(body.description !== undefined ? { descriptionEdited: true } : {}),
      updatedAt: now,
    })
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, params.id)))
    .returning();
  return { bookmark: publicBookmark(bookmark!) };
});
export const DELETE = defineHandler.withValidator({ params: idParams })(async (c, { params }) => {
  const userId = requireAuth(c).id;
  await ownBookmark(userId, params.id);
  await db.delete(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, params.id)));
  return { ok: true };
});
