"use client";

import { authFetch } from "@/lib/auth/client";
import type { DriveItemDto } from "@/lib/drive/types";
import type { OfficeContentMap, OfficeKind } from "@/lib/office/types";

async function itemResponse(response: Response): Promise<DriveItemDto> {
	const data = await response.json().catch(() => ({})) as { item?: DriveItemDto; error?: string };
	if (!response.ok || !data.item) throw new Error(data.error || "request");
	return data.item;
}

/** Creates a document, optionally inside a Drive folder and from given content (templates, imports). */
export async function createOfficeDocument<K extends OfficeKind>(kind: K, options: { name?: string; parentId?: string | null; content?: OfficeContentMap[K] } = {}): Promise<DriveItemDto> {
	return itemResponse(await authFetch("/api/office", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ kind, name: options.name, parentId: options.parentId ?? undefined, content: options.content }),
	}));
}

export async function copyOfficeDocument(id: string, name?: string): Promise<DriveItemDto> {
	return itemResponse(await authFetch(`/api/office/${encodeURIComponent(id)}/copy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }));
}

export async function trashOfficeDocument(id: string): Promise<void> {
	await itemResponse(await authFetch(`/api/drive/items/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }));
}
