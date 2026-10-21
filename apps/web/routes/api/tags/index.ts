import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq, asc, count, isNull } from "void/db";
import { tags, bookmarkTags, bookmarks } from "../../../db/schema.ts";
import { pagination } from "../../../lib/validators.ts";

export const GET = defineHandler.withValidator({ query: pagination })(async (c, { query }) => ({
  items: await db
    .select({
      id: tags.id,
      name: tags.name,
      count: count(bookmarks.id),
    })
    .from(tags)
    .leftJoin(bookmarkTags, eq(bookmarkTags.tagId, tags.id))
    .leftJoin(
      bookmarks,
      and(
        eq(bookmarks.id, bookmarkTags.bookmarkId),
        eq(bookmarks.userId, tags.userId),
        isNull(bookmarks.archivedAt),
      ),
    )
    .where(eq(tags.userId, requireAuth(c).id))
    .groupBy(tags.id)
    .orderBy(asc(tags.name))
    .limit(query.limit)
    .offset(query.offset),
  ...query,
}));
