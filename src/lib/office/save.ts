import { getDb } from "@/db";
import { getDriveItem } from "@/lib/drive/access";
import type { DriveRow } from "@/lib/drive/types";
import { OfficeError, readOfficeEnvelope, writeOfficeEnvelope } from "./service";
import { createEnvelope, validateOfficeContent } from "./utils";
import type { OfficeContentMap, OfficeKind, OfficeSaveResponse } from "./types";

type Db = ReturnType<typeof getDb>;

/**
 * Saves `{ content, baseRevision }` over a document, refusing (409 CONFLICT) a save based on an older revision so
 * two people editing at once never silently overwrite each other. Shared by the signed-in editor and link editors.
 */
export async function saveOfficeDocument(env: CloudflareEnv, db: Db, item: DriveRow, kind: OfficeKind, body: { content?: unknown; baseRevision?: unknown }): Promise<{ status: number; body: OfficeSaveResponse | { error: string; code?: string; revision?: number } }> {
	const invalid = validateOfficeContent(kind, body.content);
	if (invalid) return { status: 400, body: { error: invalid } };
	if (typeof body.baseRevision !== "number") return { status: 400, body: { error: "Missing baseRevision" } };
	try {
		const current = await readOfficeEnvelope(env, item, kind);
		if (body.baseRevision !== current.revision) return { status: 409, body: { error: "Someone else changed this file", code: "CONFLICT", revision: current.revision } };
		// Re-read the row: the size the quota check subtracts must be the stored one, not a stale copy.
		const fresh = await getDriveItem(db, item.id) ?? item;
		const revision = current.revision + 1;
		const { size, updatedAt } = await writeOfficeEnvelope(env, db, fresh, createEnvelope(kind, body.content as OfficeContentMap[typeof kind], revision));
		return { status: 200, body: { revision, updatedAt: updatedAt.toISOString(), size } };
	} catch (error) {
		if (error instanceof OfficeError) return { status: error.status, body: { error: error.message, code: error.code } };
		throw error;
	}
}
