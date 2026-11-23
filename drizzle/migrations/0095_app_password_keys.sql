-- JMAP-only API keys minted as 16-letter passwords (the former Settings → App passwords page) were mail-app
-- passwords in all but name: they become app passwords, keeping their secret.
INSERT INTO `app_passwords` (`id`, `user_id`, `name`, `prefix`, `password_sha256`, `created_at`, `last_used_at`) SELECT `id`, `user_id`, `name`, `prefix`, `key_sha256`, `created_at`, `last_used_at` FROM `api_keys` WHERE `kind` = 'legacy' AND `scopes` = '["jmap"]' AND length(`prefix`) = 6 AND `key_sha256` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `mcp_key_mailboxes` WHERE `key_id` IN (SELECT `id` FROM `api_keys` WHERE `kind` = 'legacy' AND `scopes` = '["jmap"]' AND length(`prefix`) = 6 AND `key_sha256` IS NOT NULL);
--> statement-breakpoint
DELETE FROM `api_keys` WHERE `kind` = 'legacy' AND `scopes` = '["jmap"]' AND length(`prefix`) = 6 AND `key_sha256` IS NOT NULL;
