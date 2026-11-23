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

type CloudMailEnv = { MANAGED_MAIL?: string; CLOUD_API_URL?: string; CLOUD_WORKSPACE_ID?: string; INBOUND_WEBHOOK_SECRET?: string };

/** The Cloud's internal mail API for this workspace (private network), or null when the Cloud does not run its mail. */
export function cloudMailApi(env: CloudMailEnv): { url: string; token: string } | null {
	if (!isCloudManagedMail(env)) return null;
	const base = env.CLOUD_API_URL?.trim().replace(/\/$/, "");
	const id = env.CLOUD_WORKSPACE_ID?.trim();
	const token = env.INBOUND_WEBHOOK_SECRET?.trim();
	if (!base || !/^https?:\/\//.test(base) || !id || !token) return null;
	return { url: `${base}/internal/workspaces/${encodeURIComponent(id)}/mail`, token };
}

/** Calls the Cloud's mail API: "" reads the state, "/check" asks Resend to verify, "/connect" signs a Domain Connect link. */
export async function callCloudMail(env: CloudMailEnv, path: "" | "/check" | "/connect", body?: unknown): Promise<Response> {
	const api = cloudMailApi(env);
	if (!api) return Response.json({ error: "Cloud mail is not configured" }, { status: 404 });
	return fetch(`${api.url}${path}`, {
		method: path ? "POST" : "GET",
		headers: { authorization: `Bearer ${api.token}`, ...(body ? { "content-type": "application/json" } : {}) },
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(15_000),
	});
}
