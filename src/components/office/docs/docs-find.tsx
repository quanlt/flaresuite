"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ChevronDown, ChevronUp, X } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildTextIndex, clearFindHighlights, exec, paintFindHighlights, rangeForMatch, scrollRangeIntoView } from "./docs-dom";
import { findMatches } from "./docs-utils";

type Props = {
	pageRef: RefObject<HTMLDivElement | null>;
	/** Opened with the replace row (Ctrl+H) or without it (Ctrl+F). Null when closed. */
	mode: { replace: boolean; seed: string; nonce: number } | null;
	readOnly?: boolean;
	/** Changes whenever the page text may have changed, so matches are recomputed. */
	version: number;
	onReplaced: () => void;
	onClose: () => void;
};

/** Find and replace: a floating panel over the page that leaves the document visible. */
export function FindReplacePanel({ pageRef, mode, readOnly, version, onReplaced, onClose }: Props) {
	const { t } = useLanguage();
	const findInput = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");
	const [matchCase, setMatchCase] = useState(false);
	const [showReplace, setShowReplace] = useState(false);
	const [current, setCurrent] = useState(0);
	const [count, setCount] = useState(0);
	const open = !!mode;

	// Each open (even while already open) focuses the box and takes the selected text as the query.
	useEffect(() => {
		if (!mode) return;
		setShowReplace(mode.replace && !readOnly);
		if (mode.seed) setQuery(mode.seed);
		requestAnimationFrame(() => { findInput.current?.focus(); findInput.current?.select(); });
	}, [mode, readOnly]);

	const search = useCallback(() => {
		const root = pageRef.current;
		if (!root || !open || !query) return { index: null, matches: [] as [number, number][] };
		const index = buildTextIndex(root);
		return { index, matches: findMatches(index.text, query, matchCase) };
	}, [matchCase, open, pageRef, query]);

	const paint = useCallback((position: number, scroll: boolean) => {
		const { index, matches } = search();
		setCount(matches.length);
		if (!index || !matches.length) { clearFindHighlights(); return; }
		const bounded = ((position % matches.length) + matches.length) % matches.length;
		setCurrent(bounded);
		const ranges = matches.map(([start, end]) => rangeForMatch(index, start, end)).filter((range): range is Range => !!range);
		const active = rangeForMatch(index, matches[bounded][0], matches[bounded][1]);
		paintFindHighlights(ranges, active);
		if (scroll && active) scrollRangeIntoView(active);
	}, [search]);

	useEffect(() => {
		if (!open || !query) { clearFindHighlights(); setCount(0); setCurrent(0); return; }
		paint(0, true);
		// Typing in the query restarts at the first match; edits to the page keep the position (below).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, query, matchCase]);

	useEffect(() => {
		if (open && query) paint(current, false);
		// Only page edits re-run this; `current` and `paint` are read at that moment.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [version]);

	useEffect(() => () => clearFindHighlights(), []);

	const replaceAt = (position: number | null) => {
		const root = pageRef.current;
		const { index, matches } = search();
		if (!root || !index || !matches.length || readOnly) return;
		const targets = position === null ? matches.map((_, entry) => entry).reverse() : [((position % matches.length) + matches.length) % matches.length];
		const selection = window.getSelection();
		root.focus({ preventScroll: true });
		for (const target of targets) {
			const range = rangeForMatch(index, matches[target][0], matches[target][1]);
			if (!range) continue;
			selection?.removeAllRanges();
			selection?.addRange(range);
			// insertText keeps the browser's undo history, so Ctrl+Z undoes a replacement.
			if (replacement) exec("insertText", replacement);
			else exec("delete");
		}
		onReplaced();
		findInput.current?.focus();
		paint(position ?? 0, position !== null);
	};

	if (!mode) return null;

	const close = () => { clearFindHighlights(); onClose(); };
	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Escape") { event.preventDefault(); close(); }
	};

	return (
		<div role="dialog" aria-label={showReplace ? t("docs.find.replaceTitle") : t("docs.find.title")} onKeyDown={onKeyDown} className="absolute right-4 top-3 z-30 w-[min(24rem,calc(100%-2rem))] rounded-xl border border-neutral-200 bg-white p-3 shadow-xl print:hidden">
			<div className="flex items-center gap-1.5">
				<Input
					ref={findInput}
					aria-label={t("docs.find.find")}
					placeholder={t("docs.find.find")}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); paint(current + (event.shiftKey ? -1 : 1), true); } }}
					className="h-8 flex-1"
				/>
				<span className="min-w-14 text-center text-xs tabular-nums text-neutral-500" aria-live="polite">
					{query ? (count ? t("docs.find.position", { current: current + 1, total: count }) : t("docs.find.none")) : ""}
				</span>
				<button type="button" title={t("docs.find.previous")} aria-label={t("docs.find.previous")} disabled={!count} onClick={() => paint(current - 1, true)} className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"><ChevronUp size={16} /></button>
				<button type="button" title={t("docs.find.next")} aria-label={t("docs.find.next")} disabled={!count} onClick={() => paint(current + 1, true)} className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"><ChevronDown size={16} /></button>
				<button type="button" title={t("docs.find.close")} aria-label={t("docs.find.close")} onClick={close} className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100"><X size={16} /></button>
			</div>
			{showReplace && (
				<div className="mt-2 flex items-center gap-1.5">
					<Input aria-label={t("docs.find.replaceWith")} placeholder={t("docs.find.replaceWith")} value={replacement} onChange={(event) => setReplacement(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); replaceAt(current); } }} className="h-8 flex-1" />
					<Button type="button" size="sm" variant="ghost" disabled={!count} onClick={() => replaceAt(current)}>{t("docs.find.replace")}</Button>
					<Button type="button" size="sm" variant="ghost" disabled={!count} onClick={() => replaceAt(null)}>{t("docs.find.replaceAll")}</Button>
				</div>
			)}
			<div className="mt-2 flex items-center justify-between text-xs text-neutral-600">
				<label className="flex items-center gap-1.5">
					<input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} />
					{t("docs.find.matchCase")}
				</label>
				{!readOnly && !showReplace && <button type="button" onClick={() => setShowReplace(true)} className="rounded px-1.5 py-0.5 text-blue-700 hover:bg-blue-50">{t("docs.find.showReplace")}</button>}
			</div>
		</div>
	);
}
