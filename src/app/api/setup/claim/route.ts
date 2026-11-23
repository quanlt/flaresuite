import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { hasAdminAccount } from "@/lib/auth/setup";
import { matchesSetupToken, SETUP_TOKEN_COOKIE } from "@/lib/auth/setup-token";

/**
 * Opens first-run setup for the browser holding the workspace's setup link (FlareSuite Cloud). A valid token is
 * kept in an HttpOnly cookie for an hour and the visitor continues to /setup; anything else goes to /login.
 */
export async function GET(request: Request) {
	const env = getEnv();
	const url = new URL(request.url);
	const token = url.searchParams.get("token") ?? "";
	const base = env.APP_URL?.trim() || url.origin;
	if (await hasAdminAccount(env)) return NextResponse.redirect(new URL("/login", base), 303);
	if (!matchesSetupToken(env, token)) return NextResponse.json({ error: "This setup link is not valid" }, { status: 403 });
	const response = NextResponse.redirect(new URL("/setup", base), 303);
	response.cookies.set(SETUP_TOKEN_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https:"), path: "/", maxAge: 60 * 60 });
	return response;
}
