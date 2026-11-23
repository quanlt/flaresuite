import { NextResponse } from "next/server";
import { authorizeDrive } from "@/lib/drive/auth";
import { toDriveItemDtos } from "@/lib/drive/access";
import { readJsonObject } from "@/lib/http/request";
import { createOfficeItem, getOfficeItem, OfficeError, readOfficeEnvelope } from "@/lib/office/service";
import type { OfficeItemParams } from "../../types";

/**
 * "Make a copy": anyone who can open a document may copy it into their own Drive root, viewers included,
 * as with any file they could download.
 */
export async function POST(request: Request, { params }: OfficeItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) return auth.error;
	const { env, db, user } = auth;
	const found = await getOfficeItem(db, user.id, id);
	if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
	const body = await readJsonObject<{ name?: unknown }>(request) ?? {};
	try {
		const envelope = await readOfficeEnvelope(env, found.item, found.kind);
		const name = typeof body.name === "string" && body.name.trim() ? body.name : `Copy of ${found.item.name}`;
		const row = await createOfficeItem(env, db, user.id, { kind: found.kind, name, content: envelope.content });
		const [item] = await toDriveItemDtos(db, [row], user.id, () => "owner");
		return NextResponse.json({ item }, { status: 201 });
	} catch (error) {
		if (error instanceof OfficeError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
		throw error;
	}
}
