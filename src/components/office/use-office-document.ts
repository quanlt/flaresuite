"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/auth/client";
import { canEditDrive } from "@/lib/drive/utils";
import type { DriveItemDto, DriveRole } from "@/lib/drive/types";
import type { OfficeConflictResponse, OfficeContentMap, OfficeDocumentResponse, OfficeKind, OfficeSaveResponse } from "@/lib/office/types";
import type { OfficeDocumentState, OfficeSaveState } from "./office-types";

/** Quiet time after the last change before saving. */
const SAVE_DELAY_MS = 1200;
/** How often an idle editor checks whether someone else saved a newer revision. */
const POLL_MS = 10_000;

/**
 * Loads a document, keeps the local copy, saves it shortly after every change and picks up saves made by other
 * people while nothing is pending locally. A save that races another person's save comes back as a conflict;
 * the caller then offers to reload or to overwrite.
 */
export function useOfficeDocument<K extends OfficeKind>(id: string) {
	const [state, setState] = useState<OfficeDocumentState<K>>({ status: "loading" });
	const [saveState, setSaveState] = useState<OfficeSaveState>("saved");
	const [saveError, setSaveError] = useState<string | null>(null);
	const [contentKey, setContentKey] = useState(0);
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

	// The latest local content and the revision it is based on, read by the save loop without re-rendering.
	const contentRef = useRef<OfficeContentMap[K] | null>(null);
	const revisionRef = useRef(0);
	const updatedAtRef = useRef<string | null>(null);
	const dirtyRef = useRef(false);
	const savingRef = useRef<Promise<void> | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const canEditRef = useRef(false);
	const conflictRef = useRef(false);
	const saveRef = useRef<() => Promise<void>>(async () => {});

	const schedule = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => { timerRef.current = null; void saveRef.current(); }, SAVE_DELAY_MS);
	}, []);

	const applyLoaded = useCallback((data: OfficeDocumentResponse<K>) => {
		contentRef.current = data.content;
		revisionRef.current = data.revision;
		updatedAtRef.current = data.item.updatedAt;
		dirtyRef.current = false;
		conflictRef.current = false;
		const editable = canEditDrive(data.role) && !data.item.trashedAt;
		canEditRef.current = editable;
		setState({ status: "ready", item: data.item, kind: data.kind, role: data.role, revision: data.revision, content: data.content });
		setSaveState(editable ? "saved" : "readonly");
		setSaveError(null);
		setContentKey((key) => key + 1);
	}, []);

	const fetchDocument = useCallback(async (): Promise<OfficeDocumentResponse<K> | "missing"> => {
		const response = await authFetch(`/api/office/${encodeURIComponent(id)}`, { cache: "no-store" });
		if (response.status === 404) return "missing";
		const data = await response.json().catch(() => ({})) as OfficeDocumentResponse<K> & { error?: string };
		if (!response.ok) throw new Error(data.error || "load");
		return data;
	}, [id]);

	const load = useCallback(() => fetchDocument()
		.then((data) => {
			if (data === "missing") setState({ status: "missing" });
			else applyLoaded(data);
		})
		.catch((error: unknown) => setState({ status: "error", message: error instanceof Error ? error.message : "load" })), [fetchDocument, applyLoaded]);

	// The first render already shows the loading state, so the effect only starts the request.
	useEffect(() => { void load(); }, [load]);

	const runSave = useCallback(async (): Promise<void> => {
		if (!canEditRef.current || conflictRef.current || !dirtyRef.current || !contentRef.current) return;
		const content = contentRef.current;
		dirtyRef.current = false;
		setSaveState("saving");
		try {
			const response = await authFetch(`/api/office/${encodeURIComponent(id)}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content, baseRevision: revisionRef.current }),
			});
			if (response.status === 409) {
				const data = await response.json().catch(() => ({})) as Partial<OfficeConflictResponse>;
				conflictRef.current = true;
				dirtyRef.current = true;
				setSaveError(data.error ?? null);
				setSaveState("conflict");
				return;
			}
			const data = await response.json().catch(() => ({})) as Partial<OfficeSaveResponse> & { error?: string };
			if (!response.ok || typeof data.revision !== "number") {
				dirtyRef.current = true;
				setSaveError(data.error ?? null);
				setSaveState("error");
				return;
			}
			revisionRef.current = data.revision;
			updatedAtRef.current = data.updatedAt ?? updatedAtRef.current;
			setLastSavedAt(new Date());
			setSaveError(null);
			setState((current) => current.status === "ready"
				? { ...current, revision: data.revision!, item: { ...current.item, size: data.size ?? current.item.size, updatedAt: data.updatedAt ?? current.item.updatedAt } }
				: current);
			// Changes made while this save was in flight go out next.
			if (dirtyRef.current) setSaveState("pending");
			else setSaveState("saved");
		} catch {
			dirtyRef.current = true;
			setSaveState("error");
		}
	}, [id]);

	const save = useCallback(async () => {
		if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
		while (savingRef.current) await savingRef.current;
		const promise = runSave().finally(() => { savingRef.current = null; });
		savingRef.current = promise;
		await promise;
		if (dirtyRef.current && !conflictRef.current && canEditRef.current) schedule();
	}, [runSave, schedule]);
	useEffect(() => { saveRef.current = save; }, [save]);

	/** Called by the editor on every change. */
	const setContent = useCallback((next: OfficeContentMap[K]) => {
		if (!canEditRef.current) return;
		contentRef.current = next;
		dirtyRef.current = true;
		setState((current) => (current.status === "ready" ? { ...current, content: next } : current));
		if (!conflictRef.current) {
			setSaveState((current) => (current === "saving" ? current : "pending"));
			schedule();
		}
	}, [schedule]);

	/** Conflict resolution: keep my version and write it over the newer one. */
	const overwrite = useCallback(async () => {
		try {
			const data = await fetchDocument();
			if (data === "missing") { setState({ status: "missing" }); return; }
			revisionRef.current = data.revision;
			conflictRef.current = false;
			dirtyRef.current = true;
			await save();
		} catch {
			setSaveState("error");
		}
	}, [fetchDocument, save]);

	/** Conflict resolution: drop local changes and open the latest saved version. */
	const reload = useCallback(async () => {
		if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
		dirtyRef.current = false;
		conflictRef.current = false;
		setState({ status: "loading" });
		await load();
	}, [load]);

	// Pick up other people's saves while idle, and notice when access was revoked or the role changed. Only the
	// cheap item metadata is polled; the content is fetched when its modification time moved.
	useEffect(() => {
		if (state.status !== "ready") return;
		const timer = setInterval(async () => {
			if (document.hidden || savingRef.current) return;
			try {
				const response = await authFetch(`/api/office/${encodeURIComponent(id)}?meta=1`, { cache: "no-store", redirectOnUnauthorized: false });
				if (response.status === 404) { setState({ status: "missing" }); return; }
				if (!response.ok) return;
				const meta = await response.json() as { updatedAt: string; role: DriveRole };
				const editable = canEditDrive(meta.role);
				if (editable !== canEditRef.current) {
					// Downgraded to viewer (or upgraded to editor) while the file was open.
					canEditRef.current = editable;
					if (!editable && timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
					setState((current) => (current.status === "ready" ? { ...current, role: meta.role } : current));
					setSaveState(editable ? (dirtyRef.current ? "pending" : "saved") : "readonly");
					if (!editable) dirtyRef.current = false;
				}
				if (dirtyRef.current || conflictRef.current || meta.updatedAt === updatedAtRef.current) return;
				const data = await fetchDocument();
				if (data === "missing") { setState({ status: "missing" }); return; }
				if (dirtyRef.current || savingRef.current) return;
				if (data.revision !== revisionRef.current) applyLoaded(data);
				else {
					// Only the name changed.
					updatedAtRef.current = data.item.updatedAt;
					setState((current) => (current.status === "ready" ? { ...current, item: data.item, role: data.role } : current));
				}
			} catch { /* offline: try again next tick */ }
		}, POLL_MS);
		return () => clearInterval(timer);
	}, [state.status, id, fetchDocument, applyLoaded]);

	// Flush on tab hide and warn before leaving with unsaved changes.
	useEffect(() => {
		const onHide = () => { if (document.hidden && dirtyRef.current) void save(); };
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!dirtyRef.current && !savingRef.current) return;
			void save();
			event.preventDefault();
		};
		document.addEventListener("visibilitychange", onHide);
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => {
			document.removeEventListener("visibilitychange", onHide);
			window.removeEventListener("beforeunload", onBeforeUnload);
		};
	}, [save]);

	useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

	/** Renames the file through Drive. */
	const rename = useCallback(async (name: string): Promise<boolean> => {
		const response = await authFetch(`/api/drive/items/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
		if (!response.ok) return false;
		const data = await response.json() as { item: DriveItemDto };
		updatedAtRef.current = data.item.updatedAt;
		setState((current) => (current.status === "ready" ? { ...current, item: { ...current.item, name: data.item.name, updatedAt: data.item.updatedAt } } : current));
		return true;
	}, [id]);

	/** Re-reads sharing details (e.g. after the share dialog changed them) without touching the content. */
	const refreshItem = useCallback(async () => {
		try {
			const data = await fetchDocument();
			if (data === "missing") return;
			updatedAtRef.current = data.item.updatedAt;
			setState((current) => (current.status === "ready" ? { ...current, item: data.item, role: data.role } : current));
		} catch { /* keep what is shown */ }
	}, [fetchDocument]);

	return { state, saveState, saveError, contentKey, lastSavedAt, setContent, save, overwrite, reload, rename, refreshItem };
}

export type OfficeDocumentController<K extends OfficeKind> = ReturnType<typeof useOfficeDocument<K>>;
