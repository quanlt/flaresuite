"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import clsx from "clsx";
import { useLanguage } from "@/components/language-provider";
import type { CellStyle, SpreadsheetContent } from "@/lib/office/types";
import { SPREADSHEET_MAX_ROWS } from "@/lib/office/utils";
import { cellAddress, formatRange, normalizeRange, parseRange } from "@/lib/office/sheets/address";
import type { CellCoord, RangeCoord } from "@/lib/office/sheets/address";
import { detectDelimiter, parseDelimited, serializeTsv } from "@/lib/office/sheets/csv";
import { formatCellValue } from "@/lib/office/sheets/format";
import { evaluateWorkbook, FUNCTION_NAMES, isError } from "@/lib/office/sheets/formula";
import { addSheet, applyStyle, clearRange, copyBlock, duplicateSheet, fillDown, getSheet, moveSheet, pasteBlock, setCellInput, updateSheet, usedBounds } from "@/lib/office/sheets/operations";
import type { ClipboardBlock } from "@/lib/office/sheets/operations";
import { deleteLines, deleteSheet, insertLines, renameSheet, sortRange } from "@/lib/office/sheets/structure";
import type { OfficeEditorProps } from "../office-types";
import { cellRect, SheetsGrid } from "./sheets-grid";
import { SheetsTabs } from "./sheets-tabs";
import { SheetsToolbar } from "./sheets-toolbar";
import type { ToolbarAction } from "./sheets-toolbar";
import type { EditState, RefInsertion, Selection } from "./sheets-editor-types";
import { acceptsReference, ADD_ROWS_STEP, computeLayout, currencyForLocale, DEFAULT_ROW_HEIGHT, functionPrefix, GRID_COLORS, HEADER_HEIGHT, HISTORY_LIMIT, indexAt, MIN_COL_WIDTH, ROW_HEADER_WIDTH, selectionStats, visibleWindow } from "./sheets-editor-utils";

const ORIGIN: Selection = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } };

