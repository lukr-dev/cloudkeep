ALTER TABLE `bookmarks` ADD `type` text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `note_text` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `asset_key` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `asset_type` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `asset_mime` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `asset_name` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `asset_size` integer;