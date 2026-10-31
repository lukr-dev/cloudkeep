import { ProviderError } from "./provider-error.ts";
import { db, and, eq, sql } from "void/db";
import { storage } from "void/storage";
import { queues } from "void/queues";
import { bookmarkAudio, bookmarks, profiles } from "../db/schema.ts";
import { filesEnabled } from "./assets.ts";
import { processingList } from "./processing-list.ts";
import { listProfile } from "./list-settings.ts";
import { complete, effectivePrompts } from "./settings.ts";
import { renderPrompt } from "./prompts.ts";
import { speechSettings, synthesize } from "./speech.ts";
export type AudioKind = "short" | "full";
export type AudioMessage = {
  type: "audio";
  bookmarkId: string;
  userId: string;
  runId: string;
  kind: AudioKind;
};
export function publicAudio(row: typeof bookmarkAudio.$inferSelect) {
  return {
    kind: row.kind,
    status: row.status,
    error: row.error,
    text: row.text,
    hasAudio: !!row.r2Key,
    url: row.r2Key ? `/api/bookmarks/${row.bookmarkId}/audio/${row.kind}?v=${row.updatedAt}` : null,
  };
}
export async function prepareAudio(bookmarkId: string, kind: AudioKind) {
  const now = Date.now();
  const runId = crypto.randomUUID();
  const [row] = await db
    .insert(bookmarkAudio)
    .values({ bookmarkId, kind, runId, status: "pending", createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [bookmarkAudio.bookmarkId, bookmarkAudio.kind],
      set: { runId, status: "pending", error: null, updatedAt: now },
      setWhere:
        kind === "full" ? sql`${bookmarkAudio.status} not in ('pending', 'processing')` : undefined,
    })
    .returning();
  return row;
}
export async function enqueueAudio(job: AudioMessage) {
  try {
    await queues.bookmarks.send(job);
    return true;
  } catch {
    await db
      .update(bookmarkAudio)
      .set({ status: "failed", error: "Could not enqueue audio; retry", updatedAt: Date.now() })
      .where(
        and(
          eq(bookmarkAudio.bookmarkId, job.bookmarkId),
          eq(bookmarkAudio.kind, job.kind),
          eq(bookmarkAudio.runId, job.runId),
        ),
      );
    return false;
  }
}
export async function processAudio(job: AudioMessage) {
  const where = and(
    eq(bookmarkAudio.bookmarkId, job.bookmarkId),
    eq(bookmarkAudio.kind, job.kind),
    eq(bookmarkAudio.runId, job.runId),
  );
  if (!filesEnabled()) {
    await db
      .update(bookmarkAudio)
      .set({
        status: "failed",
        error: "Audio storage is disabled on this server",
        updatedAt: Date.now(),
      })
      .where(where);
    return;
  }
  const [row] = await db
    .update(bookmarkAudio)
    .set({ status: "processing", updatedAt: Date.now() })
    .where(
      and(
        where,
        eq(bookmarkAudio.status, "pending"),
        sql`exists (select 1 from ${bookmarks} where ${bookmarks.id} = ${job.bookmarkId} and ${bookmarks.userId} = ${job.userId})`,
      ),
    )
    .returning();
  if (!row) return;
  let key: string | undefined;
  try {
    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.id, job.bookmarkId), eq(bookmarks.userId, job.userId)));
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, job.userId));
    if (!bookmark || !profile) return;
    const list = await processingList(job.userId, bookmark.processingListId);
    let text =
      job.kind === "short" && listProfile(profile, list).autoSummary ? bookmark.summary : null;
    if (!text) {
      const templates = await effectivePrompts(job.userId, list?.id);
      text = (
        await complete(
          listProfile(profile, list),
          renderPrompt(templates[job.kind === "full" ? "detailed_summary" : "summary"].template, {
            url: bookmark.url ?? "",
            title: bookmark.title ?? "",
            description: bookmark.description ?? "",
            content: bookmark.noteText ?? bookmark.contentText ?? "",
            existing_tags: "[]",
            language: "English",
          }),
          job.kind === "full" ? 2048 : 1024,
        )
      )
        .trim()
        .slice(0, job.kind === "full" ? 12_000 : 4_000);
      if (!text) throw new Error("AI returned an empty summary");
      if (job.kind === "short")
        await db
          .update(bookmarks)
          .set({ summary: text })
          .where(and(eq(bookmarks.id, job.bookmarkId), eq(bookmarks.runId, bookmark.runId)));
    }
    const settings = speechSettings(profile, list);
    await db
      .update(bookmarkAudio)
      .set({ ...(!row.r2Key ? { text, ...settings } : {}), updatedAt: Date.now() })
      .where(where);
    const blob = await synthesize(profile, settings, text);
    key = `audio/${job.userId}/${job.bookmarkId}/${job.kind}-${crypto.randomUUID()}.mp3`;
    await storage.put(key, blob.stream(), { httpMetadata: { contentType: "audio/mpeg" } });
    const updated = await db
      .update(bookmarkAudio)
      .set({
        text,
        ...settings,
        r2Key: key,
        size: blob.size,
        status: "done",
        error: null,
        updatedAt: Date.now(),
      })
      .where(where)
      .returning();
    if (!updated.length) await storage.delete(key);
    else if (row.r2Key) await storage.delete(row.r2Key).catch(() => {});
  } catch (error) {
    if (key) await storage.delete(key).catch(() => {});
    const message =
      error instanceof ProviderError ||
      (error instanceof Error &&
        /^(Set an API key|Choose an AI|AI provider returned HTTP \d+$|TTS provider returned HTTP \d+$|AI returned an empty summary$|TTS returned (invalid|empty) audio$)/.test(
          error.message,
        ))
        ? error.message
        : "Could not generate audio. Check your AI and TTS settings, then retry.";
    await db
      .update(bookmarkAudio)
      .set({ status: "failed", error: message, updatedAt: Date.now() })
      .where(where);
  }
}
