"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SPECIAL_CHARACTERS } from "./docs-utils";
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

type Stats = { words: number; characters: number; charactersNoSpaces: number };

/** Tools > Word count: the whole document, and the selection when there is one. */
export function WordCountDialog({ stats, onClose }: { stats: { document: Stats; selection: Stats | null; pages: number } | null; onClose: () => void }) {
	const { t } = useLanguage();
	const rows: { label: string; value: (entry: Stats) => number }[] = [
		{ label: t("docs.wordCount.words"), value: (entry) => entry.words },
		{ label: t("docs.wordCount.characters"), value: (entry) => entry.characters },
		{ label: t("docs.wordCount.charactersNoSpaces"), value: (entry) => entry.charactersNoSpaces },
	];
	return (
		<Dialog open={!!stats} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent onCloseAutoFocus={keepFocus} className="max-w-sm">
				<DialogHeader><DialogTitle>{t("docs.wordCount.title")}</DialogTitle></DialogHeader>
				{stats && (
					<table className="w-full text-sm text-neutral-800">
						{stats.selection && (
							<thead>
								<tr className="text-xs text-neutral-500">
									<th className="py-1 text-left font-normal" />
									<th className="py-1 text-right font-normal">{t("docs.wordCount.selection")}</th>
									<th className="py-1 text-right font-normal">{t("docs.wordCount.document")}</th>
								</tr>
							</thead>
						)}
						<tbody>
							<tr className="border-b border-neutral-100">
								<td className="py-2">{t("docs.wordCount.pages")}</td>
								{stats.selection && <td className="py-2 text-right tabular-nums">—</td>}
								<td className="py-2 text-right tabular-nums">{stats.pages.toLocaleString()}</td>
							</tr>
							{rows.map((row) => (
								<tr key={row.label} className="border-b border-neutral-100 last:border-0">
									<td className="py-2">{row.label}</td>
									{stats.selection && <td className="py-2 text-right tabular-nums">{row.value(stats.selection).toLocaleString()}</td>}
									<td className="py-2 text-right tabular-nums">{row.value(stats.document).toLocaleString()}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				<div className="flex justify-end"><Button type="button" onClick={onClose}>{t("common.done")}</Button></div>
			</DialogContent>
		</Dialog>
	);
}

/** Insert > Special characters: a grid per group; picking one inserts it and keeps the dialog open. */
export function SpecialCharactersDialog({ open, onPick, onClose }: { open: boolean; onPick: (char: string) => void; onClose: () => void }) {
	const { t } = useLanguage();
	const [group, setGroup] = useState(SPECIAL_CHARACTERS[0].key);
	const chars = [...(SPECIAL_CHARACTERS.find((entry) => entry.key === group)?.chars ?? "")];
	return (
		<Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
			<DialogContent onCloseAutoFocus={keepFocus} className="max-h-[calc(100vh-4rem)] max-w-md overflow-y-auto">
				<DialogHeader><DialogTitle>{t("docs.specialChars.title")}</DialogTitle></DialogHeader>
				<div className="flex flex-wrap gap-1" role="tablist">
					{SPECIAL_CHARACTERS.map((entry) => (
						<button key={entry.key} type="button" role="tab" aria-selected={group === entry.key} onClick={() => setGroup(entry.key)} className="rounded-full px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100 aria-selected:bg-blue-100 aria-selected:text-blue-800">
							{t(`docs.specialChars.${entry.key}`)}
						</button>
					))}
				</div>
				<div className="grid grid-cols-8 gap-1">
					{chars.map((char) => (
						<button key={char} type="button" title={`U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`} onClick={() => onPick(char)} className="flex h-10 items-center justify-center rounded-md border border-neutral-200 text-lg text-neutral-800 hover:border-blue-400 hover:bg-blue-50">
							{char}
						</button>
					))}
				</div>
				<div className="flex justify-end"><Button type="button" variant="ghost" onClick={onClose}>{t("common.done")}</Button></div>
			</DialogContent>
		</Dialog>
	);
}

/** Insert > Table: rows and columns typed in, for sizes past the toolbar grid. */
export function TableDialog({ open, onSubmit, onClose }: { open: boolean; onSubmit: (rows: number, cols: number) => void; onClose: () => void }) {
	const { t } = useLanguage();
	const [rows, setRows] = useState("3");
	const [cols, setCols] = useState("3");
	const parsed = { rows: Math.floor(Number(rows)), cols: Math.floor(Number(cols)) };
	const valid = parsed.rows >= 1 && parsed.rows <= 100 && parsed.cols >= 1 && parsed.cols <= 20;
	return (
		<Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
			<DialogContent onCloseAutoFocus={keepFocus} className="max-w-sm">
				<DialogHeader><DialogTitle>{t("docs.table.title")}</DialogTitle></DialogHeader>
				<form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit(parsed.rows, parsed.cols); }}>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="docs-table-rows">{t("docs.table.rows")}</Label>
							<Input id="docs-table-rows" type="number" min={1} max={100} autoFocus value={rows} onChange={(event) => setRows(event.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="docs-table-cols">{t("docs.table.columns")}</Label>
							<Input id="docs-table-cols" type="number" min={1} max={20} value={cols} onChange={(event) => setCols(event.target.value)} />
						</div>
					</div>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
						<Button type="submit" disabled={!valid}>{t("docs.image.insert")}</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
