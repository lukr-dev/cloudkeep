import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq } from "void/db";
import { z } from "zod";
import { bookmarks, bookmarkLists } from "../../../db/schema.ts";
import { normalizeUrl } from "../../../lib/url.ts";

export const GET = defineHandler.withValidator({ query: z.object({ url: z.string() }) })(async (
  c,
  { query },
) => {
  const userId = requireAuth(c).id;
  let url: string;
  try {
    url = normalizeUrl(query.url);
  } catch {
    return { bookmark: null };
  }
  const [bookmark] = await db
    .select({
      id: bookmarks.id,
      url: bookmarks.url,
      title: bookmarks.title,
      archivedAt: bookmarks.archivedAt,
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.url, url)))
    .limit(1);
  if (!bookmark) return { bookmark: null };
  const links = await db
    .select({ listId: bookmarkLists.listId })
    .from(bookmarkLists)
    .where(eq(bookmarkLists.bookmarkId, bookmark.id));
  return { bookmark: { ...bookmark, listIds: links.map((link) => link.listId) } };
});
