import type { CloudContext } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq } from "void/db";
import { HTTPException } from "hono/http-exception";
import { bookmarks, lists, profiles } from "../db/schema.ts";
import { z } from "zod";

export const idSchema = z.string().uuid();
export const idParams = z.object({ id: idSchema });
export const fail = (
  status: 400 | 401 | 403 | 404 | 409 | 411 | 413 | 415 | 502 | 503,
  message: string,
): never => {
  throw new HTTPException(status, { message });
};
export async function profileFor(c: CloudContext) {
  const user = requireAuth(c);
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  if (!profile) return fail(403, "Account is not provisioned");
  return profile;
}
export async function requireAdmin(c: CloudContext) {
  const profile = await profileFor(c);
  if (profile.role !== "admin") return fail(403, "Admin required");
  return profile;
}
export async function ownBookmark(userId: string, id: string) {
  const [bookmark] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, id)));
  return bookmark ?? fail(404, "Bookmark not found");
}
export async function ownList(userId: string, id: string) {
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.userId, userId), eq(lists.id, id)));
  return list ?? fail(404, "List not found");
}
export function publicBookmark(bookmark: typeof bookmarks.$inferSelect) {
  const {
    assetKey: _assetKey,
    runId: _runId,
    titleEdited: _titleEdited,
    descriptionEdited: _descriptionEdited,
    ...result
  } = bookmark;
  return {
    ...result,
    hasFile: !!bookmark.assetKey,
    fileUrl: bookmark.assetKey ? `/api/bookmarks/${bookmark.id}/file` : null,
  };
}
