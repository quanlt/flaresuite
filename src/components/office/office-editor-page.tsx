"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toaster } from "react-hot-toast";
import { AlertTriangle, Loader2 } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { canEditDrive } from "@/lib/drive/utils";
import type { OfficeContentMap, OfficeKind } from "@/lib/office/types";
import { officeEditorPath } from "@/lib/office/utils";
import { officeApp } from "./office-apps";
import { OfficeShell } from "./office-shell";
import { useOfficeDocument } from "./use-office-document";

/** One open document: shared header, conflict and error banners, and the app's editor. */
export function OfficeEditorPage<K extends OfficeKind>({ id, kind }: { id: string; kind: K }) {
	const { t } = useLanguage();
	const router = useRouter();
	const app = officeApp(kind);
	const controller = useOfficeDocument<K>(id);
	const { state, saveState, contentKey } = controller;
	const contentRef = useRef<OfficeContentMap[K] | null>(null);
	useEffect(() => { if (state.status === "ready") contentRef.current = state.content; }, [state]);

	// A sheet opened under /docs (an old link, a typo) moves to its own app.
	const wrongApp = state.status === "ready" && state.kind !== kind ? state.kind : null;
	useEffect(() => { if (wrongApp) router.replace(officeEditorPath(wrongApp, id)); }, [wrongApp, id, router]);

	// Tab title follows the document name.
	const name = state.status === "ready" ? state.item.name : null;
	useEffect(() => {
		if (!name) return;
		const previous = document.title;
		document.title = `${name} - ${t(app.nameKey)}`;
		return () => { document.title = previous; };
	}, [name, app.nameKey, t]);

	if (state.status === "loading" || wrongApp) {
		return <div className="flex h-dvh items-center justify-center bg-[#f8f9fa]" aria-busy="true"><Loader2 size={28} className="animate-spin text-neutral-400" /></div>;
	}
	if (state.status === "missing" || state.status === "error") {
		return (
			<div className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#f8f9fa] p-6 text-center">
				<AlertTriangle size={32} className="text-neutral-400" />
				<p className="max-w-md text-neutral-700">{state.status === "missing" ? t("office.notFound") : t("office.loadFailed")}</p>
				<div className="flex gap-2">
					{state.status === "error" && <Button variant="outline" onClick={() => void controller.reload()}>{t("office.tryAgain")}</Button>}
					<Button asChild><Link href={app.path}>{t("office.backToApp", { app: t(app.nameKey) })}</Link></Button>
				</div>
			</div>
		);
	}

	const Editor = app.Editor;
	const readOnly = !canEditDrive(state.role) || !!state.item.trashedAt || saveState === "readonly";

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-[#f8f9fa] print:block print:h-auto print:overflow-visible print:bg-white">
			<Toaster position="bottom-left" containerClassName="text-sm print:hidden" />
			<OfficeShell kind={kind} controller={controller} getContent={() => contentRef.current} />
			{saveState === "conflict" && (
				<div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
					<AlertTriangle size={16} className="shrink-0" />
					<span className="min-w-0 flex-1">{t("office.conflict")}</span>
					<Button size="sm" variant="outline" onClick={() => void controller.reload()}>{t("office.conflictReload")}</Button>
					<Button size="sm" onClick={() => void controller.overwrite()}>{t("office.conflictOverwrite")}</Button>
				</div>
			)}
			{readOnly && (
				<div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-1.5 text-xs text-neutral-600 print:hidden">
					{state.item.trashedAt ? t("office.inTrash") : t("office.viewOnlyNotice", { name: state.item.ownerName })}
				</div>
			)}
			<div className="relative min-h-0 flex-1 print:static print:min-h-0">
				<Editor content={state.content} contentKey={contentKey} onChange={controller.setContent} readOnly={readOnly} name={state.item.name} />
			</div>
		</div>
	);
}
