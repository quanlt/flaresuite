import type { Sheet } from "@/lib/office/types";
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

export function computeLayout(sheet: Sheet, widthOverrides: Record<number, number> = {}): GridLayout {
	const colWidth = (col: number) => widthOverrides[col] ?? sheet.colWidths?.[String(col)] ?? DEFAULT_COL_WIDTH;
	const rowHeight = (row: number) => sheet.rowHeights?.[String(row)] ?? DEFAULT_ROW_HEIGHT;
	const colLefts = new Array<number>(sheet.colCount + 1);
	colLefts[0] = 0;
	for (let col = 0; col < sheet.colCount; col += 1) colLefts[col + 1] = colLefts[col] + colWidth(col);
	const rowTops = new Array<number>(sheet.rowCount + 1);
	rowTops[0] = 0;
	const custom = !!sheet.rowHeights && Object.keys(sheet.rowHeights).length > 0;
	for (let row = 0; row < sheet.rowCount; row += 1) rowTops[row + 1] = rowTops[row] + (custom ? rowHeight(row) : DEFAULT_ROW_HEIGHT);
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
	for (let row = 0; row < frozenRows; row += 1) rows.push(row);
	for (let row = firstRow; row <= lastRow; row += 1) rows.push(row);
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
