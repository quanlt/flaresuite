/** Data tools: remove duplicates, trim whitespace and the basic filter. */
import type { Cell, Sheet, SheetFilter, SpreadsheetContent } from "../types";
import { cellAddress, formatRange, parseRange } from "./address";
import type { RangeCoord } from "./address";
import { isFormula } from "./formula";
import { cleanCell, updateSheet, usedBounds } from "./operations";
import { shiftFormula } from "./structure";

/**
 * Removes rows of the range that repeat an earlier row (compared on `keyAt`, the text of each cell, across
 * `columns` or every column of the range). Remaining rows move up; formulas follow their row.
 */
export function removeDuplicateRows(
	content: SpreadsheetContent,
	sheetId: string,
	range: RangeCoord,
	keyAt: (row: number, col: number) => string,
	options: { columns?: number[]; hasHeader?: boolean; matchCase?: boolean } = {},
): { content: SpreadsheetContent; removed: number } {
	const sheet = content.sheets.find((entry) => entry.id === sheetId);
	if (!sheet) return { content, removed: 0 };
	const columns = options.columns?.length ? options.columns : Array.from({ length: range.end.col - range.start.col + 1 }, (_, index) => range.start.col + index);
	const firstRow = range.start.row + (options.hasHeader ? 1 : 0);
	const seen = new Set<string>();
	const kept: number[] = [];
	for (let row = firstRow; row <= range.end.row; row += 1) {
		const key = columns.map((col) => {
			const text = keyAt(row, col);
			return options.matchCase ? text : text.toLowerCase();
		}).join("\u0000");
		if (seen.has(key)) continue;
		seen.add(key);
		kept.push(row);
	}
	const removed = range.end.row - firstRow + 1 - kept.length;
	if (!removed) return { content, removed: 0 };
	const cells: Record<string, Cell> = { ...sheet.cells };
	for (let row = firstRow; row <= range.end.row; row += 1) for (let col = range.start.col; col <= range.end.col; col += 1) delete cells[cellAddress(row, col)];
	kept.forEach((fromRow, position) => {
		const toRow = firstRow + position;
		for (let col = range.start.col; col <= range.end.col; col += 1) {
			const cell = sheet.cells[cellAddress(fromRow, col)];
			if (!cell) continue;
			cells[cellAddress(toRow, col)] = isFormula(cell.input) ? { ...cell, input: shiftFormula(cell.input, toRow - fromRow, 0) } : cell;
		}
	});
	return { content: { ...content, sheets: content.sheets.map((entry) => (entry.id === sheetId ? { ...entry, cells } : entry)) }, removed };
}

/** Trims leading, trailing and repeated spaces from typed text in the range. Formulas are left alone. */
export function trimWhitespace(content: SpreadsheetContent, sheetId: string, range: RangeCoord): { content: SpreadsheetContent; changed: number } {
	let changed = 0;
	const next = updateSheet(content, sheetId, (sheet) => {
		const cells = { ...sheet.cells };
		for (let row = range.start.row; row <= range.end.row; row += 1) {
			for (let col = range.start.col; col <= range.end.col; col += 1) {
				const address = cellAddress(row, col);
				const cell = cells[address];
				const text = cell?.input ?? "";
				// Formulas are left alone (isFormula would narrow `text` away here).
				if (!text || (text.startsWith("=") && text.length > 1)) continue;
				const input = text.replace(/[ \t ]+/g, " ").trim();
				if (input === text) continue;
				changed += 1;
				const cleaned = cleanCell({ ...cell, input });
				if (cleaned) cells[address] = cleaned; else delete cells[address];
			}
		}
		return { ...sheet, cells };
	});
	return { content: changed ? next : content, changed };
}

/* ---------------- filter ---------------- */

/** The range the filter covers, grown downwards to the last row with data so new rows are filtered too. */
export function filterRange(sheet: Sheet): RangeCoord | null {
	const filter = sheet.filter;
	if (!filter || typeof filter.range !== "string") return null;
	const range = parseRange(filter.range);
	if (!range || range.end.col >= sheet.colCount || range.start.row >= sheet.rowCount) return null;
	const { lastRow } = usedBounds(sheet);
	return { start: range.start, end: { row: Math.min(sheet.rowCount - 1, Math.max(range.end.row, lastRow)), col: range.end.col } };
}

/** Rows hidden by the filter. `textAt` gives the text a cell shows. */
export function filterHiddenRows(sheet: Sheet, textAt: (row: number, col: number) => string): Set<number> {
	const hiddenRows = new Set<number>();
	const range = filterRange(sheet);
	const hidden = sheet.filter?.hidden;
	if (!range || !hidden) return hiddenRows;
	const rules = Object.entries(hidden)
		.map(([key, values]) => ({ col: Number(key), values: new Set(Array.isArray(values) ? values : []) }))
		.filter((rule) => rule.values.size && rule.col >= range.start.col && rule.col <= range.end.col);
	if (!rules.length) return hiddenRows;
	for (let row = range.start.row + 1; row <= range.end.row; row += 1) {
		if (rules.some((rule) => rule.values.has(textAt(row, rule.col)))) hiddenRows.add(row);
	}
	return hiddenRows;
}

/** The distinct values below the header in one filter column, sorted, blank ("") last. */
export function filterValues(sheet: Sheet, col: number, textAt: (row: number, col: number) => string, limit = 1000): string[] {
	const range = filterRange(sheet);
	if (!range) return [];
	const values = new Set<string>();
	for (let row = range.start.row + 1; row <= range.end.row && values.size < limit; row += 1) values.add(textAt(row, col));
	return [...values].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })));
}

export function createFilter(content: SpreadsheetContent, sheetId: string, range: RangeCoord): SpreadsheetContent {
	return updateSheet(content, sheetId, (sheet) => ({ ...sheet, filter: { range: formatRange(range) } }));
}

export function removeFilter(content: SpreadsheetContent, sheetId: string): SpreadsheetContent {
	return updateSheet(content, sheetId, (sheet) => {
		const next = { ...sheet };
		delete next.filter;
		return next;
	});
}

/** Sets which values of a column the filter hides (an empty list shows them all). */
export function setFilterHidden(content: SpreadsheetContent, sheetId: string, col: number, values: string[]): SpreadsheetContent {
	return updateSheet(content, sheetId, (sheet) => {
		if (!sheet.filter) return sheet;
		const hidden = { ...sheet.filter.hidden };
		if (values.length) hidden[String(col)] = values; else delete hidden[String(col)];
		const filter: SheetFilter = { range: sheet.filter.range };
		if (Object.keys(hidden).length) filter.hidden = hidden;
		return { ...sheet, filter };
	});
}
