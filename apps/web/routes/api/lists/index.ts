import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq, asc, count, isNull } from "void/db";
import { lists, bookmarkLists, bookmarks } from "../../../db/schema.ts";
import { listBody, pagination } from "../../../lib/validators.ts";

export const GET = defineHandler.withValidator({ query: pagination })(async (c, { query }) => ({
  items: await db
    .select({
      id: lists.id,
      name: lists.name,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt,
      count: count(bookmarks.id),
    })
    .from(lists)
    .leftJoin(bookmarkLists, eq(bookmarkLists.listId, lists.id))
    .leftJoin(
      bookmarks,
      and(
        eq(bookmarks.id, bookmarkLists.bookmarkId),
        eq(bookmarks.userId, lists.userId),
        isNull(bookmarks.archivedAt),
      ),
    )
    .where(eq(lists.userId, requireAuth(c).id))
    .groupBy(lists.id)
    .orderBy(asc(lists.name), asc(lists.id))
    .limit(query.limit)
    .offset(query.offset),
  ...query,
}));
export const POST = defineHandler.withValidator({ body: listBody })(async (c, { body }) => {
  const now = Date.now();
  const [list] = await db
    .insert(lists)
    .values({
      id: crypto.randomUUID(),
      userId: requireAuth(c).id,
      name: body.name,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return c.json({ list }, 201);
});