type InternalClipboard = { text: string; block: ClipboardBlock; cut: { sheetId: string; range: RangeCoord } | null };

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

	const scrollerRef = useRef<HTMLDivElement>(null);
	const cellInputRef = useRef<HTMLInputElement>(null);
	const barInputRef = useRef<HTMLInputElement>(null);
	const contentRef = useRef(content);
	const undoRef = useRef<SpreadsheetContent[]>([]);
	const redoRef = useRef<SpreadsheetContent[]>([]);
	const clipboardRef = useRef<InternalClipboard | null>(null);
	const refInsertRef = useRef<RefInsertion | null>(null);
	const dragRef = useRef<{ kind: "select" | "ref" | "rows" | "cols" } | null>(null);
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
	const range = useMemo(() => normalizeRange(selection.anchor, selection.focus), [selection]);
	const active = selection.anchor;
	const workbook = useMemo(() => evaluateWorkbook(content), [content]);
	const layout = useMemo(() => computeLayout(sheet, widthOverride), [sheet, widthOverride]);
	const visible = useMemo(() => visibleWindow(sheet, layout, scroll, viewport), [sheet, layout, scroll, viewport]);
	const display = useCallback((row: number, col: number) => formatCellValue(workbook.getValue(sheet.id, row, col), sheet.cells[cellAddress(row, col)]?.style, locale, currency), [workbook, sheet, locale, currency]);
	const activeCell = sheet.cells[cellAddress(active.row, active.col)];
	const activeStyle: CellStyle = activeCell?.style ?? {};
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
			setWidthOverride({ [col]: width });
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			setWidthOverride({});
			if (width !== startWidth) commit(updateSheet(contentRef.current, sheet.id, (current) => ({ ...current, colWidths: { ...current.colWidths, [String(col)]: width } })));
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}, [layout, commit, sheet.id]);

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

	function runToolbar(action: ToolbarAction) {
		const current = contentRef.current;
		const id = sheet.id;
		switch (action.type) {
			case "undo": undo(); break;
			case "redo": redo(); break;
			case "format": commit(applyStyle(current, id, range, { format: action.format === "general" ? undefined : action.format })); break;
			case "decimals": commit(applyStyle(current, id, range, (style) => ({
				format: !style.format || style.format === "general" ? "number" : style.format,
				decimals: Math.max(0, Math.min(10, (style.decimals ?? 2) + action.delta)),
			}))); break;
			case "toggle": {
				const on = !activeStyle[action.key];
				commit(applyStyle(current, id, range, { [action.key]: on ? true : undefined }));
				break;
			}
			case "color": commit(applyStyle(current, id, range, { [action.key]: action.value })); break;
			case "align": commit(applyStyle(current, id, range, { align: action.value === "left" ? undefined : action.value })); break;
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
			case "sort": {
				let target = range;
				if (range.start.row === range.end.row && range.start.col === range.end.col) {
					const bounds = usedBounds(sheet);
					if (bounds.lastRow < 1) break;
					target = { start: { row: 0, col: 0 }, end: { row: bounds.lastRow, col: Math.max(bounds.lastCol, active.col) } };
				}
				const valueAt = (row: number, col: number) => { const value = workbook.getValue(id, row, col); return isError(value) ? null : value; };
				commit(sortRange(current, id, target, active.col, action.ascending, valueAt));
				break;
			}
		}
		focusGrid();
	}

	function onGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
		if (edit || event.target !== event.currentTarget) return;
		const mod = event.ctrlKey || event.metaKey;
		const key = event.key;
		const move = (dRow: number, dCol: number) => {
			event.preventDefault();
			const from = selection.focus;
			const target = mod ? jump(from, dRow, dCol) : clampCell(from.row + dRow, from.col + dCol);
			if (event.shiftKey) select(selection.anchor, target, target);
			else select(target);
		};
		if (mod && !event.altKey) {
			const lower = key.toLowerCase();
			if (lower === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
			if (lower === "y") { event.preventDefault(); redo(); return; }
			if (lower === "a") { event.preventDefault(); setSelection({ anchor: { row: 0, col: 0 }, focus: { row: sheet.rowCount - 1, col: sheet.colCount - 1 } }); return; }
			if (!readOnly) {
				if (lower === "b") { event.preventDefault(); runToolbar({ type: "toggle", key: "bold" }); return; }
				if (lower === "i") { event.preventDefault(); runToolbar({ type: "toggle", key: "italic" }); return; }
				if (lower === "u") { event.preventDefault(); runToolbar({ type: "toggle", key: "underline" }); return; }
				if (lower === "d") { event.preventDefault(); commit(fillDown(contentRef.current, sheet.id, range)); return; }
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
			case "Tab": event.preventDefault(); select(clampCell(active.row, active.col + (event.shiftKey ? -1 : 1))); return;
			case "Enter":
				event.preventDefault();
				if (readOnly) select(clampCell(active.row + (event.shiftKey ? -1 : 1), active.col));
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
				const page = Math.max(1, Math.floor((viewport.height - HEADER_HEIGHT) / DEFAULT_ROW_HEIGHT) - 1);
				select(clampCell(selection.focus.row + (key === "PageDown" ? page : -page), selection.focus.col));
				return;
			}
			case "Delete":
			case "Backspace":
				event.preventDefault();
				if (!readOnly) commit(clearRange(contentRef.current, sheet.id, range));
				return;
			default:
				if (!readOnly && !mod && !event.altKey && key.length === 1) {
					event.preventDefault();
					startEdit(key, "enter");
				}
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
		const text = rangeText(range);
		event.clipboardData.setData("text/plain", text);
		event.preventDefault();
		clipboardRef.current = { text, block: copyBlock(sheet, range), cut: cut && !readOnly ? { sheetId: sheet.id, range } : null };
	}

	function onPaste(event: ReactClipboardEvent) {
		if (edit || readOnly) return;
		event.preventDefault();
		const text = event.clipboardData.getData("text/plain");
		const internal = clipboardRef.current;
		const normalized = (value: string) => value.replace(/\r\n/g, "\n").replace(/\n$/, "");
		let next = contentRef.current;
		let block: ClipboardBlock;
		if (internal && normalized(internal.text) === normalized(text)) {
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

	const editRect = edit && edit.source === "cell" ? cellRect(sheet, layout, scroll, edit.row, edit.col) : null;
	const barValue = edit ? edit.value : activeCell?.input ?? "";
	const editWidth = editRect ? Math.min(640, Math.max(editRect.width + 1, edit!.value.length * 8 + 16)) : 0;
	const bounds = useMemo(() => usedBounds(sheet), [sheet]);

	return (
		<div className="flex h-full min-h-0 flex-col bg-white">
			<div className="contents print:hidden">
				{!readOnly && (
					<SheetsToolbar
						style={activeStyle}
						canUndo={history.undo > 0}
						canRedo={history.redo > 0}
						frozenRows={sheet.frozenRows ?? 0}
						frozenCols={sheet.frozenCols ?? 0}
						onAction={runToolbar}
					/>
				)}
				<div className="relative flex h-9 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-2 print:hidden">
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
										fontSize: 13,
										fontFamily: "Arial, Helvetica, sans-serif",
										background: "#ffffff",
										color: GRID_COLORS.text,
									}}
								/>
								{suggestions.length > 0 && <Suggestions items={suggestions} index={suggestionIndex} onPick={acceptSuggestion} style={{ left: editRect.left - 1, top: editRect.top + editRect.height + 2, zIndex: 41 }} />}
							</>
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
			<PrintTable sheetName={sheet.name} lastRow={bounds.lastRow} lastCol={bounds.lastCol} display={display} styleAt={(row, col) => sheet.cells[cellAddress(row, col)]?.style} />
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
function PrintTable({ sheetName, lastRow, lastCol, display, styleAt }: { sheetName: string; lastRow: number; lastCol: number; display: (row: number, col: number) => { text: string; align: string }; styleAt: (row: number, col: number) => CellStyle | undefined }) {
	if (lastRow < 0) return null;
	const rows: number[] = [];
	for (let row = 0; row <= Math.min(lastRow, 5000); row += 1) rows.push(row);
	const cols: number[] = [];
	for (let col = 0; col <= lastCol; col += 1) cols.push(col);
	return (
		<table className="hidden w-full border-collapse text-[10pt] print:table" style={{ color: "#000", background: "#fff" }}>
			<caption className="pb-2 text-left font-semibold">{sheetName}</caption>
			<tbody>
				{rows.map((row) => (
					<tr key={row}>
						{cols.map((col) => {
							const shown = display(row, col);
							const style = styleAt(row, col);
							return (
								<td key={col} style={{ border: "1px solid #ccc", padding: "2px 4px", textAlign: shown.align as "left" | "center" | "right", fontWeight: style?.bold ? 700 : 400, fontStyle: style?.italic ? "italic" : "normal", background: style?.fill, color: style?.color }}>
									{shown.text}
								</td>
							);
						})}
					</tr>
				))}
			</tbody>
		</table>
	);
}
