"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import toast, { Toaster } from "react-hot-toast";
import clsx from "clsx";
import { Copy, ExternalLink, Globe2, Loader2, MoreVertical, Pencil, Plus, Search, Share2, Trash2, Upload, Users } from "@/components/icons";
import { useBranding } from "@/components/branding-provider";
import { useLanguage } from "@/components/language-provider";
import { MailboxSelector } from "@/components/mailbox-selector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { confirmDestructive } from "@/components/ui/confirm-dialog";
import { DriveShareDialog } from "@/app/(drive)/drive-share-dialog";
import { DriveOwnerAvatar } from "@/app/(drive)/drive-owner-avatar";
import { authFetch } from "@/lib/auth/client";
import { canEditDrive } from "@/lib/drive/utils";
import type { DriveItemDto } from "@/lib/drive/types";
import type { OfficeKind, OfficeListResponse } from "@/lib/office/types";
import { officeEditorPath } from "@/lib/office/utils";
import { officeApp } from "./office-apps";
import { copyOfficeDocument, createOfficeDocument, trashOfficeDocument } from "./office-requests";

type Ownership = "any" | "me" | "shared";

const menuItemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100";
const dateFormat = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function formatModified(iso: string): string {
	const date = new Date(iso);
	const today = new Date();
	return date.toDateString() === today.toDateString() ? timeFormat.format(date) : dateFormat.format(date);
}

