import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq, gt, asc } from "void/db";
import { z } from "zod";
import { bookmarks } from "../../../db/schema.ts";
import { idSchema } from "../../../lib/http.ts";
import { reprocess } from "../../../lib/reprocess.ts";

// Bound each request's DB/queue calls; the client walks the cursor, including past enqueue failures.
export const POST = defineHandler.withValidator({
  body: z.object({ after: idSchema.optional() }).strict(),
})(async (c, { body }) => {
  const userId = requireAuth(c).id;
  const rows = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.status, "failed"),
        body.after ? gt(bookmarks.id, body.after) : undefined,
      ),
    )
    .orderBy(asc(bookmarks.id))
    .limit(50);
  let queued = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await reprocess(userId, row.id, true);
    if (result?.queued) queued++;
    else if (result) failed++;
  }
  return { queued, failed, nextCursor: rows.length === 50 ? rows.at(-1)!.id : null };
});
