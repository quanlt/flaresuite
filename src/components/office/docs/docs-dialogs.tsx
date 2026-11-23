"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { DocPage } from "./docs-utils";

/** Accepts what people type into a link box: bare domains get https://, emails get mailto:. */
export function normalizeLinkUrl(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^(https?:|mailto:|tel:)/i.test(trimmed) || trimmed.startsWith("#") || /^\/(?!\/)/.test(trimmed)) return trimmed;
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`;
	if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(trimmed)) return `https://${trimmed}`;
	return null;
}

// The page restores its own selection after a dialog closes, so focus must not jump back to a toolbar button.
const keepFocus = (event: Event) => event.preventDefault();

export function LinkDialog({ initial, onSubmit, onClose }: { initial: { url: string; text: string; needsText: boolean } | null; onSubmit: (url: string, text: string) => void; onClose: () => void }) {
	const { t } = useLanguage();
	return (
		<Dialog open={!!initial} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent onCloseAutoFocus={keepFocus}>
				<DialogHeader><DialogTitle>{t("docs.link.title")}</DialogTitle></DialogHeader>
				{initial && <LinkForm key={initial.url + initial.text} initial={initial} onSubmit={onSubmit} onClose={onClose} />}
			</DialogContent>
		</Dialog>
	);
}

function LinkForm({ initial, onSubmit, onClose }: { initial: { url: string; text: string; needsText: boolean }; onSubmit: (url: string, text: string) => void; onClose: () => void }) {
	const { t } = useLanguage();
	const [url, setUrl] = useState(initial.url);
	const [text, setText] = useState(initial.text);
	const normalized = normalizeLinkUrl(url);
	return (
		<form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (normalized) onSubmit(normalized, text.trim() || normalized); }}>
			{initial.needsText && (
				<div className="space-y-1.5">
					<Label htmlFor="docs-link-text">{t("docs.link.text")}</Label>
					<Input id="docs-link-text" value={text} onChange={(event) => setText(event.target.value)} />
				</div>
			)}
			<div className="space-y-1.5">
				<Label htmlFor="docs-link-url">{t("docs.link.url")}</Label>
				<Input id="docs-link-url" autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
				{url.trim() && !normalized && <p className="text-xs text-red-600">{t("docs.link.invalid")}</p>}
			</div>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
				<Button type="submit" disabled={!normalized}>{t("docs.link.apply")}</Button>
			</div>
		</form>
	);
}

export function ImageUrlDialog({ open, onSubmit, onClose }: { open: boolean; onSubmit: (url: string) => void; onClose: () => void }) {
	const { t } = useLanguage();
	const [url, setUrl] = useState("");
	const valid = /^https:\/\/\S+$/i.test(url.trim());
	return (
		<Dialog open={open} onOpenChange={(next) => { if (!next) { setUrl(""); onClose(); } }}>
			<DialogContent onCloseAutoFocus={keepFocus}>
				<DialogHeader><DialogTitle>{t("docs.image.title")}</DialogTitle></DialogHeader>
				<form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (valid) { onSubmit(url.trim()); setUrl(""); } }}>
					<div className="space-y-1.5">
						<Label htmlFor="docs-image-url">{t("docs.image.url")}</Label>
						<Input id="docs-image-url" autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
						<p className="text-xs text-neutral-500">{t("docs.image.urlHint")}</p>
					</div>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="ghost" onClick={() => { setUrl(""); onClose(); }}>{t("common.cancel")}</Button>
						<Button type="submit" disabled={!valid}>{t("docs.image.insert")}</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function PageSetupDialog({ page, onSubmit, onClose }: { page: DocPage | null; onSubmit: (page: DocPage) => void; onClose: () => void }) {
	const { t } = useLanguage();
	return (
		<Dialog open={!!page} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent onCloseAutoFocus={keepFocus}>
				<DialogHeader><DialogTitle>{t("docs.pageSetup.title")}</DialogTitle></DialogHeader>
				{page && <PageSetupForm initial={page} onSubmit={onSubmit} onClose={onClose} />}
			</DialogContent>
		</Dialog>
	);
}

function PageSetupForm({ initial, onSubmit, onClose }: { initial: DocPage; onSubmit: (page: DocPage) => void; onClose: () => void }) {
	const { t } = useLanguage();
	const [size, setSize] = useState(initial.size);
	const [orientation, setOrientation] = useState(initial.orientation);
	return (
		<form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ size, orientation }); }}>
			<div className="space-y-1.5">
				<Label>{t("docs.pageSetup.orientation")}</Label>
				<div className="flex gap-4 text-sm text-neutral-800">
					{(["portrait", "landscape"] as const).map((value) => (
						<label key={value} className="flex items-center gap-2">
							<input type="radio" name="docs-orientation" checked={orientation === value} onChange={() => setOrientation(value)} />
							{value === "portrait" ? t("docs.pageSetup.portrait") : t("docs.pageSetup.landscape")}
						</label>
					))}
				</div>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="docs-page-size">{t("docs.pageSetup.size")}</Label>
				<Select id="docs-page-size" value={size} onChange={(event) => setSize(event.target.value === "letter" ? "letter" : "a4")}>
					<option value="a4">A4 (21 × 29.7 cm)</option>
					<option value="letter">Letter (8.5 × 11 in)</option>
				</Select>
			</div>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
				<Button type="submit">{t("docs.pageSetup.apply")}</Button>
			</div>
		</form>
	);
}
