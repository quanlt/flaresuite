import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getEnv } from "@/lib/cloudflare";
import { getPublicDriveItem, toDriveItemDtos } from "@/lib/drive/access";
import type { DriveRole } from "@/lib/drive/types";
import { readJsonBody } from "@/lib/http/request";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { OfficeError, readOfficeEnvelope } from "@/lib/office/service";
import { saveOfficeDocument } from "@/lib/office/save";
import { OFFICE_MAX_REQUEST_BYTES, officeKindFromContentType } from "@/lib/office/utils";
import type { OfficeDocumentResponse } from "@/lib/office/types";
import type { DriveTokenParams } from "../types";

/**
 * A Docs, Sheets or Slides file opened from an "anyone with the link" URL, for people without an account here:
 * the link's role (view or edit) applies to the shared item and to the documents inside a shared folder.
 */
async function resolve(request: Request, token: string) {
	const env = getEnv();
	const db = getDb(env);
	const resolved = await getPublicDriveItem(db, token, new URL(request.url).searchParams.get("item"));
	if (!resolved || resolved.item.kind !== "file" || resolved.item.uploadId) return null;
	const kind = officeKindFromContentType(resolved.item.contentType);
	if (!kind) return null;
	const role: DriveRole = resolved.root.linkRole === "edit" ? "edit" : "view";
	return { env, db, item: resolved.item, kind, role };
}

const notFound = () => NextResponse.json({ error: "Link not found" }, { status: 404 });
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: DriveTokenParams) {
	const found = await resolve(request, (await params).token);
	if (!found) return notFound();
	if (new URL(request.url).searchParams.get("meta") === "1") {
		return NextResponse.json({ updatedAt: found.item.updatedAt.toISOString(), role: found.role }, { headers: noStore });
	}
	try {
		const envelope = await readOfficeEnvelope(found.env, found.item, found.kind);
		// No viewer account: the item is described as a non-owner sees it (no link token, no owner-only fields).
		const [item] = await toDriveItemDtos(found.db, [found.item], "", () => found.role);
		const response: OfficeDocumentResponse = { item, kind: found.kind, role: found.role, revision: envelope.revision, content: envelope.content };
		return NextResponse.json(response, { headers: noStore });
	} catch (error) {
		if (error instanceof OfficeError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
		throw error;
	}
}

export async function PUT(request: Request, { params }: DriveTokenParams) {
	const found = await resolve(request, (await params).token);
	if (!found) return notFound();
	if (found.role !== "edit") return NextResponse.json({ error: "This link only allows viewing" }, { status: 403 });
	let body: { content?: unknown; baseRevision?: unknown };
	try { body = await readJsonBody(request, OFFICE_MAX_REQUEST_BYTES); }
	catch (error) {
		if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "This file is too large to save", code: "TOO_LARGE" }, { status: 413 });
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
	const result = await saveOfficeDocument(found.env, found.db, found.item, found.kind, body);
	return NextResponse.json(result.body, { status: result.status });
}
