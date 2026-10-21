import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { storage } from "void/storage";
import { idParams, ownBookmark, fail } from "../../../../lib/http.ts";
import { fileDisposition, filesEnabled, FILES_DISABLED_MESSAGE } from "../../../../lib/assets.ts";

export const GET = defineHandler.withValidator({ params: idParams })(async (c, { params }) => {
  const bookmark = await ownBookmark(requireAuth(c).id, params.id);
  if (!bookmark.assetKey || !bookmark.assetMime) return fail(404, "File not found");
  if (!filesEnabled()) return fail(503, FILES_DISABLED_MESSAGE);
  const object = await storage.get(bookmark.assetKey);
  if (!object) return fail(404, "File not found");
  return new Response(object.body, {
    headers: {
      "Content-Type": bookmark.assetMime,
      "Content-Length": String(object.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-cache",
      ETag: object.httpEtag,
      "Content-Disposition": fileDisposition(
        bookmark.assetName ?? "file",
        c.req.query("download") === "1",
      ),
    },
  });
});
