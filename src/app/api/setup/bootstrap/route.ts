import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getEnv } from "@/lib/cloudflare";
import { getDb } from "@/db";
import { mailboxes, users } from "@/db/schema";
import { hasAdminAccount } from "@/lib/auth/setup";
import { isSetupTokenRequired, matchesSetupToken, setupTokenFromRequest } from "@/lib/auth/setup-token";
import { newId } from "@/lib/ids";
import { addDomainForUser } from "@/lib/domains/service";
import { rollbackDomainProvisioning } from "@/lib/domains/rollback";
import type { DomainProvisioningChanges } from "@/lib/domains/types";
import { ensureMailboxDomainRouting } from "@/lib/mailboxes/domain-addresses";
import { ensureBookingUsername } from "@/lib/booking/username";
import { readJsonBody } from "@/lib/http/request";
import { normalizeHostname, isValidHostname } from "@/lib/domains/utils";

/**
 * FlareSuite Cloud creates the first administrator for its customer: the address and password chosen at sign-up
 * (the password arrives as a bcrypt hash, never in clear) and the domain, recorded without touching DNS so the
 * customer connects it from the Domains page. Only callers holding the workspace's SETUP_TOKEN may use it, and only
 * before any administrator exists. Calling it again with the same address is a no-op, so the control plane can retry.
 */
const bootstrapSchema = z.object({
	email: z.string().email().max(254),
	name: z.string().trim().min(1).max(100),
	passwordHash: z.string().regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/),
	/** The customer's personal address: workspace password resets go there until the domain receives mail. */
	resetEmail: z.string().email().max(254).nullable().optional(),
});

export async function POST(request: Request) {
	const env = getEnv();
	if (!isSetupTokenRequired(env) || !matchesSetupToken(env, setupTokenFromRequest(request))) {
		return NextResponse.json({ error: "Not allowed" }, { status: 403 });
	}
	let body: unknown;
	try {
		body = await readJsonBody(request, 8 * 1024);
	} catch {
		return NextResponse.json({ error: "Invalid bootstrap request" }, { status: 400 });
	}
	const parsed = bootstrapSchema.safeParse(body);
	if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	const email = parsed.data.email.toLowerCase().trim();
	const at = email.lastIndexOf("@");
	const localPart = email.slice(0, at);
	const domainName = normalizeHostname(email.slice(at + 1));
	if (!/^[a-z0-9._%+-]{1,64}$/.test(localPart) || !isValidHostname(domainName)) {
		return NextResponse.json({ error: "Invalid administrator address" }, { status: 400 });
	}

	const db = getDb(env);
	if (await hasAdminAccount(env)) {
		const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
		if (existing?.role === "admin") return NextResponse.json({ ok: true, alreadyComplete: true });
		return NextResponse.json({ error: "Initial setup is already complete" }, { status: 409 });
	}

	const userId = newId("usr");
	await db.insert(users).values({
		id: userId,
		remoteContentMode: "ask",
		email,
		passwordHash: parsed.data.passwordHash,
		resetEmail: parsed.data.resetEmail?.toLowerCase() ?? null,
		name: parsed.data.name,
		role: "admin",
		isPrimaryAdmin: true,
	});
	let changes: DomainProvisioningChanges | null = null;
	try {
		await ensureBookingUsername(env, userId, email);
		const added = await addDomainForUser(env, userId, domainName, { skipDns: true });
		changes = added.changes;
		const mailboxId = newId("mbx");
		await db.insert(mailboxes).values({ id: mailboxId, userId, domainId: added.domain.id, localPart, displayName: parsed.data.name });
		await ensureMailboxDomainRouting(env, db, { id: mailboxId, domainId: added.domain.id, localPart, useAllDomains: true });
	} catch (error) {
		if (changes) await rollbackDomainProvisioning(env, changes);
		await db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
		const message = error instanceof Error ? error.message : "Bootstrap failed";
		return NextResponse.json({ error: message }, { status: 500 });
	}
	const response = NextResponse.json({ ok: true });
	response.headers.set("Cache-Control", "no-store");
	return response;
}
