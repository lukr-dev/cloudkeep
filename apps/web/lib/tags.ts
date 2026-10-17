import { db, and, eq, sql } from "void/db";
import { bookmarkTags, bookmarks, tags } from "../db/schema.ts";

export async function linkTag(
  userId: string,
  bookmarkId: string,
  name: string,
  source: "manual" | "ai",
  runId?: string,
) {
  await db.insert(tags).values({ id: crypto.randomUUID(), userId, name }).onConflictDoNothing();
  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, name)));
  if (!tag) throw new Error("Tag creation failed");
  // An INSERT SELECT prevents a stale AI job from restoring links after reprocess/delete.
  const select = db
    .select({
      bookmarkId: bookmarks.id,
      tagId: sql<string>`${tag.id}`.as("tag_id"),
      source: sql<"manual" | "ai">`${source}`.as("source"),
    })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.id, bookmarkId),
        runId ? eq(bookmarks.runId, runId) : undefined,
      ),
    );
  if (source === "manual") {
    await db
      .insert(bookmarkTags)
      .select(select)
      .onConflictDoUpdate({
        target: [bookmarkTags.bookmarkId, bookmarkTags.tagId],
        set: { source: "manual" },
      });
  } else await db.insert(bookmarkTags).select(select).onConflictDoNothing();
  return tag;
}
