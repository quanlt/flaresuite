import type { CellStyle, Sheet } from "@/lib/office/types";
import { formatRange } from "@/lib/office/sheets/address";
import type { RangeCoord } from "@/lib/office/sheets/address";
import { isError } from "@/lib/office/sheets/formula";
import type { Workbook } from "@/lib/office/sheets/formula";
import type { GridLayout, SelectionStats, VisibleWindow } from "./sheets-editor-types";

export const DEFAULT_COL_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 24;
export const HEADER_HEIGHT = 24;
export const ROW_HEADER_WIDTH = 48;
export const MIN_COL_WIDTH = 24;
export const ADD_ROWS_STEP = 100;
export const HISTORY_LIMIT = 100;
/** Pixels per point at 100% zoom: 10pt text is about 13px. */
export const PX_PER_PT = 4 / 3;
export const DEFAULT_FONT_PT = 10;
export const ZOOM_LEVELS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2];
export const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 18, 24, 36];
/** `value` undefined is the default font (Arial). */
export const FONT_FAMILIES: { label: string; value: string | undefined }[] = [
	{ label: "Arial", value: undefined },
	{ label: "Calibri", value: "Calibri" },
	{ label: "Comic Sans MS", value: "Comic Sans MS" },
	{ label: "Courier New", value: "Courier New" },
	{ label: "Georgia", value: "Georgia" },
	{ label: "Tahoma", value: "Tahoma" },
	{ label: "Times New Roman", value: "Times New Roman" },
	{ label: "Trebuchet MS", value: "Trebuchet MS" },
	{ label: "Verdana", value: "Verdana" },
];
export const MENU_FUNCTIONS = ["SUM", "AVERAGE", "COUNT", "COUNTA", "MAX", "MIN", "IF", "IFERROR", "ROUND", "CONCATENATE", "VLOOKUP", "TODAY"];

/** CSS font stack of a cell. */
export function cellFontFamily(style: CellStyle | undefined): string {
	return typeof style?.fontFamily === "string" && style.fontFamily ? `"${style.fontFamily.replace(/["\\]/g, "")}", Arial, Helvetica, sans-serif` : "Arial, Helvetica, sans-serif";
}

/** Rendered font size in px for a cell at a zoom level. */
export function cellFontPx(style: CellStyle | undefined, zoom = 1): number {
	const points = style?.fontSize && style.fontSize > 0 && style.fontSize <= 400 ? style.fontSize : DEFAULT_FONT_PT;
	return Math.round(points * PX_PER_PT * zoom * 10) / 10;
}

/** What the Σ menu does with a function: edits the active cell, or writes it below / right of a selected block. */
export function functionInsertion(range: RangeCoord, name: string, rowCount: number, colCount: number): { kind: "edit"; text: string } | { kind: "write"; row: number; col: number; input: string } {
	const single = range.start.row === range.end.row && range.start.col === range.end.col;
	if (single) return { kind: "edit", text: `=${name}(` };
	const text = formatRange(range);
	const oneRow = range.start.row === range.end.row;
	if (oneRow && range.end.col + 1 < colCount) return { kind: "write", row: range.start.row, col: range.end.col + 1, input: `=${name}(${text})` };
	if (range.end.row + 1 < rowCount) return { kind: "write", row: range.end.row + 1, col: range.start.col, input: `=${name}(${text})` };
	return { kind: "edit", text: `=${name}(${text})` };
}


/** Grid colors as inline styles: the dark theme remaps palette classes, but a sheet stays a white sheet. */
export const GRID_COLORS = {
	surface: "#ffffff",
	line: "#e2e3e3",
	headerBg: "#f8f9fa",
	headerActiveBg: "#d3e3fd",
	headerText: "#444746",
	headerLine: "#c4c7c5",
	text: "#202124",
	error: "#d93025",
	selection: "#1a73e8",
	selectionFill: "rgba(26, 115, 232, 0.1)",
	refHighlight: "#188038",
};

/** Line positions at a zoom level. Rows in `hiddenRows` (filtered out) get no height. Overrides are unzoomed widths. */
export function computeLayout(sheet: Sheet, widthOverrides: Record<number, number> = {}, zoom = 1, hiddenRows?: Set<number>): GridLayout {
	const colWidth = (col: number) => Math.round((widthOverrides[col] ?? sheet.colWidths?.[String(col)] ?? DEFAULT_COL_WIDTH) * zoom);
	const rowHeight = (row: number) => (hiddenRows?.has(row) ? 0 : Math.round((sheet.rowHeights?.[String(row)] ?? DEFAULT_ROW_HEIGHT) * zoom));
	const defaultHeight = Math.round(DEFAULT_ROW_HEIGHT * zoom);
	const colLefts = new Array<number>(sheet.colCount + 1);
	colLefts[0] = 0;
	for (let col = 0; col < sheet.colCount; col += 1) colLefts[col + 1] = colLefts[col] + colWidth(col);
	const rowTops = new Array<number>(sheet.rowCount + 1);
	rowTops[0] = 0;
	const custom = (!!sheet.rowHeights && Object.keys(sheet.rowHeights).length > 0) || !!hiddenRows?.size;
	for (let row = 0; row < sheet.rowCount; row += 1) rowTops[row + 1] = rowTops[row] + (custom ? rowHeight(row) : defaultHeight);
	const frozenRows = Math.min(sheet.frozenRows ?? 0, sheet.rowCount);
	const frozenCols = Math.min(sheet.frozenCols ?? 0, sheet.colCount);
	return {
		colLefts,
		rowTops,
		totalWidth: colLefts[sheet.colCount],
		totalHeight: rowTops[sheet.rowCount],
		frozenWidth: colLefts[frozenCols],
		frozenHeight: rowTops[frozenRows],
		colWidth,
		rowHeight,
	};
}

