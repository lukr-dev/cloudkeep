import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, eq, asc, sql } from "void/db";
import { tags, bookmarkTags } from "../../../db/schema.ts";

export const GET = defineHandler(async (c) => ({
  items: await db
    .select({
      id: tags.id,
      name: tags.name,
      count: sql<number>`count(${bookmarkTags.bookmarkId})`,
    })
    .from(tags)
    .innerJoin(bookmarkTags, eq(bookmarkTags.tagId, tags.id))
    .where(eq(tags.userId, requireAuth(c).id))
    .groupBy(tags.id, tags.name)
    .orderBy(asc(tags.name)),
}));
