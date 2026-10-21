import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { z } from "zod";
import { idParams, ownBookmark } from "../../../../../lib/http.ts";
import { tagName } from "../../../../../lib/prompts.ts";
import { linkTag } from "../../../../../lib/tags.ts";

export const POST = defineHandler.withValidator({
  params: idParams,
  body: z.object({ name: tagName }).strict(),
})(async (c, { params, body }) => {
  const userId = requireAuth(c).id;
  await ownBookmark(userId, params.id);
  const tag = await linkTag(userId, params.id, body.name, "manual");
  return { tag: { id: tag.id, name: tag.name, source: "manual" as const } };
});