/** Index of the line containing `offset` in a prefix-sum array (binary search). */
export function indexAt(starts: number[], offset: number): number {
	let low = 0;
	let high = starts.length - 2;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if (starts[middle] <= offset) low = middle;
		else high = middle - 1;
	}
	return Math.max(0, low);
}

/** Rows and columns to render for the current scroll position: frozen lines plus the visible scrolled ones. */
export function visibleWindow(sheet: Sheet, layout: GridLayout, scroll: { top: number; left: number }, viewport: { width: number; height: number }, overscan = 2): VisibleWindow {
	const frozenRows = Math.min(sheet.frozenRows ?? 0, sheet.rowCount);
	const frozenCols = Math.min(sheet.frozenCols ?? 0, sheet.colCount);
	const bodyHeight = Math.max(0, viewport.height - HEADER_HEIGHT);
	const bodyWidth = Math.max(0, viewport.width - ROW_HEADER_WIDTH);
	const firstRow = Math.max(frozenRows, indexAt(layout.rowTops, scroll.top + layout.frozenHeight) - overscan);
	const lastRow = Math.min(sheet.rowCount - 1, indexAt(layout.rowTops, scroll.top + bodyHeight) + overscan);
	const firstCol = Math.max(frozenCols, indexAt(layout.colLefts, scroll.left + layout.frozenWidth) - overscan);
	const lastCol = Math.min(sheet.colCount - 1, indexAt(layout.colLefts, scroll.left + bodyWidth) + overscan);
	const rows: number[] = [];
	const shown = (row: number) => layout.rowTops[row + 1] > layout.rowTops[row];
	for (let row = 0; row < frozenRows; row += 1) if (shown(row)) rows.push(row);
	for (let row = firstRow; row <= lastRow; row += 1) if (shown(row)) rows.push(row);
	const cols: number[] = [];
	for (let col = 0; col < frozenCols; col += 1) cols.push(col);
	for (let col = firstCol; col <= lastCol; col += 1) cols.push(col);
	return { rows, cols };
}

export function selectionStats(workbook: Workbook, sheetId: string, range: RangeCoord, maxCells = 200_000): SelectionStats | null {
	const cells = (range.end.row - range.start.row + 1) * (range.end.col - range.start.col + 1);
	if (cells < 2 || cells > maxCells) return null;
	let sum = 0;
	let count = 0;
	let numbers = 0;
	for (let row = range.start.row; row <= range.end.row; row += 1) {
		for (let col = range.start.col; col <= range.end.col; col += 1) {
			const value = workbook.getValue(sheetId, row, col);
			if (value === null || value === "" || isError(value)) continue;
			count += 1;
			if (typeof value === "number") { sum += value; numbers += 1; }
		}
	}
	return { sum, average: numbers ? sum / numbers : null, count, numbers };
}

/** Currency shown by the currency format, from the interface language. */
export function currencyForLocale(locale: string): string {
	const map: Record<string, string> = { vi: "VND", ja: "JPY", "zh-CN": "CNY", ko: "KRW", de: "EUR", fr: "EUR", es: "EUR", it: "EUR", nl: "EUR", "pt-PT": "EUR", "pt-BR": "BRL", ru: "RUB", uk: "UAH", tr: "TRY", pl: "PLN", hi: "INR", id: "IDR", ms: "MYR", th: "THB" };
	return map[locale] ?? "USD";
}

/** Characters after which clicking a cell inserts a reference into the formula being typed. */
export function acceptsReference(value: string, caret: number): boolean {
	if (!value.startsWith("=")) return false;
	const before = value.slice(0, caret).trimEnd();
	return /[=(,+\-*/^&<>:;]$/.test(before);
}

/** The function name being typed right before the caret, if any. */
export function functionPrefix(value: string, caret: number): string | null {
	if (!value.startsWith("=")) return null;
	const match = /(^=|[=(,+\-*/^&<>:;\s])([A-Za-z][A-Za-z0-9.]*)$/.exec(value.slice(0, caret));
	return match ? match[2] : null;
}
