import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { driveItems } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getDriveItem, getDriveRole } from "@/lib/drive/access";
import { getDriveStorageLimit, getDriveStorageUsed } from "@/lib/drive/storage";
import { canEditDrive, driveObjectKey, normalizeDriveName } from "@/lib/drive/utils";
import type { DriveRow } from "@/lib/drive/types";
import { createEnvelope, defaultOfficeName, emptyContent, OFFICE_CONTENT_TYPES, OFFICE_MAX_BYTES, officeKindFromContentType, parseEnvelope } from "./utils";
import type { OfficeContentMap, OfficeEnvelope, OfficeKind } from "./types";

type Db = ReturnType<typeof getDb>;

export class OfficeError extends Error {
	constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

const encoder = new TextEncoder();

/** Loads the stored document. A missing object (e.g. a crashed first save) opens as an empty document. */
export async function readOfficeEnvelope<K extends OfficeKind>(env: CloudflareEnv, item: DriveRow, kind: K): Promise<OfficeEnvelope<K>> {
	const object = await env.BUCKET.get(item.r2Key ?? driveObjectKey(item.ownerId, item.id));
	if (!object) return createEnvelope(kind, emptyContent(kind), 0);
	const envelope = parseEnvelope(kind, await object.text());
	if (!envelope) throw new OfficeError("This file could not be opened", 422, "UNREADABLE");
	return envelope;
}

/** Writes an envelope over the item's object and records its size and modification time. */
export async function writeOfficeEnvelope(env: CloudflareEnv, db: Db, item: DriveRow, envelope: OfficeEnvelope): Promise<{ size: number; updatedAt: Date }> {
	const bytes = encoder.encode(JSON.stringify(envelope));
	if (bytes.byteLength > OFFICE_MAX_BYTES) throw new OfficeError("This file is too large to save", 413, "TOO_LARGE");
	const limit = await getDriveStorageLimit(env);
	if (limit !== null && (await getDriveStorageUsed(db, item.ownerId)) - item.size + bytes.byteLength > limit) {
		throw new OfficeError("Not enough Drive storage left to save this file", 413, "QUOTA");
	}
	const key = item.r2Key ?? driveObjectKey(item.ownerId, item.id);
	await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: item.contentType } });
	const updatedAt = new Date();
	await db.update(driveItems).set({ size: bytes.byteLength, updatedAt, r2Key: key }).where(eq(driveItems.id, item.id));
	return { size: bytes.byteLength, updatedAt };
}

/**
 * Resolves an item the user can open as a FlareSuite document, with their role. Returns null for anything they
 * cannot see, so callers answer 404 without revealing that it exists.
 */
export async function getOfficeItem(db: Db, userId: string, id: string) {
	const item = await getDriveItem(db, id);
	if (!item || item.kind !== "file" || item.uploadId) return null;
	const kind = officeKindFromContentType(item.contentType);
	if (!kind) return null;
	const role = await getDriveRole(db, userId, item);
	if (!role) return null;
	return { item, kind, role };
}

/**
 * Creates a document. In a shared folder the file belongs to the folder's owner (as uploads do), so the owner keeps
 * control of everything inside their folder.
 */
export async function createOfficeItem<K extends OfficeKind>(
	env: CloudflareEnv,
	db: Db,
	userId: string,
	input: { kind: K; name?: unknown; parentId?: unknown; content?: OfficeContentMap[K] },
): Promise<DriveRow> {
	let ownerId = userId;
	let parentId: string | null = null;
	if (typeof input.parentId === "string" && input.parentId) {
		const parent = await getDriveItem(db, input.parentId);
		const role = parent?.kind === "folder" ? await getDriveRole(db, userId, parent) : null;
		if (!parent || !canEditDrive(role)) throw new OfficeError("Folder not found", 404);
		parentId = parent.id;
		ownerId = parent.ownerId;
	}
	const name = normalizeDriveName(input.name) ?? defaultOfficeName(input.kind);
	const id = newId("drv");
	const now = new Date();
	const row: DriveRow = {
		id, ownerId, parentId, kind: "file", name, r2Key: driveObjectKey(ownerId, id), size: 0,
		contentType: OFFICE_CONTENT_TYPES[input.kind], uploadId: null, uploadPartSize: null, uploadFingerprint: null,
		linkToken: null, linkRole: "view", trashedAt: null, createdAt: now, updatedAt: now,
	};
	await db.insert(driveItems).values(row);
	try {
		const { size, updatedAt } = await writeOfficeEnvelope(env, db, row, createEnvelope(input.kind, input.content ?? emptyContent(input.kind)));
		return { ...row, size, updatedAt };
	} catch (error) {
		await db.delete(driveItems).where(eq(driveItems.id, id));
		await env.BUCKET.delete(row.r2Key!).catch(() => undefined);
		throw error;
	}
}
