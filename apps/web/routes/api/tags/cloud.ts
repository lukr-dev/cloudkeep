import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq, asc, sql, isNull } from "void/db";
import { tags, bookmarkTags, bookmarks } from "../../../db/schema.ts";

export const GET = defineHandler(async (c) => ({
  items: await db
    .select({
      id: tags.id,
      name: tags.name,
      count: sql<number>`count(${bookmarkTags.bookmarkId})`,
    })
    .from(tags)
    .innerJoin(bookmarkTags, eq(bookmarkTags.tagId, tags.id))
    .innerJoin(bookmarks, eq(bookmarks.id, bookmarkTags.bookmarkId))
    .where(
      and(
        eq(tags.userId, requireAuth(c).id),
        eq(bookmarks.userId, tags.userId),
        isNull(bookmarks.archivedAt),
      ),
    )
    .groupBy(tags.id, tags.name)
    .orderBy(asc(tags.name)),
}));
