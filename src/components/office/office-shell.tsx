"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import toast from "react-hot-toast";
import clsx from "clsx";
import { Check, ChevronRight, Cloud, Copy, Download, Eye, FolderInput, Globe2, LockKeyhole, Pencil, Plus, Printer, Share2, Trash2, Users } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { MailboxSelector } from "@/components/mailbox-selector";
import { Tooltip } from "@/components/ui/tooltip";
import { confirmDestructive } from "@/components/ui/confirm-dialog";
import { DriveShareDialog } from "@/app/(drive)/drive-share-dialog";
import { canEditDrive } from "@/lib/drive/utils";
import type { DriveItemDto, DriveRole } from "@/lib/drive/types";
import type { OfficeKind } from "@/lib/office/types";
import { officeEditorPath } from "@/lib/office/utils";
import { officeApp } from "./office-apps";
import { copyOfficeDocument, createOfficeDocument, trashOfficeDocument } from "./office-requests";
import type { OfficeSaveState } from "./office-types";
import type { OfficeDocumentController } from "./use-office-document";

const menuItemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[disabled]:cursor-default data-[disabled]:opacity-50";

function SaveStatus({ state, onRetry }: { state: OfficeSaveState; onRetry: () => void }) {
	const { t } = useLanguage();
	if (state === "readonly") return null;
	if (state === "error") return <button type="button" onClick={onRetry} className="text-xs text-red-600 hover:underline">{t("office.saveFailedRetry")}</button>;
	if (state === "conflict") return <span className="text-xs text-amber-700">{t("office.conflictShort")}</span>;
	const saving = state === "saving" || state === "pending";
	return (
		<span className="flex items-center gap-1 text-xs text-neutral-500" aria-live="polite">
			{saving ? <Cloud size={14} /> : <Check size={14} />}
			{saving ? t("office.saving") : t("office.allChangesSaved")}
		</span>
	);
}

function AccessBadge({ role, item }: { role: DriveRole; item: DriveItemDto }) {
	const { t } = useLanguage();
	if (role === "owner") {
		const Icon = item.linkToken ? Globe2 : item.shared ? Users : LockKeyhole;
		const label = item.linkToken ? t("office.accessLink") : item.shared ? t("office.accessShared") : t("office.accessPrivate");
		return <Tooltip label={label}><span className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500"><Icon size={15} aria-label={label} /></span></Tooltip>;
	}
	return (
		<span className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
			{role === "edit" ? <Pencil size={12} /> : <Eye size={12} />}
			{role === "edit" ? t("office.roleEditor") : t("office.roleViewer")}
		</span>
	);
}

/**
 * The header every editor shares: app icon, editable title, File menu, save status, access badge and Share.
 * Hidden when printing so only the document prints.
 */
