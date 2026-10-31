import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { z } from "zod";
import { idParams, ownBookmark, publicBookmark } from "../../../../lib/http.ts";
import { reprocess } from "../../../../lib/reprocess.ts";

export const POST = defineHandler.withValidator({ params: idParams, body: z.object({}).strict() })(
  async (c, { params }) => {
    const userId = requireAuth(c).id;
    await ownBookmark(userId, params.id);
    const result = await reprocess(userId, params.id);
    if (!result) return c.json({ error: "Bookmark not found" }, 404);
    return c.json({ bookmark: publicBookmark(result.bookmark) }, result.queued ? 202 : 503);
  },
);
