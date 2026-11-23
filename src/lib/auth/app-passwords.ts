import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { appPasswords, users } from "@/db/schema";
import { generateAppPassword, hashApiKey } from "@/lib/api-keys";
import type { ApiAuthResult } from "@/lib/api/key-auth-types";
import { newId } from "@/lib/ids";

/**
 * App passwords: what mail apps (Outlook, Apple Mail, Thunderbird) sign in with, over IMAP/SMTP through the mail
 * gateway or over JMAP. They are kept apart from API keys: they only grant mail (the `jmap` scope), follow the
 * account's mailbox access live, are listed under Settings → App passwords and are revoked with the sessions.
 */
export const APP_PASSWORD_SCOPES = ["jmap"] as const;
export const MAX_APP_PASSWORDS = 50;
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

export async function createAppPassword(env: CloudflareEnv, userId: string, name: string): Promise<{ id: string; password: string }> {
	const { fullKey, prefix, sha256 } = await generateAppPassword();
	const id = newId("apw");
	await getDb(env).insert(appPasswords).values({ id, userId, name: name.slice(0, 100), prefix, passwordSha256: sha256 });
	return { id, password: fullKey };
}

export async function listAppPasswords(env: CloudflareEnv, userId: string) {
	return getDb(env)
		.select({ id: appPasswords.id, name: appPasswords.name, createdAt: appPasswords.createdAt, lastUsedAt: appPasswords.lastUsedAt })
		.from(appPasswords)
		.where(eq(appPasswords.userId, userId))
		.orderBy(desc(appPasswords.createdAt));
}

/** Returns whether a password was removed. */
export async function revokeAppPassword(env: CloudflareEnv, userId: string, id: string): Promise<boolean> {
	const removed = await getDb(env)
		.delete(appPasswords)
		.where(and(eq(appPasswords.id, id), eq(appPasswords.userId, userId)))
		.returning({ id: appPasswords.id });
	return removed.length > 0;
}

export async function revokeAllAppPasswords(env: CloudflareEnv, userId: string): Promise<void> {
	await getDb(env).delete(appPasswords).where(eq(appPasswords.userId, userId));
}

/**
 * Resolves a presented app password to its account, as a mail-only principal. Spaces are ignored, since the
 * password is shown in groups of four ("abcd efgh ijkl mnop") and some apps keep them.
 */
export async function authenticateAppPassword(env: CloudflareEnv, secret: string): Promise<ApiAuthResult | null> {
	const password = secret.replace(/\s+/g, "");
	if (!/^[0-9A-Za-z]{16}$/.test(password)) return null;
	// Authentication reads the primary: a lagging read replica could still honour a password that was just revoked.
	const db = getDb({ DB: env.DB_PRIMARY ?? env.DB });
	const digest = await hashApiKey(password);
	const [row] = await db.select().from(appPasswords).where(eq(appPasswords.passwordSha256, digest)).limit(1);
	if (!row) return null;
	const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
	if (!user || user.disabled) return null;
	const stale = new Date(Date.now() - LAST_USED_WRITE_INTERVAL_MS);
	await db
		.update(appPasswords)
		.set({ lastUsedAt: new Date() })
		.where(and(eq(appPasswords.id, row.id), or(isNull(appPasswords.lastUsedAt), lt(appPasswords.lastUsedAt, stale))));
	return { keyId: row.id, keyKind: "app_password", userId: user.id, email: user.email, scopes: [...APP_PASSWORD_SCOPES], mailboxIds: null, user };
}
