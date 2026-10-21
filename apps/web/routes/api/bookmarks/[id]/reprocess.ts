import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq } from "void/db";
import { z } from "zod";
import { bookmarks } from "../../../../db/schema.ts";
import { idParams, ownBookmark, publicBookmark } from "../../../../lib/http.ts";
import { enqueue } from "../../../../lib/enqueue.ts";

export const POST = defineHandler.withValidator({ params: idParams, body: z.object({}).strict() })(
  async (c, { params }) => {
    const userId = requireAuth(c).id;
    await ownBookmark(userId, params.id);
    const runId = crypto.randomUUID();
    const [bookmark] = await db
      .update(bookmarks)
      .set({ runId, status: "pending", error: null, updatedAt: Date.now() })
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, params.id)))
      .returning();
    const queued = await enqueue({ bookmarkId: params.id, userId, runId });
    return c.json(
      {
        bookmark: publicBookmark({
          ...bookmark!,
          ...(queued
            ? {}
            : {
                status: "failed" as const,
                error: "Could not enqueue processing; reprocess to retry",
              }),
        }),
      },
      queued ? 202 : 503,
    );
  },
);
