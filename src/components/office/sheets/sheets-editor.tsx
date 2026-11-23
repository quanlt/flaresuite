"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useLanguage } from "@/components/language-provider";
import type { CellBorder, CellStyle, SpreadsheetContent } from "@/lib/office/types";
import { SPREADSHEET_MAX_ROWS } from "@/lib/office/utils";
import { cellAddress, columnName, formatRange, normalizeRange, parseRange } from "@/lib/office/sheets/address";
import type { CellCoord, RangeCoord } from "@/lib/office/sheets/address";
import { applyBorders } from "@/lib/office/sheets/borders";
import { detectDelimiter, parseDelimited, serializeTsv } from "@/lib/office/sheets/csv";
import { createFilter, filterHiddenRows, filterRange, filterValues, removeDuplicateRows, removeFilter, setFilterHidden, trimWhitespace } from "@/lib/office/sheets/data";
import { findCells, replaceInCells } from "@/lib/office/sheets/find";
import type { FindMatch } from "@/lib/office/sheets/find";
import { formatCellValue } from "@/lib/office/sheets/format";
import { evaluateWorkbook, FUNCTION_NAMES, isError, isFormula, valueToText } from "@/lib/office/sheets/formula";
import { expandToMerges, mergeAt, mergeCells, sheetMerges, unmergeCells } from "@/lib/office/sheets/merge";
import { addSheet, applyStyle, clearRange, copyBlock, duplicateSheet, fillDown, getSheet, moveSheet, normalizeLinkUrl, pasteBlock, pasteFormats, setCellInput, setCellLink, updateSheet, usedBounds } from "@/lib/office/sheets/operations";
import type { ClipboardBlock } from "@/lib/office/sheets/operations";
import { deleteLines, deleteSheet, insertLines, renameSheet, sortRange } from "@/lib/office/sheets/structure";
import { shortcutLabel } from "../office-menus";
import type { OfficeEditorProps } from "../office-types";
import { SheetsFilterMenu, SheetsFindDialog, SheetsLinkDialog } from "./sheets-dialogs";
import type { FindRequest } from "./sheets-dialogs";
import { cellRect, rangeRect, SheetsGrid } from "./sheets-grid";
import { SheetsTabs } from "./sheets-tabs";
import { SheetsToolbar } from "./sheets-toolbar";
import type { EditState, RefInsertion, Selection, SheetAction, SheetViewState } from "./sheets-editor-types";
import { acceptsReference, ADD_ROWS_STEP, cellFontFamily, cellFontPx, computeLayout, currencyForLocale, DEFAULT_FONT_PT, DEFAULT_ROW_HEIGHT, functionInsertion, functionPrefix, GRID_COLORS, HEADER_HEIGHT, HISTORY_LIMIT, indexAt, MIN_COL_WIDTH, ROW_HEADER_WIDTH, selectionStats, visibleWindow } from "./sheets-editor-utils";
import { useSheetsMenus } from "./use-sheets-menus";

const ORIGIN: Selection = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } };

/** What was last copied here: the text put on the system clipboard, the cells, and their computed values. */
type InternalClipboard = { text: string; block: ClipboardBlock; values: string[][]; cut: { sheetId: string; range: RangeCoord } | null };

