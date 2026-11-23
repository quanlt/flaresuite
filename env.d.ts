interface CloudflareEnv {
	DB: D1Database;
	/** The raw D1 binding, kept on the primary while `DB` is a read-replica session (set by `withD1ReadSession`). */
	DB_PRIMARY?: D1Database;
	/** Connection string for an external database (PostgreSQL, MySQL, libSQL, ...); unset keeps D1. See docs/databases.md. */
	DATABASE_URL?: string;
	/** Driver override when it cannot be inferred from DATABASE_URL (neon, postgres-js, pglite, planetscale, ...). */
	DATABASE_DRIVER?: string;
	/** Auth token for libSQL / Turso. */
	DATABASE_AUTH_TOKEN?: string;
	/** Hyperdrive binding, used as the connection string when DATABASE_URL is unset. */
	HYPERDRIVE?: { connectionString: string };
	EMAIL: SendEmail;
	BUCKET: R2Bucket;
	INBOUND_QUEUE: Queue<import("./src/lib/email/inbound").InboundQueueMessage>;
	AGENT_QUEUE?: Queue<{ kind: "agent.draft"; jobId: string }>;
	AI?: Ai;
	AI_MODEL?: string;
	AI_BASE_URL?: string;
	AI_API_KEY?: string;
	// The outbound queue also carries webhook retries and import job chunks so that scheduled redelivery needs no extra binding.
	OUTBOUND_QUEUE: Queue<
		| import("./src/lib/email/send").OutboundQueueMessage
		| import("./src/lib/email/webhooks").WebhookRetryMessage
		| import("./src/lib/import/jobs-types").ImportJobMessage
	>;
	ASSETS: Fetcher;
	IMAGES: ImagesBinding;
	WORKER_SELF_REFERENCE: Fetcher;
	REALTIME: DurableObjectNamespace<
		import("./src/lib/realtime/hub").RealtimeHub
	>;
	LOGIN_RATE_LIMIT?: RateLimit;
	/** Mobile device sign-in (`/api/auth/device`), stricter than the web login. */
	DEVICE_LOGIN_RATE_LIMIT?: RateLimit;
	/** APNs auth key for the mobile push relay (src/lib/push/native.ts). */
	APNS_KEY_ID?: string;
	APNS_TEAM_ID?: string;
	/** The .p8 file contents (PKCS#8 PEM). */
	APNS_PRIVATE_KEY?: string;
	/** Origin of a FlareSuite push relay (mailflare-relay); lets this server push without APNS_* keys. */
	APNS_RELAY_URL?: string;
	/** Spamhaus Data Query Service key; enables ZEN (sending IP) and DBL (domain) checks in spam analysis. */
	SPAMHAUS_DQS_KEY?: string;
	/** abuse.ch Auth-Key; enables URLhaus malware-host checks for links in incoming mail. */
	ABUSECH_AUTH_KEY?: string;
	/** "off" disables the RDAP domain-age check in spam analysis. */
	SPAM_DOMAIN_AGE_CHECK?: string;
	AGENT_RATE_LIMIT?: RateLimit;
	/**
	 * Backblaze B2 storage. When all four are set, B2 replaces the R2 binding for raw mail, attachments, Drive,
	 * avatars, branding and backups. B2_ENDPOINT is the S3-compatible host, e.g. s3.us-west-004.backblazeb2.com.
	 */
	B2_KEY_ID?: string;
	B2_APPLICATION_KEY?: string;
	B2_BUCKET?: string;
	B2_ENDPOINT?: string;
	/**
	 * AWS S3 storage, used when B2 is not configured. Credentials fall back to AWS_ACCESS_KEY_ID /
	 * AWS_SECRET_ACCESS_KEY (read from the environment), so an existing SES key can serve both.
	 */
	S3_BUCKET?: string;
	S3_REGION?: string;
	S3_ACCESS_KEY_ID?: string;
	S3_SECRET_ACCESS_KEY?: string;
	CF_TOKEN?: string;
	/** Deployed Worker name Email Routing rules target; defaults to "flaresuite". */
	CF_EMAIL_WORKER_NAME?: string;
	CF_API_KEY?: string;
	CF_EMAIL?: string;
	TURNSTILE_SECRET_KEY?: string;
	GITHUB_UPDATE_TOKEN?: string;
	GITHUB_UPDATE_REF?: string;
	GITHUB_UPDATE_REPO?: string;
	/** Canonical FlareSuite repository (owner/name) the self-update reads releases from. */
	UPDATE_SOURCE_REPOSITORY?: string;
	/** FlareSuite Cloud: the plan this hosted workspace is on (pro or team), granted without a license key. */
	MANAGED_PLAN?: string;
	/** FlareSuite Cloud: account seats of the managed plan; empty or 0 is unlimited. */
	MANAGED_SEAT_LIMIT?: string;
	/** FlareSuite Cloud: "1" when the Cloud runs this workspace's mail (sends through SMTP_URL, receives on /api/inbound). */
	MANAGED_MAIL?: string;
	/** FlareSuite Cloud: page of the Cloud dashboard where the customer adds this workspace's DNS records. */
	CLOUD_DNS_URL?: string;
	/** When set, the first-run setup only accepts a browser that opened /api/setup/claim?token=<this>. */
	SETUP_TOKEN?: string;
	/** "node" when served by the self-hosted runtime in server/; unset on Workers. */
	MAILFLARE_RUNTIME?: "node";
	/** Shared secret the Cloudflare email relay signs inbound webhooks with (self-hosted only). */
	INBOUND_WEBHOOK_SECRET?: string;
	/** "1" refuses relays that do not sign the header map with a timestamp (relay Worker v2). */
	INBOUND_REQUIRE_SIGNED_HEADERS?: string;
	/** Cloudflare account id, needed for the Email Sending REST API off Workers. */
	CF_ACCOUNT_ID?: string;
	/** Public origin of this install (https://mail.example.com) when it sits behind a proxy. */
	APP_URL?: string;
	/** Node runtime only: set when a reverse proxy terminates TLS, so x-forwarded-proto is trusted. */
	TRUST_PROXY?: string;
	/** VAPID public key (uncompressed P-256 point, URL-safe base64) for Web Push. */
	VAPID_PUBLIC_KEY?: string;
	/** VAPID private scalar (URL-safe base64). Keep this secret. */
	VAPID_PRIVATE_KEY?: string;
	/** Contact URI for VAPID, e.g. mailto:admin@example.com or https://mail.example.com. */
	VAPID_SUBJECT?: string;
}
