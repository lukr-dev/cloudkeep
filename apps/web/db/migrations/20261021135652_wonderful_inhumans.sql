CREATE TABLE `bookmark_audio` (
	`bookmark_id` text NOT NULL,
	`kind` text NOT NULL,
	`run_id` text NOT NULL,
	`r2_key` text,
	`text` text,
	`provider` text,
	`model` text,
	`voice` text,
	`status` text NOT NULL,
	`error` text,
	`size` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`bookmark_id`, `kind`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `content_truncated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `processing_list_id` text REFERENCES lists(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `lists` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `lists` ADD `model` text;--> statement-breakpoint
ALTER TABLE `lists` ADD `reasoning_effort` text;--> statement-breakpoint
ALTER TABLE `lists` ADD `audio_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lists` ADD `tts_provider` text;--> statement-breakpoint
ALTER TABLE `lists` ADD `tts_model` text;--> statement-breakpoint
ALTER TABLE `lists` ADD `tts_voice` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `tts_provider` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `tts_model` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `tts_voice` text;