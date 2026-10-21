import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq } from "void/db";
import { storage } from "void/storage";
import { z } from "zod";
import { bookmarkAudio } from "../../../../../db/schema.ts";
import { idParams, ownBookmark, fail } from "../../../../../lib/http.ts";
import {
  filesEnabled,
  fileDisposition,
  FILES_DISABLED_MESSAGE,
} from "../../../../../lib/assets.ts";
import { parseAudioRange } from "../../../../../lib/tts.ts";
import { prepareAudio, enqueueAudio } from "../../../../../lib/audio.ts";
const params = idParams.extend({ kind: z.enum(["short", "full"]) });
export const GET = defineHandler.withValidator({ params })(async (c, { params }) => {
  await ownBookmark(requireAuth(c).id, params.id);
  if (!filesEnabled()) return fail(503, FILES_DISABLED_MESSAGE);
  const [row] = await db
    .select()
    .from(bookmarkAudio)
    .where(and(eq(bookmarkAudio.bookmarkId, params.id), eq(bookmarkAudio.kind, params.kind)));
  if (!row?.r2Key) return fail(404, "Audio not found");
  const head = await storage.head(row.r2Key);
  if (!head) return fail(404, "Audio not found");
  const range = parseAudioRange(c.req.header("Range") ?? null, head.size);
  if (range === "invalid")
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${head.size}` },
    });
  const object = await storage.get(row.r2Key, range ? { range } : undefined);
  if (!object) return fail(404, "Audio not found");
  return new Response(object.body, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Content-Length": String(range?.length ?? object.size),
      ...(range
        ? {
            "Content-Range": `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`,
          }
        : {}),
      "Content-Disposition": fileDisposition(
        `${params.kind}-summary.mp3`,
        c.req.query("download") === "1",
      ),
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      ETag: object.httpEtag,
    },
  });
});
export const POST = defineHandler.withValidator({ params })(async (c, { params }) => {
  const userId = requireAuth(c).id;
  const bookmark = await ownBookmark(userId, params.id);
  if (!filesEnabled()) return fail(503, FILES_DISABLED_MESSAGE);
  if (params.kind !== "full") return fail(400, "Reprocess the bookmark to retry short audio");
  if (["pending", "processing"].includes(bookmark.status))
    return fail(409, "Wait for bookmark processing to finish");
  const row = await prepareAudio(params.id, "full");
  if (
    row &&
    !(await enqueueAudio({
      type: "audio",
      bookmarkId: params.id,
      userId,
      kind: "full",
      runId: row.runId,
    }))
  )
    return fail(503, "Could not enqueue audio; retry");
  return c.json({ ok: true }, 202);
});
