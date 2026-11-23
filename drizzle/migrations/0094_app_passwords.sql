CREATE TABLE `app_passwords` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`password_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_passwords_user_idx` ON `app_passwords` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_passwords_password_sha256_idx` ON `app_passwords` (`password_sha256`);
--> statement-breakpoint
INSERT INTO `app_passwords` (`id`, `user_id`, `name`, `prefix`, `password_sha256`, `created_at`, `last_used_at`) SELECT `id`, `user_id`, `name`, `prefix`, `key_sha256`, `created_at`, `last_used_at` FROM `api_keys` WHERE `kind` = 'device' AND `key_sha256` IS NOT NULL;
--> statement-breakpoint
DROP TABLE `push_devices`;
--> statement-breakpoint
DELETE FROM `api_keys` WHERE `kind` = 'device';
