import { NextResponse } from "next/server";
import { authorizeDrive } from "@/lib/drive/auth";
import { toDriveItemDtos } from "@/lib/drive/access";
import { canEditDrive } from "@/lib/drive/utils";
import { readJsonBody } from "@/lib/http/request";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { getOfficeItem, OfficeError, readOfficeEnvelope } from "@/lib/office/service";
import { saveOfficeDocument } from "@/lib/office/save";
import { OFFICE_MAX_REQUEST_BYTES } from "@/lib/office/utils";
import type { OfficeDocumentResponse } from "@/lib/office/types";
import type { OfficeItemParams } from "../types";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

function officeErrorResponse(error: unknown) {
	if (error instanceof OfficeError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
	throw error;
}

/** Opens a document. Viewers and editors get the same content; `role` tells the editor what it may do. */
export async function GET(request: Request, { params }: OfficeItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request);
	if (auth.error) return auth.error;
	const { env, db, user } = auth;
	const found = await getOfficeItem(db, user.id, id);
	if (!found) return notFound();
	// Cheap change check for open editors: the row's modification time moves on every save and rename.
	if (new URL(request.url).searchParams.get("meta") === "1") {
		return NextResponse.json({ updatedAt: found.item.updatedAt.toISOString(), role: found.role }, { headers: { "Cache-Control": "no-store" } });
	}
	try {
		const envelope = await readOfficeEnvelope(env, found.item, found.kind);
		const [item] = await toDriveItemDtos(db, [found.item], user.id, () => found.role);
		const response: OfficeDocumentResponse = { item, kind: found.kind, role: found.role, revision: envelope.revision, content: envelope.content };
		return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return officeErrorResponse(error);
	}
}

/**
 * Saves a document: `{ content, baseRevision }`. A save based on an older revision than the stored one is refused
 * with 409 so two people editing at once never silently overwrite each other; the client then reloads or
 * explicitly overwrites by sending the current revision.
 */
export async function PUT(request: Request, { params }: OfficeItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) return auth.error;
	const { env, db, user } = auth;
	const found = await getOfficeItem(db, user.id, id);
	if (!found) return notFound();
	if (!canEditDrive(found.role)) return NextResponse.json({ error: "You only have permission to view this file" }, { status: 403 });

	let body: { content?: unknown; baseRevision?: unknown };
	try { body = await readJsonBody(request, OFFICE_MAX_REQUEST_BYTES); }
	catch (error) {
		if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "This file is too large to save", code: "TOO_LARGE" }, { status: 413 });
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
	const result = await saveOfficeDocument(env, db, found.item, found.kind, body);
	return NextResponse.json(result.body, { status: result.status });
}
