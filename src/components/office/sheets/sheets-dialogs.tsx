"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { useLanguage } from "@/components/language-provider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FindOptions } from "@/lib/office/sheets/find";
import { normalizeLinkUrl } from "@/lib/office/sheets/operations";
import { FilterIcon, SortAscIcon, SortDescIcon } from "./sheets-icons";

const inputClass = "h-9 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 outline-none focus:border-blue-500";
const primaryClass = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const secondaryClass = "rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

export type FindScope = "all" | "sheet";
export type FindRequest = { query: string; options: FindOptions; scope: FindScope };

/** Find and replace. The editor runs the searches; this only collects the query and shows the outcome. */
export function SheetsFindDialog({ open, replace, readOnly, onOpenChange, onFind, onReplace, onReplaceAll }: {
	open: boolean;
	replace: boolean;
	readOnly: boolean;
	onOpenChange: (open: boolean) => void;
	onFind: (request: FindRequest, backwards: boolean) => { index: number; count: number };
	onReplace: (request: FindRequest, replacement: string) => { index: number; count: number; replaced: number };
	onReplaceAll: (request: FindRequest, replacement: string) => number;
}) {
	const { t } = useLanguage();
	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");
	const [scope, setScope] = useState<FindScope>("all");
	const [matchCase, setMatchCase] = useState(false);
	const [wholeCell, setWholeCell] = useState(false);
	const [regex, setRegex] = useState(false);
	const [formulas, setFormulas] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const showReplace = replace && !readOnly;
	const request = (): FindRequest => ({ query, scope, options: { matchCase, wholeCell, regex, formulas } });
	const describe = (result: { index: number; count: number }) => (result.count ? t("sheets.findCount", { index: String(result.index + 1), count: String(result.count) }) : t("sheets.findNone"));

	function find(event?: FormEvent, backwards = false) {
		event?.preventDefault();
		if (!query) return;
		setStatus(describe(onFind(request(), backwards)));
	}

	const checkbox = (label: string, checked: boolean, onChange: (value: boolean) => void) => (
		<label className="flex items-center gap-2 text-sm text-neutral-700">
			<input type="checkbox" checked={checked} onChange={(event) => { onChange(event.target.checked); setStatus(null); }} className="h-4 w-4 accent-blue-600" />
			{label}
		</label>
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto" onCloseAutoFocus={(event) => event.preventDefault()}>
				<DialogHeader><DialogTitle>{showReplace ? t("sheets.findReplace") : t("sheets.find")}</DialogTitle></DialogHeader>
				<form onSubmit={(event) => find(event)} className="space-y-3">
					<label className="block space-y-1">
						<span className="text-xs font-medium text-neutral-600">{t("sheets.find")}</span>
						<input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setStatus(null); }} className={inputClass} />
					</label>
					{showReplace && (
						<label className="block space-y-1">
							<span className="text-xs font-medium text-neutral-600">{t("sheets.replaceWith")}</span>
							<input value={replacement} onChange={(event) => setReplacement(event.target.value)} className={inputClass} />
						</label>
					)}
					<label className="block space-y-1">
						<span className="text-xs font-medium text-neutral-600">{t("sheets.searchScope")}</span>
						<select value={scope} onChange={(event) => { setScope(event.target.value as FindScope); setStatus(null); }} className={inputClass}>
							<option value="all">{t("sheets.scopeAll")}</option>
							<option value="sheet">{t("sheets.scopeSheet")}</option>
						</select>
					</label>
					<div className="space-y-2 pt-1">
						{checkbox(t("sheets.matchCase"), matchCase, setMatchCase)}
						{checkbox(t("sheets.matchEntire"), wholeCell, setWholeCell)}
						{checkbox(t("sheets.useRegex"), regex, setRegex)}
						{checkbox(t("sheets.searchFormulas"), formulas, setFormulas)}
					</div>
					<p className="min-h-5 text-sm text-neutral-500" aria-live="polite">{status}</p>
					<div className="flex flex-wrap justify-end gap-2">
						<button type="button" disabled={!query} onClick={() => find(undefined, true)} className={secondaryClass}>{t("sheets.findPrevious")}</button>
						<button type="submit" disabled={!query} className={showReplace ? secondaryClass : primaryClass}>{t("sheets.findNext")}</button>
						{showReplace && (
							<>
								<button type="button" disabled={!query} onClick={() => { const result = onReplace(request(), replacement); setStatus(result.replaced ? `${t("sheets.replacedCount", { count: String(result.replaced) })} · ${describe(result)}` : describe(result)); }} className={secondaryClass}>{t("sheets.replaceOne")}</button>
								<button type="button" disabled={!query} onClick={() => setStatus(t("sheets.replacedCount", { count: String(onReplaceAll(request(), replacement)) }))} className={primaryClass}>{t("sheets.replaceAll")}</button>
							</>
						)}
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** Insert or edit the link of the active cell. */
export function SheetsLinkDialog({ open, initialText, initialUrl, onOpenChange, onApply }: {
	open: boolean;
	initialText: string;
	initialUrl: string;
	onOpenChange: (open: boolean) => void;
	onApply: (url: string | null, text: string) => void;
}) {
	const { t } = useLanguage();
	const [text, setText] = useState(initialText);
	const [url, setUrl] = useState(initialUrl);
	const [error, setError] = useState(false);

	function submit(event: FormEvent) {
		event.preventDefault();
		const normalized = normalizeLinkUrl(url);
		if (!normalized) { setError(true); return; }
		onApply(normalized, text);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<DialogHeader><DialogTitle>{t("sheets.insertLink")}</DialogTitle></DialogHeader>
				<form onSubmit={submit} className="space-y-3">
					<label className="block space-y-1">
						<span className="text-xs font-medium text-neutral-600">{t("sheets.linkText")}</span>
						<input value={text} onChange={(event) => setText(event.target.value)} className={inputClass} />
					</label>
					<label className="block space-y-1">
						<span className="text-xs font-medium text-neutral-600">{t("sheets.linkUrl")}</span>
						<input autoFocus value={url} onChange={(event) => { setUrl(event.target.value); setError(false); }} placeholder="https://" aria-invalid={error} className={clsx(inputClass, error && "border-red-500")} />
					</label>
					{error && <p className="text-sm text-red-600">{t("sheets.linkInvalid")}</p>}
					<div className="flex justify-end gap-2 pt-2">
						{initialUrl && <button type="button" onClick={() => onApply(null, text)} className={clsx(secondaryClass, "mr-auto")}>{t("sheets.linkRemove")}</button>}
						<button type="button" onClick={() => onOpenChange(false)} className={secondaryClass}>{t("common.cancel")}</button>
						<button type="submit" disabled={!url.trim()} className={primaryClass}>{t("sheets.linkApply")}</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

const filterItemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100";

/** The button on a filter header cell: sort by the column and pick which values show. */
export function SheetsFilterMenu({ label, active, readOnly, hidden, getValues, onSort, onHiddenChange }: {
	label: string;
	active: boolean;
	readOnly: boolean;
	hidden: string[];
	getValues: () => string[];
	onSort: (ascending: boolean) => void;
	onHiddenChange: (hidden: string[]) => void;
}) {
	const { t } = useLanguage();
	const [values, setValues] = useState<string[]>([]);
	const hiddenSet = new Set(hidden);
	const toggle = (value: string, show: boolean) => {
		const next = new Set(hiddenSet);
		if (show) next.delete(value); else next.add(value);
		onHiddenChange([...next]);
	};
	return (
		<DropdownMenu.Root modal={false} onOpenChange={(open) => { if (open) setValues(getValues()); }}>
			<DropdownMenu.Trigger asChild>
				<button
					type="button"
					aria-label={label}
					onMouseDown={(event) => event.stopPropagation()}
					className={clsx("flex h-full w-full items-center justify-center rounded-sm outline-none", active ? "bg-green-700 text-white" : "bg-white/80 text-green-800 hover:bg-green-50")}
				>
					<FilterIcon size={12} />
				</button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content align="end" sideOffset={4} className="z-[200] w-64 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl" onCloseAutoFocus={(event) => event.preventDefault()}>
					{!readOnly && (
						<>
							<DropdownMenu.Item className={filterItemClass} onSelect={() => onSort(true)}><SortAscIcon size={16} />{t("sheets.filterSortAsc")}</DropdownMenu.Item>
							<DropdownMenu.Item className={filterItemClass} onSelect={() => onSort(false)}><SortDescIcon size={16} />{t("sheets.filterSortDesc")}</DropdownMenu.Item>
							<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
						</>
					)}
					<div className="flex gap-3 px-3 py-1 text-xs">
						<button type="button" disabled={readOnly} onClick={() => onHiddenChange([])} className="font-medium text-blue-700 hover:underline disabled:opacity-50">{t("sheets.filterSelectAll")}</button>
						<button type="button" disabled={readOnly} onClick={() => onHiddenChange(values)} className="font-medium text-blue-700 hover:underline disabled:opacity-50">{t("sheets.filterClear")}</button>
					</div>
					<div className="max-h-64 overflow-y-auto">
						{values.map((value) => (
							<DropdownMenu.CheckboxItem
								key={value}
								disabled={readOnly}
								checked={!hiddenSet.has(value)}
								onCheckedChange={(checked) => toggle(value, checked === true)}
								onSelect={(event) => event.preventDefault()}
								className={clsx(filterItemClass, "data-[disabled]:cursor-default")}
							>
								<span className={clsx("flex h-4 w-4 shrink-0 items-center justify-center rounded border", hiddenSet.has(value) ? "border-neutral-400" : "border-blue-600 bg-blue-600 text-white")}>
									{!hiddenSet.has(value) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
								</span>
								<span className="truncate">{value === "" ? t("sheets.filterBlanks") : value}</span>
							</DropdownMenu.CheckboxItem>
						))}
					</div>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}
