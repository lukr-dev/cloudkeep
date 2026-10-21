-- void:allow-destructive
-- Preserve cascading children while D1 keeps foreign keys enabled.
CREATE TABLE `__backup_bookmark_lists` AS SELECT * FROM `bookmark_lists`;--> statement-breakpoint
CREATE TABLE `__backup_bookmark_tags` AS SELECT * FROM `bookmark_tags`;--> statement-breakpoint
CREATE TABLE `__new_bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'link' NOT NULL,
	`url` text,
	`note_text` text,
	`asset_key` text,
	`asset_type` text,
	`asset_mime` text,
	`asset_name` text,
	`asset_size` integer,
	`title` text,
	`description` text,
	`image_url` text,
	`favicon_url` text,
	`site_name` text,
	`content_text` text,
	`summary` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`run_id` text NOT NULL,
	`title_edited` integer DEFAULT false NOT NULL,
	`description_edited` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_bookmarks`("id", "user_id", "type", "url", "note_text", "asset_key", "asset_type", "asset_mime", "asset_name", "asset_size", "title", "description", "image_url", "favicon_url", "site_name", "content_text", "summary", "status", "error", "run_id", "title_edited", "description_edited", "created_at", "updated_at") SELECT "id", "user_id", "type", "url", "note_text", "asset_key", "asset_type", "asset_mime", "asset_name", "asset_size", "title", "description", "image_url", "favicon_url", "site_name", "content_text", "summary", "status", "error", "run_id", "title_edited", "description_edited", "created_at", "updated_at" FROM `bookmarks`;--> statement-breakpoint
DROP TABLE `bookmarks`;--> statement-breakpoint
ALTER TABLE `__new_bookmarks` RENAME TO `bookmarks`;--> statement-breakpoint
INSERT OR IGNORE INTO `bookmark_lists` SELECT * FROM `__backup_bookmark_lists`;--> statement-breakpoint
INSERT OR IGNORE INTO `bookmark_tags` SELECT * FROM `__backup_bookmark_tags`;--> statement-breakpoint
DROP TABLE `__backup_bookmark_lists`;--> statement-breakpoint
DROP TABLE `__backup_bookmark_tags`;--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_user_url` ON `bookmarks` (`user_id`,`url`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_created` ON `bookmarks` (`user_id`,`created_at`,`id`);