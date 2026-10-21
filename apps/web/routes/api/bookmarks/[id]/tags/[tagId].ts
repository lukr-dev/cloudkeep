import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq, sql } from "void/db";
import { z } from "zod";
import { bookmarkTags, tags } from "../../../../../db/schema.ts";
import { idSchema, ownBookmark } from "../../../../../lib/http.ts";

export const DELETE = defineHandler.withValidator({
  params: z.object({ id: idSchema, tagId: idSchema }),
})(async (c, { params }) => {
  const userId = requireAuth(c).id;
  await ownBookmark(userId, params.id);
  await db
    .delete(bookmarkTags)
    .where(
      and(
        eq(bookmarkTags.bookmarkId, params.id),
        eq(bookmarkTags.tagId, params.tagId),
        sql`exists (select 1 from ${tags} where ${tags.id} = ${params.tagId} and ${tags.userId} = ${userId})`,
      ),
    );
  return { ok: true };
});
