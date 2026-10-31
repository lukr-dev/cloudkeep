import { sql } from "void/db";
import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from "void/schema-d1";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  provider: text("provider", { enum: ["workers-ai", "openrouter", "openai"] }),
  model: text("model"),
  reasoningEffort: text("reasoning_effort", { enum: ["none", "low", "medium", "high"] }),
  openaiKey: text("openai_key"),
  openrouterKey: text("openrouter_key"),
  ttsProvider: text("tts_provider", { enum: ["workers-ai", "openrouter", "openai"] }),
  ttsModel: text("tts_model"),
  ttsVoice: text("tts_voice"),
  autoTag: integer("auto_tag", { mode: "boolean" }).notNull().default(true),
  autoSummary: integer("auto_summary", { mode: "boolean" }).notNull().default(false),
});
export const setup = sqliteTable("setup", {
  id: integer("id").primaryKey(),
  userId: text("user_id").notNull(),
});
export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => profiles.userId),
  expiresAt: integer("expires_at"),
  usedBy: text("used_by"),
  usedAt: integer("used_at"),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
});
export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    type: text("type", { enum: ["link", "text", "asset"] })
      .notNull()
      .default("link"),
    url: text("url"),
    noteText: text("note_text"),
    assetKey: text("asset_key"),
    assetType: text("asset_type", { enum: ["image", "pdf"] }),
    assetMime: text("asset_mime"),
    assetName: text("asset_name"),
    assetSize: integer("asset_size"),
    title: text("title"),
    description: text("description"),
    imageUrl: text("image_url"),
    faviconUrl: text("favicon_url"),
    siteName: text("site_name"),
    contentText: text("content_text"),
    summary: text("summary"),
    contentTruncated: integer("content_truncated", { mode: "boolean" }).notNull().default(false),
    pageTruncated: integer("page_truncated", { mode: "boolean" }).notNull().default(false),
    processingListId: text("processing_list_id").references(() => lists.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: ["pending", "processing", "done", "failed"] })
      .notNull()
      .default("pending"),
    error: text("error"),
    runId: text("run_id").notNull(),
    // Keep user edits when metadata is refreshed.
    titleEdited: integer("title_edited", { mode: "boolean" }).notNull().default(false),
    descriptionEdited: integer("description_edited", { mode: "boolean" }).notNull().default(false),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("bookmarks_user_url").on(t.userId, t.url),
    index("bookmarks_user_created").on(t.userId, t.createdAt, t.id),
    index("bookmarks_user_active_created")
      .on(t.userId, t.createdAt, t.id)
      .where(sql`${t.archivedAt} is null`),
  ],
);
export const lists = sqliteTable(
  "lists",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider", { enum: ["workers-ai", "openrouter", "openai"] }),
    model: text("model"),
    reasoningEffort: text("reasoning_effort", { enum: ["none", "low", "medium", "high"] }),
    audioEnabled: integer("audio_enabled", { mode: "boolean" }).notNull().default(false),
    ttsProvider: text("tts_provider", { enum: ["workers-ai", "openrouter", "openai"] }),
    ttsModel: text("tts_model"),
    ttsVoice: text("tts_voice"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("lists_user").on(t.userId)],
);
export const bookmarkLists = sqliteTable(
  "bookmark_lists",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.bookmarkId, t.listId] }),
    index("bookmark_lists_list").on(t.listId),
  ],
);
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("tags_user_name").on(t.userId, t.name)],
);
export const bookmarkTags = sqliteTable(
  "bookmark_tags",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["ai", "manual"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.bookmarkId, t.tagId] }), index("bookmark_tags_tag").on(t.tagId)],
);
export const prompts = sqliteTable(
  "prompts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    listId: text("list_id").references(() => lists.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["tagging", "summary", "detailed_summary"] }).notNull(),
    template: text("template").notNull(),
  },
  (t) => [
    uniqueIndex("prompts_user_default")
      .on(t.userId, t.kind)
      .where(sql`${t.listId} is null`),
    uniqueIndex("prompts_user_list")
      .on(t.userId, t.listId, t.kind)
      .where(sql`${t.listId} is not null`),
  ],
);

export const bookmarkAudio = sqliteTable(
  "bookmark_audio",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["short", "full"] }).notNull(),
    runId: text("run_id").notNull(),
    r2Key: text("r2_key"),
    text: text("text"),
    provider: text("provider", { enum: ["workers-ai", "openrouter", "openai"] }),
    model: text("model"),
    voice: text("voice"),
    status: text("status", { enum: ["pending", "processing", "done", "failed"] }).notNull(),
    error: text("error"),
    size: integer("size"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.bookmarkId, t.kind] })],
);
