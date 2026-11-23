/**
 * FlareSuite Cloud runs the mail of its hosted workspaces: it hands the workspace an SMTP login that may only send
 * from the workspace's domain, delivers inbound mail to the signed /api/inbound webhook, and shows the customer the
 * DNS records to add in its own dashboard. Domain providers chosen in the workspace do not apply then.
 */
export function isCloudManagedMail(env: { MANAGED_MAIL?: string }): boolean {
	return env.MANAGED_MAIL?.trim() === "1";
}

/** Where the customer adds this workspace's DNS records, when the Cloud runs its mail. */
export function cloudDnsUrl(env: { MANAGED_MAIL?: string; CLOUD_DNS_URL?: string }): string | null {
	if (!isCloudManagedMail(env)) return null;
	const url = env.CLOUD_DNS_URL?.trim();
	return url && /^https?:\/\//.test(url) ? url : null;
}