export function OfficeShell<K extends OfficeKind>({ kind, controller, getContent }: { kind: K; controller: OfficeDocumentController<K>; getContent: () => unknown }) {
	const { t } = useLanguage();
	const router = useRouter();
	const app = officeApp(kind);
	const { state, saveState } = controller;
	const [sharing, setSharing] = useState<DriveItemDto | null>(null);
	const [title, setTitle] = useState<string | null>(null);
	if (state.status !== "ready") return null;
	const { item, role } = state;
	const canEdit = canEditDrive(role) && !item.trashedAt;
	const AppIcon = app.icon;
	const shownTitle = title ?? item.name;

	async function commitTitle() {
		const next = (title ?? "").trim();
		setTitle(null);
		if (!next || next === item.name) return;
		if (!(await controller.rename(next))) toast.error(t("office.renameFailed"));
	}

	async function newDocument() {
		try {
			const created = await createOfficeDocument(kind);
			window.open(officeEditorPath(kind, created.id), "_blank", "noopener");
		} catch { toast.error(t("office.createFailed")); }
	}

	async function makeCopy() {
		try {
			await controller.save();
			const copy = await copyOfficeDocument(item.id, t("office.copyOf", { name: item.name }));
			toast.success(t("office.copyCreated"));
			router.push(officeEditorPath(kind, copy.id));
		} catch { toast.error(t("office.copyFailed")); }
	}

	async function moveToTrash() {
		if (!(await confirmDestructive(t("office.confirmTrash", { name: item.name })))) return;
		try {
			await controller.save();
			await trashOfficeDocument(item.id);
			toast.success(t("office.trashed"));
			router.push(app.path);
		} catch { toast.error(t("office.trashFailed")); }
	}

	const driveHref = role === "owner" ? (item.parentId ? `/drive?folder=${encodeURIComponent(item.parentId)}` : "/drive") : "/drive?view=shared";

	return (
		<header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-3 py-2 print:hidden">
			<Link href={app.path} aria-label={t(app.nameKey)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-neutral-100">
				<AppIcon size={28} style={{ color: app.color }} />
			</Link>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-2">
					<input
						value={shownTitle}
						readOnly={!canEdit}
						onChange={(event) => setTitle(event.target.value)}
						onFocus={(event) => { if (canEdit) { setTitle(item.name); event.currentTarget.select(); } }}
						onBlur={() => void commitTitle()}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
							if (event.key === "Escape") { setTitle(null); event.currentTarget.blur(); }
						}}
						aria-label={t("office.title")}
						maxLength={255}
						size={Math.max(8, Math.min(60, shownTitle.length + 1))}
						className="min-w-0 max-w-full truncate rounded-md border border-transparent px-1.5 py-0.5 text-lg text-neutral-900 outline-none hover:border-neutral-300 focus:border-blue-500 read-only:hover:border-transparent"
					/>
					<AccessBadge role={role} item={item} />
					<SaveStatus state={saveState} onRetry={() => void controller.save()} />
				</div>
				<nav className="flex items-center gap-0.5 text-sm" aria-label={t("office.menu")}>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger className="rounded-md px-2 py-0.5 text-neutral-700 outline-none hover:bg-neutral-100 data-[state=open]:bg-neutral-100">{t("office.fileMenu")}</DropdownMenu.Trigger>
						<DropdownMenu.Portal>
							<DropdownMenu.Content align="start" sideOffset={4} className="z-[200] min-w-60 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
								<DropdownMenu.Item className={menuItemClass} onSelect={() => void newDocument()}><Plus size={16} />{t(app.newKey)}</DropdownMenu.Item>
								<DropdownMenu.Item className={menuItemClass} onSelect={() => void makeCopy()}><Copy size={16} />{t("office.makeCopy")}</DropdownMenu.Item>
								<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
								{app.client.exports.length > 0 && (
									<DropdownMenu.Sub>
										<DropdownMenu.SubTrigger className={menuItemClass}><Download size={16} /><span className="flex-1">{t("office.download")}</span><ChevronRight size={14} /></DropdownMenu.SubTrigger>
										<DropdownMenu.Portal>
											<DropdownMenu.SubContent sideOffset={6} className="z-[201] min-w-56 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
												{app.client.exports.map((format) => (
													<DropdownMenu.Item key={format.id} className={menuItemClass} onSelect={() => {
														const content = getContent();
														void Promise.resolve(format.run(content as never, item.name)).catch(() => toast.error(t("office.exportFailed")));
													}}>{t(format.labelKey)}</DropdownMenu.Item>
												))}
											</DropdownMenu.SubContent>
										</DropdownMenu.Portal>
									</DropdownMenu.Sub>
								)}
								<DropdownMenu.Item className={menuItemClass} onSelect={() => setTimeout(() => window.print(), 50)}><Printer size={16} />{t("office.print")}</DropdownMenu.Item>
								<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
								{role === "owner" && <DropdownMenu.Item className={menuItemClass} onSelect={() => setSharing(item)}><Share2 size={16} />{t("office.share")}</DropdownMenu.Item>}
								<DropdownMenu.Item asChild className={menuItemClass}><Link href={driveHref}><FolderInput size={16} />{t("office.showInDrive")}</Link></DropdownMenu.Item>
								{canEdit && <DropdownMenu.Item className={clsx(menuItemClass, "text-red-600")} onSelect={() => void moveToTrash()}><Trash2 size={16} />{t("office.moveToTrash")}</DropdownMenu.Item>}
							</DropdownMenu.Content>
						</DropdownMenu.Portal>
					</DropdownMenu.Root>
				</nav>
			</div>
			{role === "owner" ? (
				<button type="button" onClick={() => setSharing(item)} className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-blue-100 px-5 text-sm font-medium text-blue-900 hover:bg-blue-200">
					{item.shared ? <Users size={16} /> : <LockKeyhole size={16} />}{t("office.share")}
				</button>
			) : (
				<Tooltip label={t("office.ownerManagesSharing", { name: item.ownerName })}>
					<span className="hidden h-10 shrink-0 items-center gap-2 rounded-full bg-neutral-100 px-4 text-sm text-neutral-600 sm:flex"><Users size={16} />{item.ownerName}</span>
				</Tooltip>
			)}
			<div className="shrink-0"><MailboxSelector /></div>
			<DriveShareDialog item={sharing} onClose={() => setSharing(null)} onChanged={() => void controller.refreshItem()} />
		</header>
	);
}
