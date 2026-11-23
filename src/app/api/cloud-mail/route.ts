import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { requireUser } from "@/lib/auth/cookies";
import { canManageDomains } from "@/lib/auth/admin";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { callCloudMail } from "@/lib/email/managed-mail";

/**
 * The DNS records and verification state of this workspace's domain, from FlareSuite Cloud, which runs its mail.
 * The Cloud is reached on the private network with the workspace's own secret, so admins never sign in to the Cloud.
 */
async function relay(request: Request, path: "" | "/check" | "/connect", body?: unknown) {
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!canManageDomains(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	if (path && !hasValidSessionMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	try {
		const response = await callCloudMail(env, path, body);
		const data = await response.json().catch(() => ({ error: "Unexpected answer from FlareSuite Cloud" }));
		return NextResponse.json(data, { status: response.ok ? 200 : response.status === 404 ? 404 : 502 });
	} catch {
		return NextResponse.json({ error: "FlareSuite Cloud is unreachable" }, { status: 502 });
	}
}

export async function GET(request: Request) {
	return relay(request, "");
}

export async function POST(request: Request) {
	const { action } = (await request.json().catch(() => ({}))) as { action?: string };
	if (action === "check") return relay(request, "/check");
	if (action === "connect") {
		// The DNS provider sends the admin back to this page, which then checks the records.
		const origin = (getEnv().APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
		return relay(request, "/connect", { returnUrl: `${origin}/domains?dns=connected` });
	}
	return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