/** Home of Docs, Sheets or Slides: start something new from blank, a template or an import, and reopen recent files. */
export function OfficeHome<K extends OfficeKind>({ kind }: { kind: K }) {
	const { t } = useLanguage();
	const router = useRouter();
	const app = officeApp(kind);
	const AppIcon = app.icon;
	const [items, setItems] = useState<DriveItemDto[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [query, setQuery] = useState("");
	const [ownership, setOwnership] = useState<Ownership>("any");
	const [creating, setCreating] = useState<string | null>(null);
	const [sharing, setSharing] = useState<DriveItemDto | null>(null);
	const [renaming, setRenaming] = useState<{ item: DriveItemDto; value: string } | null>(null);
	const fileInput = useRef<HTMLInputElement | null>(null);
	const { appName } = useBranding();
	const pageTitle = `${t(app.nameKey)} - ${appName}`;
	useEffect(() => { document.title = pageTitle; }, [pageTitle]);

	const load = useCallback(() => authFetch(`/api/office?kind=${kind}`, { cache: "no-store" })
		.then(async (response) => {
			if (!response.ok) throw new Error();
			const data = await response.json() as OfficeListResponse;
			setItems(data.items);
			setFailed(false);
		})
		.catch(() => setFailed(true)), [kind]);
	useEffect(() => { void load(); }, [load]);

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return (items ?? []).filter((item) => {
			if (ownership === "me" && item.role !== "owner") return false;
			if (ownership === "shared" && item.role === "owner") return false;
			return !needle || item.name.toLowerCase().includes(needle);
		});
	}, [items, query, ownership]);

	async function create(key: string, make: () => Promise<DriveItemDto>) {
		if (creating) return;
		setCreating(key);
		try {
			const item = await make();
			router.push(officeEditorPath(kind, item.id));
		} catch (error) {
			toast.error(error instanceof Error && error.message && error.message !== "request" ? error.message : t("office.createFailed"));
			setCreating(null);
		}
	}

	async function importFile(file: File) {
		if (!app.client.importFile) return;
		await create("import", async () => {
			const imported = await app.client.importFile!(file);
			return createOfficeDocument(kind, { name: imported.name, content: imported.content });
		});
	}

	async function act(run: () => Promise<unknown>, success?: string) {
		try {
			await run();
			if (success) toast.success(success);
			await load();
		} catch {
			toast.error(t("office.actionFailed"));
		}
	}

	async function submitRename(event: React.FormEvent) {
		event.preventDefault();
		if (!renaming || !renaming.value.trim()) return;
		const { item, value } = renaming;
		await act(async () => {
			const response = await authFetch(`/api/drive/items/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: value }) });
			if (!response.ok) throw new Error();
		});
		setRenaming(null);
	}

	const tiles = [
		{ id: "blank", label: t(app.blankKey), make: () => createOfficeDocument(kind) },
		...app.client.templates.map((template) => ({ id: template.id, label: t(template.labelKey), make: () => createOfficeDocument(kind, { name: t(template.labelKey), content: template.create() }) })),
	];

	return (
		<div className="flex min-h-dvh flex-col bg-white">
			<Toaster position="bottom-left" containerClassName="text-sm" />
			<header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4">
				<Link href={app.path} className="flex shrink-0 items-center gap-2">
					<AppIcon size={30} style={{ color: app.color }} />
					<span className="text-xl text-neutral-700 max-sm:hidden">{t(app.nameKey)}</span>
				</Link>
				<label className="mx-auto flex h-11 w-full max-w-2xl items-center gap-3 rounded-full bg-neutral-100 px-4 focus-within:bg-white focus-within:shadow-md">
					<Search size={18} className="shrink-0 text-neutral-500" />
					<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("office.search")} aria-label={t("office.search")} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
				</label>
				<MailboxSelector />
			</header>

			<section className="shrink-0 bg-[#f1f3f4] px-4 py-6">
				<div className="mx-auto max-w-5xl">
					<div className="mb-3 flex items-center justify-between gap-3">
						<h2 className="text-base text-neutral-800">{t(app.newKey)}</h2>
						{app.client.importFile && (
							<>
								<input ref={fileInput} type="file" hidden accept={app.client.importAccept} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
								<Button variant="outline" size="sm" disabled={!!creating} onClick={() => fileInput.current?.click()}>
									{creating === "import" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{t("office.import")}
								</Button>
							</>
						)}
					</div>
					<div className="flex gap-4 overflow-x-auto pb-1">
						{tiles.map((tile) => (
							<button key={tile.id} type="button" disabled={!!creating} onClick={() => void create(tile.id, tile.make)} className="group w-36 shrink-0 text-left disabled:opacity-60">
								<span className="flex aspect-[3/4] items-center justify-center rounded-md border border-neutral-300 bg-white transition-colors group-hover:border-blue-500" style={kind === "presentation" ? { aspectRatio: "16 / 10" } : undefined}>
									{creating === tile.id ? <Loader2 size={24} className="animate-spin text-neutral-400" />
										: tile.id === "blank" ? <Plus size={40} style={{ color: app.color }} />
										: <AppIcon size={32} style={{ color: app.color, opacity: 0.6 }} />}
								</span>
								<span className="mt-2 block truncate text-sm text-neutral-800">{tile.label}</span>
							</button>
						))}
					</div>
				</div>
			</section>

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
				<div className="mb-2 flex items-center justify-between gap-3">
					<h2 className="text-base text-neutral-800">{t("office.recent")}</h2>
					<div role="radiogroup" aria-label={t("office.ownership")} className="flex rounded-full border border-neutral-200 p-0.5 text-xs">
						{(["any", "me", "shared"] as const).map((value) => (
							<button key={value} type="button" role="radio" aria-checked={ownership === value} onClick={() => setOwnership(value)} className={clsx("rounded-full px-3 py-1", ownership === value ? "bg-blue-100 text-blue-900" : "text-neutral-600 hover:bg-neutral-100")}>
								{value === "any" ? t("office.ownedByAnyone") : value === "me" ? t("office.ownedByMe") : t("office.sharedWithMe")}
							</button>
						))}
					</div>
				</div>
				<div className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-x-4 border-b border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-500 md:grid-cols-[minmax(0,1fr)_10rem_8rem_2.5rem]">
					<span>{t("office.name")}</span>
					<span className="hidden md:block">{t("office.owner")}</span>
					<span className="hidden md:block">{t("office.lastModified")}</span>
					<span />
				</div>
				{failed ? <p className="p-10 text-center text-sm text-neutral-500">{t("office.listFailed")}</p>
					: items === null ? Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-3 px-3 py-3.5"><Skeleton className="h-5 w-5" /><Skeleton className="h-4 w-1/2" /></div>)
					: visible.length === 0 ? <p className="p-12 text-center text-sm text-neutral-500">{query ? t("office.noMatches") : t("office.empty")}</p>
					: (
						<ul>
							{visible.map((item) => {
								const canEdit = canEditDrive(item.role);
								return (
									<li key={item.id} className="group grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-4 rounded-lg px-3 text-sm hover:bg-neutral-50 md:grid-cols-[minmax(0,1fr)_10rem_8rem_2.5rem]">
										<Link href={officeEditorPath(kind, item.id)} className="flex min-w-0 items-center gap-3 py-3">
											<AppIcon size={20} className="shrink-0" style={{ color: app.color }} />
											<span className="truncate text-neutral-900">{item.name}</span>
											{item.role === "owner" && item.linkToken && <Globe2 size={13} className="shrink-0 text-neutral-500" aria-label={t("office.accessLink")} />}
											{item.role === "owner" && !item.linkToken && item.shared && <Users size={13} className="shrink-0 text-neutral-500" aria-label={t("office.accessShared")} />}
										</Link>
										<span className="hidden min-w-0 items-center gap-2 text-neutral-600 md:flex"><DriveOwnerAvatar item={item} /><span className="truncate">{item.role === "owner" ? t("office.me") : item.ownerName}</span></span>
										<span className="hidden text-neutral-600 md:block">{formatModified(item.updatedAt)}</span>
										<DropdownMenu.Root>
											<DropdownMenu.Trigger asChild>
												<button type="button" aria-label={t("office.actions")} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-200"><MoreVertical size={16} /></button>
											</DropdownMenu.Trigger>
											<DropdownMenu.Portal>
												<DropdownMenu.Content align="end" sideOffset={4} className="z-[200] min-w-52 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
													<DropdownMenu.Item asChild className={menuItemClass}><a href={officeEditorPath(kind, item.id)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{t("office.openNewTab")}</a></DropdownMenu.Item>
													{canEdit && <DropdownMenu.Item className={menuItemClass} onSelect={() => setRenaming({ item, value: item.name })}><Pencil size={16} />{t("office.rename")}</DropdownMenu.Item>}
													{item.role === "owner" && <DropdownMenu.Item className={menuItemClass} onSelect={() => setSharing(item)}><Share2 size={16} />{t("office.share")}</DropdownMenu.Item>}
													<DropdownMenu.Item className={menuItemClass} onSelect={() => void act(() => copyOfficeDocument(item.id, t("office.copyOf", { name: item.name })), t("office.copyCreated"))}><Copy size={16} />{t("office.makeCopy")}</DropdownMenu.Item>
													{canEdit && <DropdownMenu.Item className={clsx(menuItemClass, "text-red-600")} onSelect={async () => { if (await confirmDestructive(t("office.confirmTrash", { name: item.name }))) void act(() => trashOfficeDocument(item.id), t("office.trashed")); }}><Trash2 size={16} />{t("office.moveToTrash")}</DropdownMenu.Item>}
												</DropdownMenu.Content>
											</DropdownMenu.Portal>
										</DropdownMenu.Root>
									</li>
								);
							})}
						</ul>
					)}
			</main>

			<Dialog open={!!renaming} onOpenChange={(open) => { if (!open) setRenaming(null); }}>
				<DialogContent>
					<DialogHeader><DialogTitle>{t("office.rename")}</DialogTitle></DialogHeader>
					<form onSubmit={submitRename} className="space-y-5">
						<Input autoFocus value={renaming?.value ?? ""} onChange={(event) => setRenaming((current) => current && { ...current, value: event.target.value })} onFocus={(event) => event.currentTarget.select()} aria-label={t("office.name")} maxLength={255} />
						<div className="flex justify-end gap-2">
							<Button type="button" variant="ghost" onClick={() => setRenaming(null)}>{t("common.cancel")}</Button>
							<Button type="submit" disabled={!renaming?.value.trim()}>{t("office.save")}</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
			<DriveShareDialog item={sharing} onClose={() => setSharing(null)} onChanged={() => void load()} />
		</div>
	);
}