/** Google-Sheets-like spreadsheet editor. All edits go through `commit`, which records undo history. */
export function SheetsEditor({ content, contentKey, onChange, readOnly, name }: OfficeEditorProps<"spreadsheet">) {
	const { t, locale } = useLanguage();
	const currency = currencyForLocale(locale);

	const [activeSheetId, setActiveSheetId] = useState(() => content.activeSheetId ?? content.sheets[0].id);
	const [selection, setSelection] = useState<Selection>(ORIGIN);
	const [edit, setEdit] = useState<EditState | null>(null);
	const [scroll, setScroll] = useState({ top: 0, left: 0 });
	const [viewport, setViewport] = useState({ width: 1200, height: 800 });
	const [widthOverride, setWidthOverride] = useState<Record<number, number>>({});
	const [nameBox, setNameBox] = useState<string | null>(null);
	const [suggestionIndex, setSuggestionIndex] = useState(0);
	const [caret, setCaret] = useState(0);
	const [history, setHistory] = useState({ undo: 0, redo: 0 });
	const [zoom, setZoom] = useState(1);
	const [showFormulaBar, setShowFormulaBar] = useState(true);
	const [showFormulas, setShowFormulas] = useState(false);
	const [findDialog, setFindDialog] = useState<{ replace: boolean } | null>(null);
	const [linkDialog, setLinkDialog] = useState<{ text: string; url: string } | null>(null);

	const scrollerRef = useRef<HTMLDivElement>(null);
	const cellInputRef = useRef<HTMLInputElement>(null);
	const barInputRef = useRef<HTMLInputElement>(null);
	const contentRef = useRef(content);
	const undoRef = useRef<SpreadsheetContent[]>([]);
	const redoRef = useRef<SpreadsheetContent[]>([]);
	const clipboardRef = useRef<InternalClipboard | null>(null);
	const refInsertRef = useRef<RefInsertion | null>(null);
	const dragRef = useRef<{ kind: "select" | "ref" | "rows" | "cols" } | null>(null);
	const pasteValuesRef = useRef(false);
	// The latest edit and caret for handlers that outlive a render (mouse drags, blur after unmount).
	const editRef = useRef<EditState | null>(null);
	const caretRef = useRef(0);

	useEffect(() => { contentRef.current = content; }, [content]);
	useEffect(() => { editRef.current = edit; }, [edit]);
	useEffect(() => { caretRef.current = caret; }, [caret]);

	// A document replaced from outside (first load, reload, someone else's save) starts fresh.
	const [loadedKey, setLoadedKey] = useState(contentKey);
	if (loadedKey !== contentKey) {
		setLoadedKey(contentKey);
		setActiveSheetId(content.activeSheetId ?? content.sheets[0].id);
		setSelection(ORIGIN);
		setEdit(null);
		setHistory({ undo: 0, redo: 0 });
	}
	useEffect(() => { undoRef.current = []; redoRef.current = []; }, [contentKey]);

	const sheet = getSheet(content, activeSheetId);
	const merges = useMemo(() => sheetMerges(sheet), [sheet]);
	const range = useMemo(() => expandToMerges(merges, normalizeRange(selection.anchor, selection.focus)), [selection, merges]);
	const active = selection.anchor;
	const activeMerge = mergeAt(merges, active.row, active.col);
	const workbook = useMemo(() => evaluateWorkbook(content), [content]);
	/** The text a cell shows with its number format (what filters and find compare). */
	const shownText = useCallback((row: number, col: number) => formatCellValue(workbook.getValue(sheet.id, row, col), sheet.cells[cellAddress(row, col)]?.style, locale, currency).text, [workbook, sheet, locale, currency]);
	const hiddenRows = useMemo(() => filterHiddenRows(sheet, shownText), [sheet, shownText]);
	const filter = useMemo(() => {
		const target = filterRange(sheet);
		if (!target) return null;
		const activeCols = new Set(Object.entries(sheet.filter?.hidden ?? {}).filter(([, values]) => Array.isArray(values) && values.length).map(([key]) => Number(key)));
		return { range: target, activeCols };
	}, [sheet]);
	const layout = useMemo(() => computeLayout(sheet, widthOverride, zoom, hiddenRows), [sheet, widthOverride, zoom, hiddenRows]);
	const visible = useMemo(() => visibleWindow(sheet, layout, scroll, viewport), [sheet, layout, scroll, viewport]);
	const display = useCallback((row: number, col: number) => {
		const cell = sheet.cells[cellAddress(row, col)];
		if (showFormulas && isFormula(cell?.input)) return { text: cell.input, align: "left" as const, error: false };
		return formatCellValue(workbook.getValue(sheet.id, row, col), cell?.style, locale, currency);
	}, [workbook, sheet, locale, currency, showFormulas]);
	const activeCell = sheet.cells[cellAddress(active.row, active.col)];
	const activeStyle: CellStyle = activeCell?.style ?? {};
	const currencySymbol = useMemo(() => {
		try { return (0).toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: 0 }).replace(/[\d\s.,\u00a0]/g, "") || "$"; } catch { return "$"; }
	}, [locale, currency]);
	const stats = useMemo(() => selectionStats(workbook, sheet.id, range), [workbook, sheet.id, range]);

	/* ---------------- history ---------------- */

	const commit = useCallback((next: SpreadsheetContent, record = true) => {
		if (readOnly || next === contentRef.current) return;
		if (record) {
			undoRef.current.push(contentRef.current);
			if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
			redoRef.current = [];
		}
		contentRef.current = next;
		onChange(next);
		setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
	}, [readOnly, onChange]);

	const undo = useCallback(() => {
		const previous = undoRef.current.pop();
		if (!previous || readOnly) return;
		redoRef.current.push(contentRef.current);
		contentRef.current = previous;
		onChange(previous);
		setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
	}, [readOnly, onChange]);

	const redo = useCallback(() => {
		const next = redoRef.current.pop();
		if (!next || readOnly) return;
		undoRef.current.push(contentRef.current);
		contentRef.current = next;
		onChange(next);
		setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
	}, [readOnly, onChange]);

	/* ---------------- viewport ---------------- */

	useLayoutEffect(() => {
		const element = scrollerRef.current;
		if (!element) return;
		const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const frameRef = useRef<number | null>(null);
	const onScroll = useCallback(() => {
		if (frameRef.current !== null) return;
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null;
			const element = scrollerRef.current;
			if (element) setScroll({ top: element.scrollTop, left: element.scrollLeft });
		});
	}, []);

	const scrollIntoView = useCallback((cell: CellCoord) => {
		const element = scrollerRef.current;
		if (!element) return;
		const frozenRows = sheet.frozenRows ?? 0;
		const frozenCols = sheet.frozenCols ?? 0;
		const bodyHeight = element.clientHeight - HEADER_HEIGHT;
		const bodyWidth = element.clientWidth - ROW_HEADER_WIDTH;
		if (cell.row >= frozenRows) {
			const top = layout.rowTops[cell.row];
			const bottom = layout.rowTops[cell.row + 1];
			if (top < element.scrollTop + layout.frozenHeight) element.scrollTop = top - layout.frozenHeight;
			else if (bottom > element.scrollTop + bodyHeight) element.scrollTop = bottom - bodyHeight;
		}
		if (cell.col >= frozenCols) {
			const left = layout.colLefts[cell.col];
			const right = layout.colLefts[cell.col + 1];
			if (left < element.scrollLeft + layout.frozenWidth) element.scrollLeft = left - layout.frozenWidth;
			else if (right > element.scrollLeft + bodyWidth) element.scrollLeft = right - bodyWidth;
		}
	}, [sheet, layout]);

	const focusGrid = useCallback(() => { scrollerRef.current?.focus({ preventScroll: true }); }, []);

	const select = useCallback((anchor: CellCoord, focus: CellCoord = anchor, reveal: CellCoord | null = focus) => {
		setSelection({ anchor, focus });
		if (reveal) requestAnimationFrame(() => scrollIntoView(reveal));
	}, [scrollIntoView]);

	const clampCell = useCallback((row: number, col: number): CellCoord => ({
		row: Math.max(0, Math.min(sheet.rowCount - 1, row)),
		col: Math.max(0, Math.min(sheet.colCount - 1, col)),
	}), [sheet.rowCount, sheet.colCount]);

	/* ---------------- editing ---------------- */

	const pendingFocusRef = useRef<number | null>(null);
	const startEdit = useCallback((initial: string | undefined, mode: EditState["mode"], source: EditState["source"] = "cell") => {
		if (readOnly) return;
		const input = sheet.cells[cellAddress(active.row, active.col)]?.input ?? "";
		const value = initial ?? input;
		refInsertRef.current = null;
		setEdit({ row: active.row, col: active.col, value, mode, source });
		setCaret(value.length);
		setSuggestionIndex(0);
		// Focused in a layout effect right after the input mounts (keydown renders synchronously), so keys typed
		// quickly after the first one land in the input instead of the grid.
		if (source === "cell") pendingFocusRef.current = value.length;
	}, [readOnly, sheet, active]);
	useLayoutEffect(() => {
		const caretAt = pendingFocusRef.current;
		const element = cellInputRef.current;
		if (caretAt === null || !element) return;
		pendingFocusRef.current = null;
		element.focus();
		element.setSelectionRange(caretAt, caretAt);
	}, [edit]);

	const commitEdit = useCallback((move: { row: number; col: number } | null) => {
		const edit = editRef.current;
		if (!edit) return;
		editRef.current = null;
		const current = getSheet(contentRef.current, sheet.id).cells[cellAddress(edit.row, edit.col)]?.input ?? "";
		if (edit.value !== current) commit(setCellInput(contentRef.current, sheet.id, edit.row, edit.col, edit.value));
		setEdit(null);
		refInsertRef.current = null;
		if (move) {
			const next = clampCell(edit.row + move.row, edit.col + move.col);
			select(next);
		}
		focusGrid();
	}, [sheet.id, commit, clampCell, select, focusGrid]);

	const cancelEdit = useCallback(() => {
		editRef.current = null;
		setEdit(null);
		refInsertRef.current = null;
		focusGrid();
	}, [focusGrid]);

	const editInput = useCallback(() => (edit?.source === "bar" ? barInputRef.current : cellInputRef.current), [edit]);

	const suggestions = useMemo(() => {
		if (!edit) return [];
		const prefix = functionPrefix(edit.value, caret);
		if (!prefix) return [];
		const upper = prefix.toUpperCase();
		return FUNCTION_NAMES.filter((name) => name.startsWith(upper) && name !== upper).slice(0, 8);
	}, [edit, caret]);

	function acceptSuggestion(fn: string) {
		if (!edit) return;
		const prefix = functionPrefix(edit.value, caret) ?? "";
		const before = edit.value.slice(0, caret - prefix.length);
		const value = `${before}${fn}(${edit.value.slice(caret)}`;
		const position = before.length + fn.length + 1;
		setEdit({ ...edit, value });
		setCaret(position);
		requestAnimationFrame(() => { const element = editInput(); element?.focus(); element?.setSelectionRange(position, position); });
	}

	/** Inserts or replaces the reference being picked with the mouse while typing a formula. */
	const placeReference = useCallback((target: RangeCoord, anchor: CellCoord) => {
		const current = editRef.current;
		if (!current) return;
		const text = formatRange(target);
		const insertion = refInsertRef.current;
		const start = insertion ? insertion.start : caretRef.current;
		const end = insertion ? insertion.end : caretRef.current;
		const value = `${current.value.slice(0, start)}${text}${current.value.slice(end)}`;
		const position = start + text.length;
		const next = { ...current, value };
		refInsertRef.current = { start, end: position, anchor };
		editRef.current = next;
		caretRef.current = position;
		setEdit(next);
		setCaret(position);
		requestAnimationFrame(() => {
			const element = next.source === "bar" ? barInputRef.current : cellInputRef.current;
			element?.focus();
			element?.setSelectionRange(position, position);
		});
	}, []);

	function onEditKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
		if (!edit) return;
		if (suggestions.length) {
			if (event.key === "ArrowDown") { event.preventDefault(); setSuggestionIndex((index) => (index + 1) % suggestions.length); return; }
			if (event.key === "ArrowUp") { event.preventDefault(); setSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length); return; }
			if (event.key === "Tab" || (event.key === "Enter" && suggestionIndex >= 0)) {
				event.preventDefault();
				acceptSuggestion(suggestions[Math.min(suggestionIndex, suggestions.length - 1)]);
				return;
			}
		}
		if (event.key === "Enter") { event.preventDefault(); commitEdit({ row: event.shiftKey ? -1 : 1, col: 0 }); return; }
		if (event.key === "Tab") { event.preventDefault(); commitEdit({ row: 0, col: event.shiftKey ? -1 : 1 }); return; }
		if (event.key === "Escape") { event.preventDefault(); cancelEdit(); return; }
		if (edit.mode === "enter" && edit.source === "cell" && event.key.startsWith("Arrow") && !acceptsReference(edit.value, caret)) {
			event.preventDefault();
			const moves: Record<string, { row: number; col: number }> = { ArrowUp: { row: -1, col: 0 }, ArrowDown: { row: 1, col: 0 }, ArrowLeft: { row: 0, col: -1 }, ArrowRight: { row: 0, col: 1 } };
			commitEdit(moves[event.key]);
		}
	}

	function onEditChange(value: string, position: number | null) {
		if (!edit) return;
		refInsertRef.current = null;
		setEdit({ ...edit, value });
		setCaret(position ?? value.length);
		setSuggestionIndex(0);
	}

	/* ---------------- mouse ---------------- */

	const cellFromPoint = useCallback((clientX: number, clientY: number): CellCoord => {
		const element = scrollerRef.current!;
		const box = element.getBoundingClientRect();
		const x = clientX - box.left - ROW_HEADER_WIDTH;
		const y = clientY - box.top - HEADER_HEIGHT;
		const contentX = x < layout.frozenWidth ? x : x + element.scrollLeft;
		const contentY = y < layout.frozenHeight ? y : y + element.scrollTop;
		return clampCell(indexAt(layout.rowTops, Math.max(0, contentY)), indexAt(layout.colLefts, Math.max(0, contentX)));
	}, [layout, clampCell]);

	const startDrag = useCallback((kind: "select" | "ref" | "rows" | "cols", onMove: (cell: CellCoord) => void) => {
		dragRef.current = { kind };
		const move = (event: MouseEvent) => onMove(cellFromPoint(event.clientX, event.clientY));
		const up = () => {
			dragRef.current = null;
			window.removeEventListener("mousemove", move);
			window.removeEventListener("mouseup", up);
		};
		window.addEventListener("mousemove", move);
		window.addEventListener("mouseup", up);
	}, [cellFromPoint]);

	const onCellMouseDown = useCallback((row: number, col: number, event: ReactMouseEvent) => {
		if (event.button !== 0) return;
		const cell = { row, col };
		if (edit && edit.value.startsWith("=") && (refInsertRef.current?.end === caret || acceptsReference(edit.value, caret)) && !(edit.row === row && edit.col === col)) {
			event.preventDefault();
			placeReference({ start: cell, end: cell }, cell);
			startDrag("ref", (current) => placeReference(normalizeRange(cell, current), cell));
			return;
		}
		if (edit) commitEdit(null);
		event.preventDefault();
		focusGrid();
		if (event.shiftKey) setSelection((current) => ({ anchor: current.anchor, focus: cell }));
		else setSelection({ anchor: cell, focus: cell });
		startDrag("select", (current) => setSelection((selected) => ({ anchor: selected.anchor, focus: current })));
	}, [edit, caret, commitEdit, focusGrid, startDrag, placeReference]);

	const onCellDoubleClick = useCallback((row: number, col: number) => {
		if (readOnly) return;
		const input = sheet.cells[cellAddress(row, col)]?.input ?? "";
		setSelection({ anchor: { row, col }, focus: { row, col } });
		refInsertRef.current = null;
		setEdit({ row, col, value: input, mode: "edit", source: "cell" });
		setCaret(input.length);
		requestAnimationFrame(() => { const element = cellInputRef.current; if (element) { element.focus(); element.setSelectionRange(input.length, input.length); } });
	}, [readOnly, sheet]);

	const onHeaderMouseDown = useCallback((kind: "row" | "col" | "all", index: number, event: ReactMouseEvent) => {
		if (event.button !== 0) return;
		event.preventDefault();
		if (edit) commitEdit(null);
		focusGrid();
		const lastRow = sheet.rowCount - 1;
		const lastCol = sheet.colCount - 1;
		if (kind === "all") { setSelection({ anchor: { row: 0, col: 0 }, focus: { row: lastRow, col: lastCol } }); return; }
		if (kind === "col") {
			const anchorCol = event.shiftKey ? selection.anchor.col : index;
			setSelection({ anchor: { row: 0, col: anchorCol }, focus: { row: lastRow, col: index } });
			startDrag("cols", (cell) => setSelection({ anchor: { row: 0, col: anchorCol }, focus: { row: lastRow, col: cell.col } }));
		} else {
			const anchorRow = event.shiftKey ? selection.anchor.row : index;
			setSelection({ anchor: { row: anchorRow, col: 0 }, focus: { row: index, col: lastCol } });
			startDrag("rows", (cell) => setSelection({ anchor: { row: anchorRow, col: 0 }, focus: { row: cell.row, col: lastCol } }));
		}
	}, [edit, commitEdit, focusGrid, sheet.rowCount, sheet.colCount, selection.anchor, startDrag]);

	const onResizeStart = useCallback((col: number, event: ReactPointerEvent) => {
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = layout.colWidth(col);
		let width = startWidth;
		const move = (moveEvent: PointerEvent) => {
			width = Math.max(MIN_COL_WIDTH, Math.round(startWidth + moveEvent.clientX - startX));
			setWidthOverride({ [col]: width / zoom });
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			setWidthOverride({});
			if (width !== startWidth) commit(updateSheet(contentRef.current, sheet.id, (current) => ({ ...current, colWidths: { ...current.colWidths, [String(col)]: Math.max(MIN_COL_WIDTH, Math.round(width / zoom)) } })));
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}, [layout, commit, sheet.id, zoom]);

	/* ---------------- keyboard ---------------- */

	const hasValue = useCallback((row: number, col: number) => !!sheet.cells[cellAddress(row, col)]?.input, [sheet]);

	/** Ctrl+arrow: jump to the edge of the current block of data, or to the next block. */
	const jump = useCallback((from: CellCoord, dRow: number, dCol: number): CellCoord => {
		let row = from.row;
		let col = from.col;
		const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < sheet.rowCount && c < sheet.colCount;
		if (!inside(row + dRow, col + dCol)) return from;
		if (hasValue(row, col) && hasValue(row + dRow, col + dCol)) {
			while (inside(row + dRow, col + dCol) && hasValue(row + dRow, col + dCol)) { row += dRow; col += dCol; }
			return { row, col };
		}
		row += dRow; col += dCol;
		while (inside(row, col) && !hasValue(row, col)) {
			if (!inside(row + dRow, col + dCol)) return { row, col };
			row += dRow; col += dCol;
		}
		return { row, col };
	}, [sheet.rowCount, sheet.colCount, hasValue]);

	/** The whole used area of the sheet (for sort, filter and data tools when only one cell is selected). */
	const dataRange = useCallback((fromRow = 0): RangeCoord | null => {
		const bounds = usedBounds(sheet);
		if (bounds.lastRow < fromRow) return null;
		return { start: { row: fromRow, col: 0 }, end: { row: bounds.lastRow, col: Math.max(bounds.lastCol, active.col) } };
	}, [sheet, active.col]);
	const isSingleCell = range.start.row === range.end.row && range.start.col === range.end.col || (!!activeMerge && range.start.row === activeMerge.start.row && range.start.col === activeMerge.start.col && range.end.row === activeMerge.end.row && range.end.col === activeMerge.end.col);

	function sortRows(target: RangeCoord, column: number, ascending: boolean) {
		const valueAt = (row: number, col: number) => { const value = workbook.getValue(sheet.id, row, col); return isError(value) ? null : value; };
		commit(sortRange(contentRef.current, sheet.id, target, column, ascending, valueAt));
	}

	function toggleCheckbox(row: number, col: number) {
		if (readOnly) return;
		const checked = workbook.getValue(sheet.id, row, col) === true;
		setSelection({ anchor: { row, col }, focus: { row, col } });
		commit(setCellInput(contentRef.current, sheet.id, row, col, checked ? "FALSE" : "TRUE"));
		focusGrid();
	}

	function copySelection(cut: boolean): string {
		const text = rangeText(range);
		const values: string[][] = [];
		for (let row = range.start.row; row <= range.end.row; row += 1) {
			const line: string[] = [];
			for (let col = range.start.col; col <= range.end.col; col += 1) line.push(valueToText(workbook.getValue(sheet.id, row, col)));
			values.push(line);
		}
		clipboardRef.current = { text, block: copyBlock(sheet, range), values, cut: cut && !readOnly ? { sheetId: sheet.id, range } : null };
		return text;
	}

	function pasteText(text: string, mode: "all" | "values" | "format") {
		if (readOnly) return;
		const internal = clipboardRef.current;
		const normalized = (value: string) => value.replace(/\r\n/g, "\n").replace(/\n$/, "");
		const fromHere = !!internal && normalized(internal.text) === normalized(text);
		let next = contentRef.current;
		let block: ClipboardBlock;
		if (mode === "format") {
			if (!fromHere || !internal) return;
			const pasted = pasteFormats(next, sheet.id, range, internal.block);
			commit(pasted.content);
			select(pasted.range.start, pasted.range.end, null);
			return;
		}
		if (fromHere && internal && mode === "values") {
			block = { rows: internal.values.map((line) => line.map((input) => ({ input }))), origin: null };
		} else if (fromHere && internal) {
			block = internal.block;
			if (internal.cut) {
				next = clearRange(next, internal.cut.sheetId, internal.cut.range, true);
				// Moved formulas keep pointing where they pointed: an origin at the target means no shift.
				block = { ...block, origin: { ...range.start } };
				clipboardRef.current = null;
			}
		} else {
			if (!text) return;
			const rows = parseDelimited(text.replace(/\r?\n$/, ""), detectDelimiter(text));
			block = { rows: rows.map((line) => line.map((input) => ({ input }))), origin: null };
		}
		const pasted = pasteBlock(next, sheet.id, range, block);
		commit(pasted.content);
		select(pasted.range.start, pasted.range.end, null);
	}

	function runAction(action: SheetAction) {
		const current = contentRef.current;
		const id = sheet.id;
		switch (action.type) {
			case "undo": undo(); break;
			case "redo": redo(); break;
			case "print": setTimeout(() => window.print(), 50); return;
			case "zoom": setZoom(action.value); break;
			case "format": commit(applyStyle(current, id, range, { format: action.format === "general" ? undefined : action.format })); break;
			case "decimals": commit(applyStyle(current, id, range, (style) => ({
				format: !style.format || style.format === "general" || style.format === "text" || style.format === "date" || style.format === "time" ? "number" : style.format,
				decimals: Math.max(0, Math.min(10, (style.decimals ?? 2) + action.delta)),
			}))); break;
			case "toggle": {
				const on = !activeStyle[action.key];
				commit(applyStyle(current, id, range, { [action.key]: on ? true : undefined }));
				break;
			}
			case "wrap": commit(applyStyle(current, id, range, { wrap: action.value === "wrap" ? true : undefined, clip: action.value === "clip" ? true : undefined })); break;
			case "color": commit(applyStyle(current, id, range, { [action.key]: action.value })); break;
			case "align": commit(applyStyle(current, id, range, { align: action.value === "left" ? undefined : action.value })); break;
			case "valign": commit(applyStyle(current, id, range, { valign: action.value === "middle" ? undefined : action.value })); break;
			case "fontSize": commit(applyStyle(current, id, range, { fontSize: action.value === DEFAULT_FONT_PT ? undefined : Math.max(1, Math.min(400, action.value)) })); break;
			case "fontFamily": commit(applyStyle(current, id, range, { fontFamily: action.value })); break;
			case "borders": commit(applyBorders(current, id, range, action.kind, { color: action.color, style: action.style })); break;
			case "merge": {
				if (isSingleCell && !activeMerge) break;
				commit(mergeCells(current, id, range, action.mode));
				setSelection({ anchor: range.start, focus: range.end });
				break;
			}
			case "unmerge": commit(unmergeCells(current, id, range)); break;
			case "clearFormat": commit(applyStyle(current, id, range, (style) => Object.fromEntries(Object.keys(style).map((key) => [key, undefined])) as Partial<CellStyle>)); break;
			case "freeze": commit(updateSheet(current, id, (entry) => ({
				...entry,
				frozenRows: action.rows !== undefined ? action.rows || undefined : entry.frozenRows,
				frozenCols: action.cols !== undefined ? action.cols || undefined : entry.frozenCols,
			}))); break;
			case "insert": {
				const count = action.axis === "row" ? range.end.row - range.start.row + 1 : range.end.col - range.start.col + 1;
				const at = action.axis === "row" ? (action.after ? range.end.row + 1 : range.start.row) : (action.after ? range.end.col + 1 : range.start.col);
				commit(insertLines(current, id, action.axis, at, Math.min(count, 1000)));
				break;
			}
			case "delete": {
				const start = action.axis === "row" ? range.start.row : range.start.col;
				const count = action.axis === "row" ? range.end.row - range.start.row + 1 : range.end.col - range.start.col + 1;
				const next = deleteLines(current, id, action.axis, start, count);
				commit(next);
				const nextSheet = getSheet(next, id);
				const cell = { row: Math.min(range.start.row, nextSheet.rowCount - 1), col: Math.min(range.start.col, nextSheet.colCount - 1) };
				setSelection({ anchor: cell, focus: cell });
				break;
			}
			case "insertSheet": applySheets(addSheet(current)); break;
			case "sort": {
				// The whole sheet skips frozen header rows; a single selected cell means the whole sheet too.
				const target = action.scope === "range" && !isSingleCell ? range : dataRange(sheet.frozenRows ?? 0);
				if (target) sortRows(target, active.col, action.ascending);
				break;
			}
			case "filter": {
				if (sheet.filter) { commit(removeFilter(current, id)); break; }
				const target = isSingleCell ? dataRange(0) ?? range : range;
				commit(createFilter(current, id, target));
				break;
			}
			case "removeDuplicates": {
				const target = isSingleCell ? dataRange(0) : range;
				if (!target) break;
				const hasHeader = target.start.row === 0 && ((sheet.frozenRows ?? 0) > 0 || !!filter);
				const result = removeDuplicateRows(current, id, target, shownText, { hasHeader });
				if (result.removed) commit(result.content);
				toast(result.removed ? t("sheets.duplicatesRemoved", { count: String(result.removed) }) : t("sheets.noDuplicates"));
				break;
			}
			case "trimWhitespace": {
				const target = isSingleCell ? dataRange(0) : range;
				if (!target) break;
				const result = trimWhitespace(current, id, target);
				if (result.changed) commit(result.content);
				toast(t("sheets.trimmed", { count: String(result.changed) }));
				break;
			}
			case "insertFunction": {
				if (readOnly) break;
				const plan = functionInsertion(range, action.name, sheet.rowCount, sheet.colCount);
				if (plan.kind === "edit") { startEdit(plan.text, "edit"); return; }
				commit(setCellInput(current, id, plan.row, plan.col, plan.input));
				select({ row: plan.row, col: plan.col });
				break;
			}
			case "checkbox": commit(applyStyle(current, id, range, { checkbox: activeStyle.checkbox ? undefined : true })); break;
			case "link": {
				if (readOnly) break;
				const input = activeCell?.input ?? "";
				setLinkDialog({ text: isFormula(input) ? "" : input, url: activeCell?.link ?? "" });
				return;
			}
			case "cut":
			case "copy": {
				const text = copySelection(action.type === "cut");
				navigator.clipboard?.writeText(text).catch(() => toast.error(t("sheets.clipboardBlocked", { shortcut: shortcutLabel(action.type === "cut" ? "Mod+X" : "Mod+C") })));
				break;
			}
			case "paste": {
				const mode = action.mode;
				if (!navigator.clipboard?.readText) { toast.error(t("sheets.clipboardBlocked", { shortcut: shortcutLabel("Mod+V") })); break; }
				navigator.clipboard.readText().then((text) => pasteText(text, mode)).catch(() => {
					// Without permission to read, an internal copy can still be pasted.
					if (clipboardRef.current) pasteText(clipboardRef.current.text, mode);
					else toast.error(t("sheets.clipboardBlocked", { shortcut: shortcutLabel("Mod+V") }));
				});
				break;
			}
			case "deleteValues": commit(clearRange(current, id, range)); break;
			case "find": setFindDialog({ replace: action.replace && !readOnly }); return;
			case "selectAll": setSelection({ anchor: { row: 0, col: 0 }, focus: { row: sheet.rowCount - 1, col: sheet.colCount - 1 } }); break;
			case "gridlines": commit(updateSheet(current, id, (entry) => ({ ...entry, hideGridlines: entry.hideGridlines ? undefined : true }))); break;
			case "formulaBar": setShowFormulaBar((value) => !value); break;
			case "showFormulas": setShowFormulas((value) => !value); break;
		}
		focusGrid();
	}

	// Menus and the toolbar call the latest runAction through this ref, so they need not rebuild every render.
	const dispatchRef = useRef<(action: SheetAction) => void>(() => {});
	useEffect(() => { dispatchRef.current = runAction; });

	const view: SheetViewState = useMemo(() => ({
		zoom,
		showFormulaBar,
		showFormulas,
		showGridlines: !sheet.hideGridlines,
		frozenRows: sheet.frozenRows ?? 0,
		frozenCols: sheet.frozenCols ?? 0,
		filterOn: !!sheet.filter,
		merged: !!activeMerge,
		canUndo: history.undo > 0,
		canRedo: history.redo > 0,
		activeRow: active.row,
		activeCol: active.col,
	}), [zoom, showFormulaBar, showFormulas, sheet.hideGridlines, sheet.frozenRows, sheet.frozenCols, sheet.filter, activeMerge, history.undo, history.redo, active.row, active.col]);
	useSheetsMenus({ dispatch: dispatchRef, readOnly, view, style: activeStyle });

	/** One step of the active cell, stepping over merged blocks and rows hidden by the filter. */
	const step = useCallback((from: CellCoord, dRow: number, dCol: number, toEdge: boolean): CellCoord => {
		const merge = mergeAt(merges, from.row, from.col);
		const start = merge ? { row: dRow > 0 ? merge.end.row : dRow < 0 ? merge.start.row : from.row, col: dCol > 0 ? merge.end.col : dCol < 0 ? merge.start.col : from.col } : from;
		let target = toEdge ? jump(start, dRow, dCol) : clampCell(start.row + dRow, start.col + dCol);
		while (dRow && hiddenRows.has(target.row) && target.row + dRow >= 0 && target.row + dRow < sheet.rowCount) target = { ...target, row: target.row + dRow };
		const landed = mergeAt(merges, target.row, target.col);
		return landed ? landed.start : target;
	}, [merges, jump, clampCell, hiddenRows, sheet.rowCount]);

	function onGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
		if (edit || event.target !== event.currentTarget) return;
		const mod = event.ctrlKey || event.metaKey;
		const key = event.key;
		const code = event.code;
		const run = (action: SheetAction) => { event.preventDefault(); runAction(action); };
		const move = (dRow: number, dCol: number) => {
			event.preventDefault();
			if (event.shiftKey) {
				const from = selection.focus;
				const target = mod ? jump(from, dRow, dCol) : clampCell(from.row + dRow, from.col + dCol);
				select(selection.anchor, target, target);
			} else select(step(active, dRow, dCol, mod));
		};
		if (event.altKey && event.shiftKey && !mod) {
			if (code === "Digit5") { run({ type: "toggle", key: "strike" }); return; }
			if (code === "Digit7") { run({ type: "borders", kind: "outer" }); return; }
			if (code === "Digit6") { run({ type: "borders", kind: "none" }); return; }
		}
		if (key === "F11" && event.shiftKey) { run({ type: "insertSheet" }); return; }
		if (mod && !event.altKey) {
			const lower = key.toLowerCase();
			if (lower === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
			if (lower === "y") { event.preventDefault(); redo(); return; }
			if (lower === "a") { event.preventDefault(); setSelection({ anchor: { row: 0, col: 0 }, focus: { row: sheet.rowCount - 1, col: sheet.colCount - 1 } }); return; }
			if (lower === "f" && !event.shiftKey) { run({ type: "find", replace: false }); return; }
			if (lower === "h") { run({ type: "find", replace: true }); return; }
			if (code === "Backquote") { run({ type: "showFormulas" }); return; }
			if (key === " " || code === "Space") { event.preventDefault(); select({ row: 0, col: range.start.col }, { row: sheet.rowCount - 1, col: range.end.col }, null); return; }
			if (!readOnly) {
				if (event.shiftKey) {
					const formats: Record<string, SheetAction> = {
						Digit1: { type: "format", format: "number" },
						Digit2: { type: "format", format: "time" },
						Digit3: { type: "format", format: "date" },
						Digit4: { type: "format", format: "currency" },
						Digit5: { type: "format", format: "percent" },
					};
					if (formats[code]) { run(formats[code]); return; }
					if (lower === "e") { run({ type: "align", value: "center" }); return; }
					if (lower === "l") { run({ type: "align", value: "left" }); return; }
					if (lower === "r") { run({ type: "align", value: "right" }); return; }
					if (lower === "f") { run({ type: "filter" }); return; }
					// Ctrl+Shift+V: the paste event that follows pastes values only.
					if (lower === "v") { pasteValuesRef.current = true; return; }
				}
				if (lower === "b") { run({ type: "toggle", key: "bold" }); return; }
				if (lower === "i") { run({ type: "toggle", key: "italic" }); return; }
				if (lower === "u") { run({ type: "toggle", key: "underline" }); return; }
				if (lower === "k") { run({ type: "link" }); return; }
				if (key === "\\") { run({ type: "clearFormat" }); return; }
				if (lower === "d") { event.preventDefault(); commit(fillDown(contentRef.current, sheet.id, range)); return; }
				if (code === "Semicolon") {
					event.preventDefault();
					const now = new Date();
					const pad = (value: number) => String(value).padStart(2, "0");
					const text = event.shiftKey ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
					commit(setCellInput(contentRef.current, sheet.id, active.row, active.col, text));
					return;
				}
			}
			if (key === "Home") { event.preventDefault(); select({ row: 0, col: 0 }); return; }
			if (key === "End") {
				event.preventDefault();
				const bounds = usedBounds(sheet);
				select(clampCell(Math.max(0, bounds.lastRow), Math.max(0, bounds.lastCol)));
				return;
			}
		}
		switch (key) {
			case "ArrowUp": move(-1, 0); return;
			case "ArrowDown": move(1, 0); return;
			case "ArrowLeft": move(0, -1); return;
			case "ArrowRight": move(0, 1); return;
			case "Tab": event.preventDefault(); select(step(active, 0, event.shiftKey ? -1 : 1, false)); return;
			case "Enter":
				event.preventDefault();
				if (readOnly) select(step(active, event.shiftKey ? -1 : 1, 0, false));
				else startEdit(undefined, "edit");
				return;
			case "F2": event.preventDefault(); startEdit(undefined, "edit"); return;
			case "Home": event.preventDefault(); select({ row: selection.focus.row, col: 0 }); return;
			case "End": {
				event.preventDefault();
				let last = 0;
				for (let col = sheet.colCount - 1; col >= 0; col -= 1) if (hasValue(selection.focus.row, col)) { last = col; break; }
				select({ row: selection.focus.row, col: last });
				return;
			}
			case "PageDown":
			case "PageUp": {
				event.preventDefault();
				const page = Math.max(1, Math.floor((viewport.height - HEADER_HEIGHT) / (DEFAULT_ROW_HEIGHT * zoom)) - 1);
				select(clampCell(selection.focus.row + (key === "PageDown" ? page : -page), selection.focus.col));
				return;
			}
			case "Delete":
			case "Backspace":
				event.preventDefault();
				if (!readOnly) commit(clearRange(contentRef.current, sheet.id, range));
				return;
			case " ":
				if (event.shiftKey && !mod) { event.preventDefault(); select({ row: range.start.row, col: 0 }, { row: range.end.row, col: sheet.colCount - 1 }, null); return; }
				if (!readOnly && !mod && activeStyle.checkbox) { event.preventDefault(); toggleCheckbox(active.row, active.col); return; }
				break;
		}
		if (!readOnly && !mod && !event.altKey && key.length === 1) {
			event.preventDefault();
			startEdit(key, "enter");
		}
	}

	/* ---------------- clipboard ---------------- */

	const rangeText = useCallback((target: RangeCoord) => {
		const rows: string[][] = [];
		for (let row = target.start.row; row <= target.end.row; row += 1) {
			const line: string[] = [];
			for (let col = target.start.col; col <= target.end.col; col += 1) line.push(display(row, col).text);
			rows.push(line);
		}
		return serializeTsv(rows);
	}, [display]);

	function copyOrCut(event: ReactClipboardEvent, cut: boolean) {
		if (edit) return;
		event.clipboardData.setData("text/plain", copySelection(cut));
		event.preventDefault();
	}

	function onPaste(event: ReactClipboardEvent) {
		const valuesOnly = pasteValuesRef.current;
		pasteValuesRef.current = false;
		if (edit || readOnly) return;
		event.preventDefault();
		pasteText(event.clipboardData.getData("text/plain"), valuesOnly ? "values" : "all");
	}

	/* ---------------- find and replace ---------------- */

	const findMatches = useCallback((request: FindRequest): FindMatch[] => findCells(
		contentRef.current,
		request.query,
		{ ...request.options, sheetId: request.scope === "sheet" ? sheet.id : undefined },
		(sheetId, row, col) => {
			const target = getSheet(contentRef.current, sheetId);
			return formatCellValue(workbook.getValue(sheetId, row, col), target.cells[cellAddress(row, col)]?.style, locale, currency).text;
		},
	), [sheet.id, workbook, locale, currency]);

	function goToMatch(match: FindMatch) {
		if (match.sheetId !== sheet.id) switchSheet(match.sheetId);
		const cell = { row: match.row, col: match.col };
		setSelection({ anchor: cell, focus: cell });
		requestAnimationFrame(() => scrollIntoView(cell));
	}

	/** Moves to the next (or previous) match after the active cell, wrapping around the workbook. */
	function findNext(request: FindRequest, backwards: boolean): { index: number; count: number } {
		const matches = findMatches(request);
		if (!matches.length) return { index: 0, count: 0 };
		const order = new Map(contentRef.current.sheets.map((entry, index) => [entry.id, index]));
		const position = (match: { sheetId: string; row: number; col: number }) => [order.get(match.sheetId) ?? 0, match.row, match.col];
		const compare = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
		const here = position({ sheetId: sheet.id, row: active.row, col: active.col });
		let index = backwards
			? matches.findLastIndex((match) => compare(position(match), here) < 0)
			: matches.findIndex((match) => compare(position(match), here) > 0);
		if (index < 0) index = backwards ? matches.length - 1 : 0;
		goToMatch(matches[index]);
		return { index, count: matches.length };
	}

	function replaceCurrent(request: FindRequest, replacement: string) {
		const matches = findMatches(request);
		const current = matches.find((match) => match.sheetId === sheet.id && match.row === active.row && match.col === active.col);
		let replaced = 0;
		if (current) {
			const result = replaceInCells(contentRef.current, request.query, replacement, request.options, [current]);
			replaced = result.count;
			if (result.count) commit(result.content);
		}
		const next = findNext(request, false);
		return { ...next, replaced };
	}

	function replaceAll(request: FindRequest, replacement: string) {
		const result = replaceInCells(contentRef.current, request.query, replacement, { ...request.options, sheetId: request.scope === "sheet" ? sheet.id : undefined });
		if (result.count) commit(result.content);
		return result.count;
	}

	/* ---------------- sheets ---------------- */

	function switchSheet(id: string) {
		if (edit) commitEdit(null);
		setActiveSheetId(id);
		setSelection(ORIGIN);
		scrollerRef.current?.scrollTo({ top: 0, left: 0 });
		if (!readOnly && contentRef.current.activeSheetId !== id) commit({ ...contentRef.current, activeSheetId: id }, false);
	}

	function applySheets(next: SpreadsheetContent) {
		commit(next);
		if (next.activeSheetId && next.activeSheetId !== activeSheetId) {
			setActiveSheetId(next.activeSheetId);
			setSelection(ORIGIN);
		}
	}

	/* ---------------- name box ---------------- */

	function goToNameBox() {
		if (nameBox === null) return;
		const target = parseRange(nameBox.toUpperCase());
		setNameBox(null);
		if (target && target.end.row < sheet.rowCount && target.end.col < sheet.colCount) select(target.start, target.end, target.end);
		focusGrid();
	}

	/* ---------------- render ---------------- */

	const editMerge = edit ? mergeAt(merges, edit.row, edit.col) : null;
	const editRect = edit && edit.source === "cell" ? (editMerge ? rangeRect(sheet, layout, scroll, editMerge) : cellRect(sheet, layout, scroll, edit.row, edit.col)) : null;
	const editStyle = edit ? sheet.cells[cellAddress(edit.row, edit.col)]?.style : undefined;
	const barValue = edit ? edit.value : activeCell?.input ?? "";
	const editFontPx = cellFontPx(editStyle, zoom);
	const editWidth = editRect ? Math.min(640 * zoom, Math.max(editRect.width + 1, edit!.value.length * editFontPx * 0.62 + 16)) : 0;
	const bounds = useMemo(() => usedBounds(sheet), [sheet]);
	const activeLink = !edit && activeCell?.link ? normalizeLinkUrl(activeCell.link) : null;
	const activeRect = activeMerge ? rangeRect(sheet, layout, scroll, activeMerge) : cellRect(sheet, layout, scroll, active.row, active.col);
	const renderFilterButton = (col: number, isActive: boolean) => (
		<SheetsFilterMenu
			label={t("sheets.filterColumn", { column: columnName(col) })}
			active={isActive}
			readOnly={readOnly}
			hidden={sheet.filter?.hidden?.[String(col)] ?? []}
			getValues={() => filterValues(sheet, col, shownText)}
			onSort={(ascending) => {
				const target = filterRange(sheet);
				if (target && target.end.row > target.start.row) sortRows({ start: { row: target.start.row + 1, col: target.start.col }, end: target.end }, col, ascending);
			}}
			onHiddenChange={(values) => commit(setFilterHidden(contentRef.current, sheet.id, col, values))}
		/>
	);

	return (
		<div className="flex h-full min-h-0 flex-col bg-white">
			<div className="contents print:hidden">
				{!readOnly && <SheetsToolbar style={activeStyle} view={view} currencySymbol={currencySymbol} onAction={runAction} />}
				<div className={clsx("relative h-9 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-2 print:hidden", showFormulaBar ? "flex" : "hidden")}>
					<input
						value={nameBox ?? formatRange(range)}
						onChange={(event) => setNameBox(event.target.value)}
						onFocus={(event) => { setNameBox(formatRange(range)); event.currentTarget.select(); }}
						onBlur={() => setNameBox(null)}
						onKeyDown={(event) => { if (event.key === "Enter") goToNameBox(); if (event.key === "Escape") { setNameBox(null); focusGrid(); } }}
						aria-label={t("sheets.nameBox")}
						className="h-7 w-24 shrink-0 rounded border border-neutral-200 px-2 font-mono text-xs text-neutral-800 outline-none focus:border-blue-500"
					/>
					<span aria-hidden="true" className="select-none font-serif text-sm italic text-neutral-500">fx</span>
					<input
						ref={barInputRef}
						value={barValue}
						readOnly={readOnly}
						aria-label={t("sheets.formulaBar")}
						onFocus={() => { if (!readOnly && !edit) startEdit(undefined, "edit", "bar"); }}
						onChange={(event) => onEditChange(event.target.value, event.target.selectionStart)}
						onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
						onKeyDown={onEditKeyDown}
						onBlur={(event) => { if (edit?.source === "bar" && event.relatedTarget !== cellInputRef.current) commitEdit(null); }}
						className="h-7 min-w-0 flex-1 rounded border border-transparent px-2 font-mono text-sm text-neutral-900 outline-none focus:border-blue-500"
					/>
					{edit?.source === "bar" && suggestions.length > 0 && <Suggestions items={suggestions} index={suggestionIndex} onPick={acceptSuggestion} style={{ left: 140, top: 34 }} />}
				</div>
				<div
					ref={scrollerRef}
					tabIndex={0}
					role="application"
					aria-label={t("sheets.gridLabel", { name, cell: cellAddress(active.row, active.col) })}
					onScroll={onScroll}
					onKeyDown={onGridKeyDown}
					onCopy={(event) => copyOrCut(event, false)}
					onCut={(event) => copyOrCut(event, true)}
					onPaste={onPaste}
					className="relative min-h-0 flex-1 overflow-auto outline-none print:hidden"
					style={{ background: GRID_COLORS.surface, colorScheme: "light", fontFamily: "Arial, Helvetica, sans-serif" }}
				>
					<SheetsGrid
						sheet={sheet}
						layout={layout}
						window={visible}
						scroll={scroll}
						range={range}
						active={active}
						display={display}
						readOnly={readOnly}
						merges={merges}
						zoom={zoom}
						showGridlines={!sheet.hideGridlines}
						filter={filter}
						renderFilterButton={renderFilterButton}
						onToggleCheckbox={toggleCheckbox}
						addRowsLabel={t("sheets.addRows", { count: String(ADD_ROWS_STEP) })}
						resizeLabel={t("sheets.resizeColumn")}
						selectAllLabel={t("sheets.selectAll")}
						onAddRows={() => commit(updateSheet(contentRef.current, sheet.id, (entry) => ({ ...entry, rowCount: Math.min(SPREADSHEET_MAX_ROWS, entry.rowCount + ADD_ROWS_STEP) })))}
						onCellMouseDown={onCellMouseDown}
						onCellDoubleClick={onCellDoubleClick}
						onHeaderMouseDown={onHeaderMouseDown}
						onResizeStart={onResizeStart}
					>
						{editRect && edit && (
							<>
								<input
									ref={cellInputRef}
									value={edit.value}
									aria-label={t("sheets.editCell", { cell: cellAddress(edit.row, edit.col) })}
									onChange={(event) => onEditChange(event.target.value, event.target.selectionStart)}
									onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
									onKeyDown={onEditKeyDown}
									onBlur={(event) => {
										// Clicking the formula bar or a toolbar button keeps the edit; anything else commits it.
										const next = event.relatedTarget as HTMLElement | null;
										if (next === barInputRef.current || dragRef.current?.kind === "ref") return;
										if (next && scrollerRef.current?.contains(next)) return;
										commitEdit(null);
									}}
									spellCheck={false}
									className="outline-none"
									style={{
										position: "absolute",
										left: editRect.left - 1,
										top: editRect.top - 1,
										width: editWidth,
										height: editRect.height + 1,
										zIndex: 40,
										border: `2px solid ${GRID_COLORS.selection}`,
										boxShadow: "0 2px 6px rgba(60,64,67,0.3)",
										padding: "0 3px",
										fontSize: editFontPx,
										fontFamily: cellFontFamily(editStyle),
										fontWeight: editStyle?.bold ? 700 : 400,
										fontStyle: editStyle?.italic ? "italic" : "normal",
										background: "#ffffff",
										color: GRID_COLORS.text,
									}}
								/>
								{suggestions.length > 0 && <Suggestions items={suggestions} index={suggestionIndex} onPick={acceptSuggestion} style={{ left: editRect.left - 1, top: editRect.top + editRect.height + 2, zIndex: 41 }} />}
							</>
						)}
						{activeLink && (
							<div
								className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-lg"
								style={{ position: "absolute", left: activeRect.left, top: activeRect.top + activeRect.height + 4, zIndex: 45, maxWidth: 360 }}
								onMouseDown={(event) => event.stopPropagation()}
							>
								<a href={activeLink} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-blue-700 underline">{activeLink.replace(/^mailto:/, "")}</a>
								{!readOnly && <button type="button" onClick={() => runAction({ type: "link" })} className="shrink-0 font-medium text-neutral-600 hover:text-neutral-900">{t("sheets.editLink")}</button>}
							</div>
						)}
					</SheetsGrid>
				</div>
			</div>
			<SheetsTabs
				sheets={content.sheets}
				activeId={sheet.id}
				readOnly={readOnly}
				stats={stats}
				onSelect={switchSheet}
				onAdd={() => applySheets(addSheet(contentRef.current))}
				onRename={(id, value) => commit(renameSheet(contentRef.current, id, value))}
				onDelete={(id) => applySheets(deleteSheet(contentRef.current, id))}
				onDuplicate={(id) => applySheets(duplicateSheet(contentRef.current, id))}
				onMove={(id, index) => commit(moveSheet(contentRef.current, id, index))}
			/>
			<PrintTable sheetName={sheet.name} lastRow={bounds.lastRow} lastCol={bounds.lastCol} merges={merges} hiddenRows={hiddenRows} display={display} styleAt={(row, col) => sheet.cells[cellAddress(row, col)]?.style} />
			{findDialog && (
				<SheetsFindDialog
					open
					replace={findDialog.replace}
					readOnly={readOnly}
					onOpenChange={(open) => { if (!open) { setFindDialog(null); focusGrid(); } }}
					onFind={findNext}
					onReplace={replaceCurrent}
					onReplaceAll={replaceAll}
				/>
			)}
			{linkDialog && (
				<SheetsLinkDialog
					open
					initialText={linkDialog.text}
					initialUrl={linkDialog.url}
					onOpenChange={(open) => { if (!open) { setLinkDialog(null); focusGrid(); } }}
					onApply={(url, text) => {
						commit(setCellLink(contentRef.current, sheet.id, active.row, active.col, url, text));
						setLinkDialog(null);
						focusGrid();
					}}
				/>
			)}
		</div>
	);
}

