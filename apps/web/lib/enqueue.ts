import { queues } from "void/queues";
import { db, and, eq } from "void/db";
import { bookmarks } from "../db/schema.ts";
import type { ProcessMessage } from "./processing.ts";

export async function enqueue(job: ProcessMessage) {
  try {
    await queues.bookmarks.send(job);
    return true;
  } catch {
    await db
      .update(bookmarks)
      .set({
        status: "failed",
        error: "Could not enqueue processing; reprocess to retry",
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(bookmarks.id, job.bookmarkId),
          eq(bookmarks.userId, job.userId),
          eq(bookmarks.runId, job.runId),
        ),
      );
    return false;
  }
}
