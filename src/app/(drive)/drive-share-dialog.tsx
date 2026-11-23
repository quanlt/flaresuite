"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Copy, Globe2, LockKeyhole, X } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { authFetch } from "@/lib/auth/client";
import type { DriveItemDto, DriveShareDto, DriveShareRole } from "@/lib/drive/types";
import { Select } from "@/components/ui/select";
import { officeKindFromContentType } from "@/lib/office/utils";

const selectClass = "h-10 text-sm";

export function DriveShareDialog({ item, onClose, onChanged }: { item: DriveItemDto | null; onClose: () => void; onChanged: () => void }) {
	const { t } = useLanguage();
	const [shares, setShares] = useState<DriveShareDto[]>([]);
	const [linkToken, setLinkToken] = useState<string | null>(null);
	const [linkRole, setLinkRole] = useState<DriveShareRole>("view");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<DriveShareRole>("view");
	const [notify, setNotify] = useState(true);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const id = item?.id;

	// Clear the previous item's sharing state as soon as a different item (or language) is shown.
	const [loadedFor, setLoadedFor] = useState({ id, t });
	if (loadedFor.id !== id || loadedFor.t !== t) {
		setLoadedFor({ id, t });
		setShares([]); setLinkToken(null); setLinkRole("view"); setEmail(""); setMessage("");
	}

	useEffect(() => {
		if (!id) return;
		// A slow response for an earlier item must not fill in the item shown now.
		let active = true;
		void authFetch(`/api/drive/items/${id}/shares`).then(async (response) => {
			if (!response.ok) {
				if (active) toast.error(t("drive.shareFailed"));
				return;
			}
			const data = await response.json() as { shares: DriveShareDto[]; linkToken: string | null; linkRole?: DriveShareRole };
			if (!active) return;
			setShares(data.shares);
			setLinkToken(data.linkToken);
			setLinkRole(data.linkRole === "edit" ? "edit" : "view");
		}).catch(() => {
			if (active) toast.error(t("drive.shareFailed"));
		});
		return () => { active = false; };
	}, [id, t]);

	async function request(input: string, init: RequestInit) {
		setBusy(true);
		try {
			const response = await authFetch(input, init);
			const data = await response.json().catch(() => ({})) as { shares?: DriveShareDto[]; linkToken?: string | null; linkRole?: DriveShareRole; notified?: boolean; error?: string };
			if (!response.ok) { toast.error(data.error ?? t("drive.shareFailed")); return null; }
			onChanged();
			return data;
		} finally { setBusy(false); }
	}

	async function addPerson(event: React.FormEvent) {
		event.preventDefault();
		if (!item || !email.trim()) return;
		const data = await request(`/api/drive/items/${item.id}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role, notify, message: notify ? message : undefined }) });
		if (data?.shares) {
			setShares(data.shares); setEmail(""); setMessage("");
			toast.success(data.notified ? t("share.sharedAndNotified") : t("share.shared"));
		}
	}

	/** Re-posting a person with another role changes it; the server sends no second email. */
	async function changeRole(share: DriveShareDto, next: DriveShareRole) {
		if (!item || share.role === next) return;
		const data = await request(`/api/drive/items/${item.id}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: share.email, role: next, notify: false }) });
		if (data?.shares) setShares(data.shares);
	}

	async function removePerson(shareId: string) {
		if (!item) return;
		const data = await request(`/api/drive/items/${item.id}/shares?shareId=${encodeURIComponent(shareId)}`, { method: "DELETE" });
		if (data?.shares) setShares(data.shares);
	}

	/** General access: restricted, or anyone with the link as viewer or editor. */
	async function setGeneralAccess(enabled: boolean, nextRole: DriveShareRole = linkRole) {
		if (!item) return;
		const data = await request(`/api/drive/items/${item.id}/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, role: nextRole }) });
		if (data) {
			setLinkToken(data.linkToken ?? null);
			setLinkRole(data.linkRole === "edit" ? "edit" : "view");
			if (enabled && !linkToken && data.linkToken) {
				void navigator.clipboard?.writeText(`${window.location.origin}/d/${data.linkToken}`).then(() => toast.success(t("drive.linkCopied"))).catch(() => undefined);
			}
		}
	}

	const linkUrl = linkToken ? `${window.location.origin}/d/${linkToken}` : "";
	// Editing through a link works for Docs, Sheets and Slides (also inside a shared folder); other files are view only.
	const linkCanEdit = item?.kind === "folder" || !!(item && officeKindFromContentType(item.contentType));

	return (
		<Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto">
				<DialogHeader><DialogTitle className="pr-6 truncate">{t("drive.shareTitle", { name: item?.name ?? "" })}</DialogTitle></DialogHeader>
				<form onSubmit={addPerson} className="flex gap-2">
					<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("drive.shareEmail")} aria-label={t("drive.shareEmail")} />
					<Select value={role} onChange={(event) => setRole(event.target.value as DriveShareRole)} className={selectClass} aria-label={t("drive.peopleWithAccess")}>
						<option value="view">{t("drive.canView")}</option>
						<option value="edit">{t("drive.canEdit")}</option>
					</Select>
					<Button type="submit" disabled={busy || !email.trim()}>{t("drive.shareAdd")}</Button>
				</form>
				{email.trim() && (
					<div className="mt-3 space-y-2">
						<label className="flex items-center gap-2 text-sm text-neutral-700"><Checkbox checked={notify} onChange={(event) => setNotify(event.target.checked)} />{t("share.notifyPeople")}</label>
						{notify && <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("share.messagePlaceholder")} aria-label={t("share.messagePlaceholder")} rows={3} maxLength={1000} />}
					</div>
				)}
				<p className="mt-2 text-xs text-neutral-500">{role === "edit" ? t("share.editHint") : t("share.viewHint")}</p>
				<h3 className="mb-2 mt-6 text-sm font-medium text-neutral-900">{t("drive.peopleWithAccess")}</h3>
				{shares.length === 0 ? <p className="text-sm text-neutral-500">{t("drive.noPeople")}</p> : (
					<ul className="space-y-1">
						{shares.map((share) => (
							<li key={share.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50">
								<span className="min-w-0 flex-1"><span className="block truncate text-neutral-900">{share.name}</span><span className="block truncate text-xs text-neutral-500">{share.email}</span></span>
								<Select value={share.role} disabled={busy} onChange={(event) => void changeRole(share, event.target.value as DriveShareRole)} className="h-8 w-auto shrink-0 text-xs" aria-label={t("share.roleFor", { name: share.name || share.email })}>
									<option value="view">{t("drive.canView")}</option>
									<option value="edit">{t("drive.canEdit")}</option>
								</Select>
								<button type="button" onClick={() => void removePerson(share.id)} disabled={busy} aria-label={t("drive.remove")} className="rounded-full p-1 text-neutral-500 hover:bg-neutral-200"><X size={14} /></button>
							</li>
						))}
					</ul>
				)}
				<h3 className="mb-2 mt-6 text-sm font-medium text-neutral-900">{t("drive.generalAccess")}</h3>
				<div className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3 text-sm" data-testid="general-access">
					<span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${linkToken ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"}`}>
						{linkToken ? <Globe2 size={18} /> : <LockKeyhole size={18} />}
					</span>
					<div className="min-w-0 flex-1">
						<Select value={linkToken ? "link" : "restricted"} disabled={busy} onChange={(event) => void setGeneralAccess(event.target.value === "link")} className="h-8 w-auto border-0 bg-transparent px-0 font-medium text-neutral-900" aria-label={t("drive.generalAccess")}>
							<option value="restricted">{t("share.accessRestricted")}</option>
							<option value="link">{t("share.accessAnyone")}</option>
						</Select>
						<p className="text-xs text-neutral-500">
							{!linkToken ? t("share.accessRestrictedHint") : linkRole === "edit" ? t("share.accessAnyoneEditHint") : t("share.accessAnyoneViewHint")}
						</p>
					</div>
					{linkToken && (
						<Select value={linkRole} disabled={busy} onChange={(event) => void setGeneralAccess(true, event.target.value as DriveShareRole)} className="h-8 w-auto shrink-0 text-xs" aria-label={t("share.linkRole")}>
							<option value="view">{t("share.roleViewer")}</option>
							{linkCanEdit && <option value="edit">{t("share.roleEditor")}</option>}
						</Select>
					)}
				</div>
				{linkToken && (
					<div className="mt-2 flex gap-2">
						<Input readOnly value={linkUrl} onFocus={(event) => event.currentTarget.select()} aria-label={t("drive.copyLink")} />
						<Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(linkUrl).then(() => toast.success(t("drive.linkCopied"))); }}><Copy size={16} />{t("drive.copyLink")}</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
