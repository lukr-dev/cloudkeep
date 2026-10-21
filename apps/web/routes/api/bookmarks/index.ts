import { processingListForCreate } from "../../../lib/processing-list.ts";
import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq, desc, or, sql, count, inArray, isNull, isNotNull } from "void/db";
import { z } from "zod";
import {
  bookmarkAudio,
  bookmarks,
  bookmarkLists,
  bookmarkTags,
  lists,
  tags,
} from "../../../db/schema.ts";
import { idSchema, fail, publicBookmark } from "../../../lib/http.ts";
import {
  archivedQuery,
  bookmarkType,
  createBookmark,
  pagination,
} from "../../../lib/validators.ts";
import { markdownExcerpt } from "../../../lib/assets.ts";
import { enqueue } from "../../../lib/enqueue.ts";

export const GET = defineHandler.withValidator({
  query: pagination.extend({
    archived: archivedQuery,
    type: bookmarkType.optional(),
    listId: idSchema.optional(),
    tag: z.string().trim().toLowerCase().min(1).max(40).optional(),
    q: z.string().trim().max(200).optional(),
  }),
})(async (c, { query }) => {
  const userId = requireAuth(c).id;
  const pattern = `%${(query.q ?? "").replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(
    eq(bookmarks.userId, userId),
    query.archived ? isNotNull(bookmarks.archivedAt) : isNull(bookmarks.archivedAt),
    query.type ? eq(bookmarks.type, query.type) : undefined,
    query.listId
      ? sql`exists (select 1 from ${bookmarkLists} where ${bookmarkLists.bookmarkId} = ${bookmarks.id} and ${bookmarkLists.listId} = ${query.listId})`
      : undefined,
    query.tag
      ? sql`exists (select 1 from ${bookmarkTags} join ${tags} on ${tags.id} = ${bookmarkTags.tagId} where ${bookmarkTags.bookmarkId} = ${bookmarks.id} and ${tags.userId} = ${userId} and ${tags.name} = ${query.tag})`
      : undefined,
    query.q
      ? or(
          sql`${bookmarks.title} like ${pattern} escape '\\'`,
          sql`${bookmarks.url} like ${pattern} escape '\\'`,
          sql`${bookmarks.description} like ${pattern} escape '\\'`,
          sql`${bookmarks.noteText} like ${pattern} escape '\\'`,
          sql`${bookmarks.assetName} like ${pattern} escape '\\'`,
          sql`${bookmarks.contentText} like ${pattern} escape '\\'`,
        )
      : undefined,
  );
  const rows = await db
    .select()
    .from(bookmarks)
    .where(where)
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .limit(query.limit)
    .offset(query.offset);
  const [total] = await db.select({ count: count() }).from(bookmarks).where(where);
  const ids = rows.map((b) => b.id);
  const tagLinks = ids.length
    ? await db
        .select({
          bookmarkId: bookmarkTags.bookmarkId,
          id: tags.id,
          name: tags.name,
          source: bookmarkTags.source,
        })
        .from(bookmarkTags)
        .innerJoin(tags, eq(tags.id, bookmarkTags.tagId))
        .where(and(inArray(bookmarkTags.bookmarkId, ids), eq(tags.userId, userId)))
    : [];
  const audio = ids.length
    ? await db
        .select({ bookmarkId: bookmarkAudio.bookmarkId })
        .from(bookmarkAudio)
        .where(and(inArray(bookmarkAudio.bookmarkId, ids), sql`${bookmarkAudio.r2Key} is not null`))
    : [];
  const listLinks = ids.length
    ? await db.select().from(bookmarkLists).where(inArray(bookmarkLists.bookmarkId, ids))
    : [];
  return {
    items: rows.map((row) => {
      const { contentText: _content, noteText: _note, ...item } = publicBookmark(row);
      return {
        ...item,
        hasAudio: audio.some((a) => a.bookmarkId === row.id),
        excerpt: row.type === "link" ? null : markdownExcerpt(row.noteText ?? row.contentText),
        tags: tagLinks
          .filter((t) => t.bookmarkId === row.id)
          .map(({ bookmarkId: _id, ...tag }) => tag),
        listIds: listLinks.filter((l) => l.bookmarkId === row.id).map((l) => l.listId),
      };
    }),
    total: total!.count,
    limit: query.limit,
    offset: query.offset,
  };
});
export const POST = defineHandler.withValidator({ body: createBookmark })(async (c, { body }) => {
  const userId = requireAuth(c).id;
  if (body.listIds.length) {
    const owned = await db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.userId, userId), inArray(lists.id, body.listIds)));
    if (owned.length !== body.listIds.length) return fail(404, "List not found");
  }
  const processingListId = await processingListForCreate(userId, body.listIds);
  const id = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const now = Date.now();
  const [created] = await db.batch([
    db
      .insert(bookmarks)
      .values({
        id,
        userId,
        processingListId,
        type: body.type ?? "link",
        url: body.type === "text" ? null : body.url,
        noteText: body.type === "text" ? body.text : null,
        title: body.title,
        description: body.type === "text" ? undefined : body.description,
        titleEdited: body.title !== undefined,
        descriptionEdited: body.type !== "text" && body.description !== undefined,
        runId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: [bookmarks.userId, bookmarks.url] })
      .returning(),
    db.insert(bookmarkLists).select(
      db
        .select({ bookmarkId: sql<string>`${id}`.as("bookmark_id"), listId: lists.id })
        .from(lists)
        .where(
          and(
            eq(lists.userId, userId),
            body.listIds.length ? inArray(lists.id, body.listIds) : sql`0`,
            sql`exists (select 1 from ${bookmarks} where ${bookmarks.id} = ${id})`,
          ),
        ),
    ),
  ]);
  if (!created[0]) {
    if (body.type === "text") return fail(503, "Could not save note");
    const where = and(eq(bookmarks.userId, userId), eq(bookmarks.url, body.url));
    const bumpedAt = Date.now();
    const [updated] = await db.batch([
      db
        .update(bookmarks)
        .set({
          ...(body.title !== undefined ? { title: body.title, titleEdited: true } : {}),
          ...(body.description !== undefined
            ? { description: body.description, descriptionEdited: true }
            : {}),
          // Break millisecond ties so re-saving always moves the bookmark to the top.
          createdAt: sql`max(${bumpedAt}, (select max(created_at) + 1 from bookmarks where user_id = ${userId}))`,
          updatedAt: bumpedAt,
          archivedAt: null,
        })
        .where(where)
        .returning(),
      db
        .insert(bookmarkLists)
        .select(
          db
            .select({ bookmarkId: bookmarks.id, listId: lists.id })
            .from(bookmarks)
            .innerJoin(lists, eq(lists.userId, userId))
            .where(and(where, body.listIds.length ? inArray(lists.id, body.listIds) : sql`0`)),
        )
        .onConflictDoNothing(),
    ]);
    return c.json({ bookmark: publicBookmark(updated[0]!), alreadyExists: true }, 200);
  }
  const queued = await enqueue({ bookmarkId: id, userId, runId });
  return c.json(
    {
      alreadyExists: false,
      bookmark: publicBookmark({
        ...created[0],
        ...(queued
          ? {}
          : {
              status: "failed" as const,
              error: "Could not enqueue processing; reprocess to retry",
            }),
      }),
    },
    201,
  );
});
