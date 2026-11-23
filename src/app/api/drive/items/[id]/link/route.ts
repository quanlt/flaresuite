import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { driveItems } from "@/db/schema";
import { newId } from "@/lib/ids";
import { authorizeDrive } from "@/lib/drive/auth";
import { getDriveItem } from "@/lib/drive/access";
import type { DriveItemParams } from "../types";

/**
 * General access: `{ enabled, role }` turns the "anyone with the link" URL on or off and sets what it allows
 * (`view`, or `edit` for Docs, Sheets and Slides). Turning it off invalidates the old token.
 */
export async function POST(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) return auth.error;
	const item = await getDriveItem(auth.db, id);
	if (!item || item.ownerId !== auth.user.id || item.trashedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
	const body = await request.json().catch(() => ({})) as { enabled?: unknown; role?: unknown };
	if (body.role !== undefined && body.role !== "view" && body.role !== "edit") return NextResponse.json({ error: "Invalid role" }, { status: 400 });
	const enabled = body.enabled === undefined ? !!item.linkToken : !!body.enabled;
	const linkToken = enabled ? item.linkToken ?? `${newId()}${newId()}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 32) : null;
	// A link turned off forgets its role, so turning it on again starts as view only.
	const linkRole = enabled ? ((body.role as "view" | "edit" | undefined) ?? (item.linkRole === "edit" ? "edit" : "view")) : "view";
	await auth.db.update(driveItems).set({ linkToken, linkRole }).where(eq(driveItems.id, id));
	return NextResponse.json({ linkToken, linkRole });
}
