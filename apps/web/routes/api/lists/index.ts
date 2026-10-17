import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, eq, asc, sql } from "void/db";
import { lists, bookmarkLists } from "../../../db/schema.ts";
import { listBody, pagination } from "../../../lib/validators.ts";

export const GET = defineHandler.withValidator({ query: pagination })(async (c, { query }) => ({
  items: await db
    .select({
      id: lists.id,
      name: lists.name,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt,
      count: sql<number>`(select count(*) from ${bookmarkLists} where ${bookmarkLists.listId} = ${lists.id})`,
    })
    .from(lists)
    .where(eq(lists.userId, requireAuth(c).id))
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
