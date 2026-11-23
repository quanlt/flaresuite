"use client";

import { useEffect, useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import toast, { Toaster } from "react-hot-toast";
import { AlertTriangle, ChevronRight, Download, Eye, Globe2, Loader2, Pencil, Printer } from "@/components/icons";
import { useBranding } from "@/components/branding-provider";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import type { OfficeContentMap, OfficeKind } from "@/lib/office/types";
import { officeApp } from "./office-apps";
import { OfficeMenuButton, officeMenuItemClass, OfficeMenusProvider, useRegisteredOfficeMenus } from "./office-menus";
import { SaveStatus } from "./office-shell";
import { useOfficeDocument } from "./use-office-document";

/**
 * A Docs, Sheets or Slides file opened from an "anyone with the link" URL. Nobody needs an account: a view link
 * shows the document read-only, an edit link opens the full editor and saves through the link.
 */
export function OfficePublicViewer<K extends OfficeKind>(props: { kind: K; token: string; itemId: string }) {
	return <OfficeMenusProvider><LinkDocument {...props} /></OfficeMenusProvider>;
}

function LinkDocument<K extends OfficeKind>({ kind, token, itemId }: { kind: K; token: string; itemId: string }) {
	const { t } = useLanguage();
	const { appName } = useBranding();
	const app = officeApp(kind);
	const controller = useOfficeDocument<K>(itemId, { token });
	const { state, saveState, contentKey } = controller;
	const menus = useRegisteredOfficeMenus();
	const contentRef = useRef<OfficeContentMap[K] | null>(null);
	useEffect(() => { if (state.status === "ready") contentRef.current = state.content; }, [state]);

	const name = state.status === "ready" ? state.item.name : null;
	useEffect(() => { if (name) document.title = `${name} - ${t(app.nameKey)}`; }, [name, app.nameKey, t]);

	if (state.status === "loading") return <div className="flex h-dvh items-center justify-center bg-[#f8f9fa]" aria-busy="true"><Loader2 size={28} className="animate-spin text-neutral-400" /></div>;
	if (state.status !== "ready") return <p className="p-10 text-center text-sm text-neutral-600">{state.status === "missing" ? t("drive.publicNotFound") : t("office.loadFailed")}</p>;

	const AppIcon = app.icon;
	const Editor = app.Editor;
	const editable = state.role === "edit" && saveState !== "readonly";
	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-[#f8f9fa] print:block print:h-auto print:overflow-visible print:bg-white">
			<Toaster position="bottom-left" containerClassName="text-sm print:hidden" />
			<header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-3 py-2 print:hidden">
				<span className="flex h-10 w-10 shrink-0 items-center justify-center"><AppIcon size={28} style={{ color: app.color }} /></span>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<h1 className="min-w-0 truncate px-1.5 text-lg text-neutral-900">{state.item.name}</h1>
						{editable && <SaveStatus state={saveState} onRetry={() => void controller.save()} />}
					</div>
					<nav className="flex items-center gap-0.5 overflow-x-auto text-sm" aria-label={t("office.menu")}>
						<DropdownMenu.Root modal={false}>
							<DropdownMenu.Trigger className="rounded-md px-2 py-0.5 text-neutral-700 outline-none hover:bg-neutral-100 data-[state=open]:bg-neutral-100">{t("office.fileMenu")}</DropdownMenu.Trigger>
							<DropdownMenu.Portal>
								<DropdownMenu.Content align="start" sideOffset={4} className="z-[200] min-w-60 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl" onCloseAutoFocus={(event) => event.preventDefault()}>
									{app.client.exports.length > 0 && (
										<DropdownMenu.Sub>
											<DropdownMenu.SubTrigger className={officeMenuItemClass}><Download size={16} /><span className="flex-1">{t("office.download")}</span><ChevronRight size={14} /></DropdownMenu.SubTrigger>
											<DropdownMenu.Portal>
												<DropdownMenu.SubContent sideOffset={6} className="z-[201] min-w-56 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
													{app.client.exports.map((format) => (
														<DropdownMenu.Item key={format.id} className={officeMenuItemClass} onSelect={() => {
															void Promise.resolve(format.run(contentRef.current as never, state.item.name)).catch(() => toast.error(t("office.exportFailed")));
														}}>{t(format.labelKey)}</DropdownMenu.Item>
													))}
												</DropdownMenu.SubContent>
											</DropdownMenu.Portal>
										</DropdownMenu.Sub>
									)}
									<DropdownMenu.Item className={officeMenuItemClass} onSelect={() => setTimeout(() => window.print(), 50)}><Printer size={16} />{t("office.print")}</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Portal>
						</DropdownMenu.Root>
						{menus.map((menu) => <OfficeMenuButton key={menu.id} menu={menu} />)}
					</nav>
				</div>
				<span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs text-neutral-600 sm:flex" data-testid="link-access">
					<Globe2 size={14} />{editable ? <><Pencil size={12} />{t("office.linkCanEdit")}</> : <><Eye size={12} />{t("office.linkCanView")}</>}
				</span>
			</header>
			{saveState === "conflict" && (
				<div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
					<AlertTriangle size={16} className="shrink-0" />
					<span className="min-w-0 flex-1">{t("office.conflict")}</span>
					<Button size="sm" variant="outline" onClick={() => void controller.reload()}>{t("office.conflictReload")}</Button>
					<Button size="sm" onClick={() => void controller.overwrite()}>{t("office.conflictOverwrite")}</Button>
				</div>
			)}
			<div className="relative min-h-0 flex-1 print:static">
				<Editor content={state.content} contentKey={contentKey} onChange={controller.setContent} readOnly={!editable} name={state.item.name} />
			</div>
			<footer className="shrink-0 border-t border-neutral-200 bg-white px-4 py-1 text-center text-[11px] text-neutral-500 print:hidden">{t("office.sharedLinkFooter", { appName })}</footer>
		</div>
	);
}
