import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { driveShares, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { authorizeDrive } from "@/lib/drive/auth";
import { getDriveItem } from "@/lib/drive/access";
import { notifyShare } from "@/lib/drive/share-notify";
import { getServerTranslator } from "@/lib/i18n/server";
import type { DriveItemParams } from "../types";

async function loadOwnedItem(request: Request, params: DriveItemParams["params"], mutation: boolean) {
	const { id } = await params;
	const auth = await authorizeDrive(request, mutation);
	if (auth.error) return { error: auth.error } as const;
	const item = await getDriveItem(auth.db, id);
	if (!item || item.ownerId !== auth.user.id || item.trashedAt) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
	return { ...auth, item } as const;
}

async function listShares(db: Parameters<typeof getDriveItem>[0], itemId: string) {
	return db
		.select({ id: driveShares.id, userId: driveShares.userId, name: users.name, email: users.email, role: driveShares.role })
		.from(driveShares)
		.innerJoin(users, eq(driveShares.userId, users.id))
		.where(eq(driveShares.itemId, itemId))
		.orderBy(driveShares.createdAt);
}

export async function GET(request: Request, { params }: DriveItemParams) {
	const ctx = await loadOwnedItem(request, params, false);
	if (ctx.error) return ctx.error;
	return NextResponse.json({ shares: await listShares(ctx.db, ctx.item.id), linkToken: ctx.item.linkToken, linkRole: ctx.item.linkRole === "edit" ? "edit" : "view" });
}

export async function POST(request: Request, { params }: DriveItemParams) {
	const ctx = await loadOwnedItem(request, params, true);
	if (ctx.error) return ctx.error;
	const { db, user, item } = ctx;
	// `notify` (default true) emails people who did not have access yet; `message` is an optional note for them.
	// Posting an existing person again changes their role without a new email.
	const body = await request.json().catch(() => ({})) as { email?: unknown; role?: unknown; notify?: unknown; message?: unknown };
	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const role = body.role === "edit" ? "edit" : "view";
	if (!email) return NextResponse.json({ error: "Enter an email address" }, { status: 400 });
	const [target] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
	if (!target) return NextResponse.json({ error: "No account uses that email address" }, { status: 404 });
	if (target.id === user.id) return NextResponse.json({ error: "You already own this item" }, { status: 400 });
	const [existing] = await db.select({ id: driveShares.id }).from(driveShares).where(and(eq(driveShares.itemId, item.id), eq(driveShares.userId, target.id))).limit(1);
	await db.insert(driveShares).values({ id: newId("dshr"), itemId: item.id, userId: target.id, role }).onConflictDoUpdate({ target: [driveShares.itemId, driveShares.userId], set: { role } });
	let notified = false;
	if (!existing && body.notify !== false) {
		notified = await notifyShare(ctx.env, await getServerTranslator(), {
			item, role, recipientEmail: target.email,
			sharer: { name: user.name, email: user.email },
			message: typeof body.message === "string" ? body.message : undefined,
			requestUrl: request.url,
		});
	}
	return NextResponse.json({ shares: await listShares(db, item.id), notified });
}

export async function DELETE(request: Request, { params }: DriveItemParams) {
	const ctx = await loadOwnedItem(request, params, true);
	if (ctx.error) return ctx.error;
	const shareId = new URL(request.url).searchParams.get("shareId");
	if (!shareId) return NextResponse.json({ error: "Missing share" }, { status: 400 });
	await ctx.db.delete(driveShares).where(and(eq(driveShares.id, shareId), eq(driveShares.itemId, ctx.item.id)));
	return NextResponse.json({ shares: await listShares(ctx.db, ctx.item.id) });
}
