import { filesEnabled, FILES_DISABLED_MESSAGE } from "./assets.ts";
import { ai } from "void/ai";
import { storage } from "void/storage";
import { db, and, eq, sql } from "void/db";
import { bookmarks, bookmarkTags, profiles, tags } from "../db/schema.ts";
import { fetchMetadata, MAX_CONTENT_CHARS } from "./metadata.ts";
import { complete, effectivePrompts } from "./settings.ts";
import { parseTags, renderPrompt } from "./prompts.ts";
import { linkTag } from "./tags.ts";

export type ProcessMessage = { bookmarkId: string; userId: string; runId: string };
export async function processBookmark(job: ProcessMessage) {
  const where = and(
    eq(bookmarks.id, job.bookmarkId),
    eq(bookmarks.userId, job.userId),
    eq(bookmarks.runId, job.runId),
  );
  const [bookmark] = await db
    .update(bookmarks)
    .set({ status: "processing", error: null, updatedAt: Date.now() })
    .where(and(where, eq(bookmarks.status, "pending")))
    .returning();
  if (!bookmark) return;
  try {
    if (bookmark.type === "asset" && !filesEnabled()) throw new Error(FILES_DISABLED_MESSAGE);
    let content =
      bookmark.type === "asset"
        ? bookmark.contentText || bookmark.assetName || ""
        : (bookmark.noteText ?? bookmark.contentText ?? "");
    if (bookmark.type === "asset" && bookmark.assetKey) {
      try {
        const object = await storage.get(bookmark.assetKey);
        if (object) {
          const result = await ai.toMarkdown({
            name: bookmark.assetName ?? "file",
            blob: new Blob([await object.arrayBuffer()], {
              type: bookmark.assetMime ?? "application/octet-stream",
            }),
          });
          if (result.format !== "error" && typeof result.data === "string" && result.data.trim())
            content = result.data.slice(0, MAX_CONTENT_CHARS);
        }
      } catch {
        // Extraction is optional, including when local development has no AI binding.
      }
    }
    const metadata =
      bookmark.type === "link"
        ? await fetchMetadata(bookmark.url!)
        : {
            title: bookmark.title ?? bookmark.assetName,
            description: bookmark.description,
            contentText: content.slice(0, MAX_CONTENT_CHARS),
          };

    await db
      .update(bookmarks)
      .set({
        ...metadata,
        title: sql`case when ${bookmarks.titleEdited} then ${bookmarks.title} else ${metadata.title} end`,
        description: sql`case when ${bookmarks.descriptionEdited} then ${bookmarks.description} else ${metadata.description} end`,
        updatedAt: Date.now(),
      })
      .where(where);
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, job.userId));
    if (
      profile?.provider &&
      (profile.provider === "workers-ai" ||
        (profile.provider === "openai" ? profile.openaiKey : profile.openrouterKey))
    ) {
      const templates = await effectivePrompts(job.userId);
      const existingTags = await db
        .select({ name: tags.name })
        .from(tags)
        .where(eq(tags.userId, job.userId))
        .limit(200);
      const variables = {
        url: bookmark.url ?? "",
        title: bookmark.titleEdited ? (bookmark.title ?? "") : (metadata.title ?? ""),
        description: bookmark.descriptionEdited
          ? (bookmark.description ?? "")
          : (metadata.description ?? ""),
        content: bookmark.type === "text" ? (bookmark.noteText ?? "") : metadata.contentText,
        existing_tags: JSON.stringify(existingTags.map((t) => t.name)),
        language: "English",
      };
      if (profile.autoTag) {
        const names = parseTags(
          await complete(profile, renderPrompt(templates.tagging.template, variables)),
        );
        await db
          .delete(bookmarkTags)
          .where(
            and(
              eq(bookmarkTags.bookmarkId, job.bookmarkId),
              eq(bookmarkTags.source, "ai"),
              sql`exists (select 1 from ${bookmarks} where ${bookmarks.id} = ${job.bookmarkId} and ${bookmarks.runId} = ${job.runId})`,
            ),
          );
        for (const name of names) await linkTag(job.userId, job.bookmarkId, name, "ai", job.runId);
      }
      if (profile.autoSummary) {
        const summary = (
          await complete(profile, renderPrompt(templates.summary.template, variables))
        )
          .trim()
          .slice(0, 4_000);
        if (!summary) throw new Error("AI returned an empty summary");
        await db.update(bookmarks).set({ summary }).where(where);
      }
    }
    await db
      .update(bookmarks)
      .set({ status: "done", error: null, updatedAt: Date.now() })
      .where(where);
  } catch (error) {
    // Only controlled messages go to the API; SDK errors may include secrets.
    const message =
      error instanceof Error &&
      (error.message === FILES_DISABLED_MESSAGE ||
        /^(Page |Too many page|AI provider returned|AI returned|Set an API key|Choose an AI)/.test(
          error.message,
        ))
        ? error.message
        : "Couldn’t process this bookmark. Check your AI settings, then retry.";
    await db
      .update(bookmarks)
      .set({ status: "failed", error: message, updatedAt: Date.now() })
      .where(where);
  }
}
