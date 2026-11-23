import { getDatabaseConfig } from "@/db/with-database";
import { hasCloudflareCredentials, isNodeRuntime } from "@/lib/runtime";
import type { SetupRequirementCheck } from "./types";

export function getSetupRequirementChecks(env: CloudflareEnv): SetupRequirementCheck[] {
	const hasApiToken = !!env.CF_TOKEN?.trim();
	const hasGlobalKey = !!env.CF_API_KEY?.trim() && !!env.CF_EMAIL?.trim();

	const database = getDatabaseConfig(env);
	if (isNodeRuntime(env)) {
		const mailer = env.EMAIL as unknown as { configured?: boolean };
		return [
			{
				key: "Database",
				configured: !!env.DB,
				message: database.driver === "d1" ? "DATA_DIR must be writable; the SQLite database is created there on start." : "DATABASE_URL must be reachable; migrations are applied on start.",
			},
			// A managed (hosted) workspace sends through the provider each domain picks (Resend, SES) after setup,
			// so a server-wide mailer is optional there.
			env.MANAGED_PLAN?.trim()
				? {
					key: "Outbound mail (optional)",
					configured: true,
					message: mailer?.configured === true
						? "A server-wide mailer is configured."
						: "Choose a sending provider (Resend or Amazon SES) for each domain on the Domains page after setup.",
				}
				: {
					key: "Outbound mail",
					configured: mailer?.configured === true,
					message: "Set SMTP_URL, or CF_ACCOUNT_ID with CF_TOKEN to send through Cloudflare. Receiving works without it.",
				},
			{
				key: "Cloudflare API credentials (optional)",
				configured: true,
				message: hasCloudflareCredentials(env)
					? "Domains are provisioned on Cloudflare automatically."
					: "Not set: add MX and SPF records for each domain by hand, as shown on the domain page.",
			},
		];
	}

	return [
		{
			key: "Cloudflare API credentials",
			configured: hasApiToken || hasGlobalKey,
			message: "Set CF_TOKEN, or set both CF_API_KEY and CF_EMAIL.",
		},
		{
			key: database.driver === "d1" ? "D1 database" : "Database",
			configured: !!env.DB,
			message: database.driver === "d1" ? "Deploy the Worker with the DB binding from wrangler.jsonc." : "Check DATABASE_URL (and DATABASE_DRIVER) for the external database.",
		},
	];
}
