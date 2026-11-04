CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_user_name_idx` ON `tag` (`user_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `work_session_tag` (
	`session_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`session_id`, `tag_id`),
	FOREIGN KEY (`session_id`) REFERENCES `work_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `work_session_tag_tag_idx` ON `work_session_tag` (`tag_id`);--> statement-breakpoint
ALTER TABLE `work_session` ADD `name` text;