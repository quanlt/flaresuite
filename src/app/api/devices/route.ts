import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { requireSessionUser } from "@/lib/api/auth";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { createDeviceKey, listDeviceKeys } from "@/lib/auth/device-keys";
import { mailAppServer } from "@/lib/auth/mail-apps";

const MAX_DEVICES = 50;

/** Mobile devices and mail apps signed in to this account (Settings → Devices), with the mail server settings. */
export async function GET(request: Request) {
	const env = getEnv();
	const { user, error } = await requireSessionUser(env, request);
	if (error) return error;
	return NextResponse.json({ devices: await listDeviceKeys(env, user.id), mailServer: mailAppServer(env), username: user.email });
}

/**
 * Creates an app password for a mail app (Outlook, Apple Mail, Thunderbird): `{ name }`. It is shown once, works
 * only for mail (JMAP, and IMAP/SMTP through the gateway), and is revoked with the other devices on password change.
 */
export async function POST(request: Request) {
	const env = getEnv();
	const { user, error } = await requireSessionUser(env, request);
	if (error) return error;
	if (!hasValidSessionMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	const body = await request.json().catch(() => ({})) as { name?: unknown };
	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name || name.length > 100) return NextResponse.json({ error: "Give the app a name of at most 100 characters" }, { status: 400 });
	if ((await listDeviceKeys(env, user.id)).length >= MAX_DEVICES) return NextResponse.json({ error: "Too many devices; sign some out first" }, { status: 400 });
	const { id, key } = await createDeviceKey(env, user.id, name, { appPassword: true });
	return NextResponse.json({ id, name, password: key, username: user.email, mailServer: mailAppServer(env) }, { status: 201 });
}