function Suggestions({ items, index, onPick, style }: { items: string[]; index: number; onPick: (name: string) => void; style: React.CSSProperties }) {
	return (
		<ul role="listbox" className="absolute z-50 max-h-60 w-48 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-xl" style={style}>
			{items.map((item, position) => (
				<li
					key={item}
					role="option"
					aria-selected={position === index}
					onMouseDown={(event) => { event.preventDefault(); onPick(item); }}
					className={clsx("cursor-pointer px-3 py-1 font-mono text-xs", position === index ? "bg-blue-50 text-blue-800" : "text-neutral-800 hover:bg-neutral-50")}
				>
					{item}
				</li>
			))}
		</ul>
	);
}

/** Printing renders the used part of the sheet as a plain table; the virtualized grid only holds what is on screen. */
function PrintTable({ sheetName, lastRow, lastCol, merges, hiddenRows, display, styleAt }: {
	sheetName: string;
	lastRow: number;
	lastCol: number;
	merges: RangeCoord[];
	hiddenRows: Set<number>;
	display: (row: number, col: number) => { text: string; align: string };
	styleAt: (row: number, col: number) => CellStyle | undefined;
}) {
	if (lastRow < 0) return null;
	const rows: number[] = [];
	for (let row = 0; row <= Math.min(lastRow, 5000); row += 1) if (!hiddenRows.has(row)) rows.push(row);
	const cols: number[] = [];
	for (let col = 0; col <= lastCol; col += 1) cols.push(col);
	const border = (side: CellBorder | undefined) => (side ? `${side.style === "thick" ? 2 : 1}px ${side.style === "dashed" || side.style === "dotted" ? side.style : "solid"} ${side.color || "#000"}` : "1px solid #ccc");
	return (
		<table className="hidden w-full border-collapse text-[10pt] print:table" style={{ color: "#000", background: "#fff" }}>
			<caption className="pb-2 text-left font-semibold">{sheetName}</caption>
			<tbody>
				{rows.map((row) => (
					<tr key={row}>
						{cols.map((col) => {
							const merge = mergeAt(merges, row, col);
							if (merge && (merge.start.row !== row || merge.start.col !== col)) return null;
							const shown = display(row, col);
							const style = styleAt(row, col);
							const text = style?.checkbox ? (shown.text === "TRUE" ? "☑" : "☐") : shown.text;
							return (
								<td
									key={col}
									colSpan={merge ? merge.end.col - merge.start.col + 1 : undefined}
									rowSpan={merge ? merge.end.row - merge.start.row + 1 : undefined}
									style={{
										borderTop: border(style?.borders?.top),
										borderRight: border(style?.borders?.right),
										borderBottom: border(style?.borders?.bottom),
										borderLeft: border(style?.borders?.left),
										padding: "2px 4px",
										textAlign: shown.align as "left" | "center" | "right",
										verticalAlign: style?.valign ?? "middle",
										whiteSpace: style?.wrap ? "pre-wrap" : "pre",
										fontWeight: style?.bold ? 700 : 400,
										fontStyle: style?.italic ? "italic" : "normal",
										textDecoration: [style?.underline ? "underline" : "", style?.strike ? "line-through" : ""].filter(Boolean).join(" ") || undefined,
										fontSize: style?.fontSize ? `${style.fontSize}pt` : undefined,
										fontFamily: style?.fontFamily ? cellFontFamily(style) : undefined,
										background: style?.fill,
										color: style?.color,
									}}
								>
									{text}
								</td>
							);
						})}
					</tr>
				))}
			</tbody>
		</table>
	);
}
