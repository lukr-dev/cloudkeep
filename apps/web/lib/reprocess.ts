import { db, and, eq } from "void/db";
import { bookmarks } from "../db/schema.ts";
import { enqueue } from "./enqueue.ts";

export async function reprocess(userId: string, id: string, failedOnly = false) {
  const runId = crypto.randomUUID();
  const [bookmark] = await db
    .update(bookmarks)
    .set({ runId, status: "pending", error: null, updatedAt: Date.now() })
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.id, id),
        failedOnly ? eq(bookmarks.status, "failed") : undefined,
      ),
    )
    .returning();
  if (!bookmark) return null;
  const queued = await enqueue({ bookmarkId: id, userId, runId });
  return {
    queued,
    bookmark: {
      ...bookmark,
      ...(queued
        ? {}
        : {
            status: "failed" as const,
            error: "Could not enqueue processing; reprocess to retry",
          }),
    },
  };
}
