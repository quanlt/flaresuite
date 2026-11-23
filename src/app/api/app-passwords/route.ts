import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { requireSessionUser } from "@/lib/api/auth";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { createAppPassword, listAppPasswords, MAX_APP_PASSWORDS } from "@/lib/auth/app-passwords";
import { mailAppServer } from "@/lib/auth/mail-apps";

/** The account's app passwords (Settings → App passwords), with the mail server settings mail apps need. */
export async function GET(request: Request) {
	const env = getEnv();
	const { user, error } = await requireSessionUser(env, request);
	if (error) return error;
	return NextResponse.json({ appPasswords: await listAppPasswords(env, user.id), mailServer: mailAppServer(env), username: user.email });
}

/**
 * Creates an app password for a mail app (Outlook, Apple Mail, Thunderbird): `{ name }`. It is shown once, works
 * only for mail (IMAP/SMTP through the gateway, and JMAP), and is revoked on password change.
 */
export async function POST(request: Request) {
	const env = getEnv();
	const { user, error } = await requireSessionUser(env, request);
	if (error) return error;
	if (!hasValidSessionMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	const body = await request.json().catch(() => ({})) as { name?: unknown };
	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name || name.length > 100) return NextResponse.json({ error: "Give the app a name of at most 100 characters" }, { status: 400 });
	if ((await listAppPasswords(env, user.id)).length >= MAX_APP_PASSWORDS) return NextResponse.json({ error: "Too many app passwords; revoke some first" }, { status: 400 });
	const { id, password } = await createAppPassword(env, user.id, name);
	return NextResponse.json({ id, name, password, username: user.email, mailServer: mailAppServer(env) }, { status: 201 });
}
