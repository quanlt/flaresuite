import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { driveItems, driveShares } from "@/db/schema";
import { authorizeDrive } from "@/lib/drive/auth";
import { collectDriveDescendants, toDriveItemDtos, withoutTrashedAncestors } from "@/lib/drive/access";
import type { DriveRole, DriveRow } from "@/lib/drive/types";
import { readJsonBody } from "@/lib/http/request";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { createOfficeItem, OfficeError } from "@/lib/office/service";
import { isOfficeKind, OFFICE_CONTENT_TYPES, OFFICE_MAX_REQUEST_BYTES, validateOfficeContent } from "@/lib/office/utils";
import type { OfficeContentMap, OfficeKind } from "@/lib/office/types";

/**
 * Documents of one kind the user can open: their own (in any folder), files shared with them, and files inside
 * folders shared with them. Newest first.
 */
export async function GET(request: Request) {
	const auth = await authorizeDrive(request);
	if (auth.error) return auth.error;
	const { db, user } = auth;
	const url = new URL(request.url);
	const kind = url.searchParams.get("kind");
	if (!isOfficeKind(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
	const contentType = OFFICE_CONTENT_TYPES[kind];
	const query = url.searchParams.get("q")?.trim().toLowerCase() ?? "";

	const owned = await db.select().from(driveItems)
		.where(and(eq(driveItems.ownerId, user.id), eq(driveItems.contentType, contentType), isNull(driveItems.trashedAt), isNull(driveItems.uploadId)))
		.orderBy(desc(driveItems.updatedAt)).limit(500);

	const shares = await db.select({ item: driveItems, role: driveShares.role }).from(driveShares)
		.innerJoin(driveItems, eq(driveShares.itemId, driveItems.id))
		.where(and(eq(driveShares.userId, user.id), isNull(driveItems.trashedAt)));
	const roles = new Map<string, DriveRole>();
	const shared: DriveRow[] = [];
	const sharedFolders: { id: string; role: DriveRole }[] = [];
	for (const { item, role } of shares) {
		if (item.kind === "folder") sharedFolders.push({ id: item.id, role: role as DriveRole });
		else if (item.contentType === contentType && !item.uploadId) { shared.push(item); roles.set(item.id, role as DriveRole); }
	}
	// Files inside shared folders inherit the folder's role; an edit share wins over a view share.
	for (const folder of sharedFolders) {
		const inside = await collectDriveDescendants(db, [folder.id]);
		for (const item of inside) {
			if (item.kind !== "file" || item.contentType !== contentType || item.trashedAt || item.uploadId || item.ownerId === user.id) continue;
			if (roles.get(item.id) !== "edit") roles.set(item.id, folder.role);
			if (!shared.some((entry) => entry.id === item.id)) shared.push(item);
		}
	}

	const visible = await withoutTrashedAncestors(db, [...owned, ...shared]);
	const filtered = query ? visible.filter((item) => item.name.toLowerCase().includes(query)) : visible;
	filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	const items = await toDriveItemDtos(db, filtered.slice(0, 500), user.id, (row) => (row.ownerId === user.id ? "owner" : roles.get(row.id) ?? "view"));
	return NextResponse.json({ items });
}

/** Creates a document: `{ kind, name?, parentId?, content? }`. `content` lets imports start from existing data. */
export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) return auth.error;
	const { env, db, user } = auth;
	let body: { kind?: unknown; name?: unknown; parentId?: unknown; content?: unknown };
	try { body = await readJsonBody(request, OFFICE_MAX_REQUEST_BYTES); }
	catch (error) {
		if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "This file is too large" }, { status: 413 });
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
	if (!isOfficeKind(body.kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
	const kind: OfficeKind = body.kind;
	if (body.content !== undefined) {
		const invalid = validateOfficeContent(kind, body.content);
		if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
	}
	try {
		const row = await createOfficeItem(env, db, user.id, { kind, name: body.name, parentId: body.parentId, content: body.content as OfficeContentMap[typeof kind] | undefined });
		const [item] = await toDriveItemDtos(db, [row], user.id, () => (row.ownerId === user.id ? "owner" : "edit"));
		return NextResponse.json({ item }, { status: 201 });
	} catch (error) {
		if (error instanceof OfficeError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
		throw error;
	}
}
