import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq } from "void/db";
import { z } from "zod";
import { bookmarkLists } from "../../../../../db/schema.ts";
import { idSchema, ownBookmark, ownList } from "../../../../../lib/http.ts";

const params = z.object({ id: idSchema, listId: idSchema });
export const PUT = defineHandler.withValidator({ params, body: z.object({}).strict() })(async (
  c,
  { params },
) => {
  const userId = requireAuth(c).id;
  await ownBookmark(userId, params.id);
  await ownList(userId, params.listId);
  await db
    .insert(bookmarkLists)
    .values({ bookmarkId: params.id, listId: params.listId })
    .onConflictDoNothing();
  return { ok: true };
});
export const DELETE = defineHandler.withValidator({ params })(async (c, { params }) => {
  const userId = requireAuth(c).id;
  await ownBookmark(userId, params.id);
  await ownList(userId, params.listId);
  await db
    .delete(bookmarkLists)
    .where(and(eq(bookmarkLists.bookmarkId, params.id), eq(bookmarkLists.listId, params.listId)));
  return { ok: true };
});
