import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, eq, asc, sql } from "void/db";
import { tags, bookmarkTags } from "../../../db/schema.ts";
import { pagination } from "../../../lib/validators.ts";

export const GET = defineHandler.withValidator({ query: pagination })(async (c, { query }) => ({
  items: await db
    .select({
      id: tags.id,
      name: tags.name,
      count: sql<number>`(select count(*) from ${bookmarkTags} where ${bookmarkTags.tagId} = ${tags.id})`,
    })
    .from(tags)
    .where(eq(tags.userId, requireAuth(c).id))
    .orderBy(asc(tags.name))
    .limit(query.limit)
    .offset(query.offset),
  ...query,
}));
