/** Merged cells. A merge is stored as "A1:B2" on the sheet; the top-left cell holds the value and the style. */
import type { Cell, Sheet, SpreadsheetContent } from "../types";
import { cellAddress, formatRange, inRange, parseRange } from "./address";
import type { RangeCoord } from "./address";
import { updateSheet } from "./operations";

export type MergeMode = "all" | "horizontal" | "vertical";

const intersects = (a: RangeCoord, b: RangeCoord) => a.start.row <= b.end.row && b.start.row <= a.end.row && a.start.col <= b.end.col && b.start.col <= a.end.col;
const isSingle = (range: RangeCoord) => range.start.row === range.end.row && range.start.col === range.end.col;

/** The valid merges of a sheet: parsed, inside the sheet, more than one cell, never overlapping (first wins). */
export function sheetMerges(sheet: Sheet): RangeCoord[] {
	if (!Array.isArray(sheet.merges)) return [];
	const merges: RangeCoord[] = [];
	for (const text of sheet.merges) {
		const range = typeof text === "string" ? parseRange(text) : null;
		if (!range || isSingle(range)) continue;
		if (range.end.row >= sheet.rowCount || range.end.col >= sheet.colCount) continue;
		if (merges.some((existing) => intersects(existing, range))) continue;
		merges.push(range);
	}
	return merges;
}

/** The merge covering a cell, if any. */
export function mergeAt(merges: RangeCoord[], row: number, col: number): RangeCoord | null {
	for (const merge of merges) if (inRange(merge, row, col)) return merge;
	return null;
}

/** Grows a range until every merge it touches is fully inside it. */
export function expandToMerges(merges: RangeCoord[], range: RangeCoord): RangeCoord {
	let current = range;
	for (let changed = true; changed;) {
		changed = false;
		for (const merge of merges) {
			if (!intersects(merge, current)) continue;
			const next: RangeCoord = {
				start: { row: Math.min(current.start.row, merge.start.row), col: Math.min(current.start.col, merge.start.col) },
				end: { row: Math.max(current.end.row, merge.end.row), col: Math.max(current.end.col, merge.end.col) },
			};
			if (next.start.row !== current.start.row || next.start.col !== current.start.col || next.end.row !== current.end.row || next.end.col !== current.end.col) {
				current = next;
				changed = true;
			}
		}
	}
	return current;
}

/** Removes every merge that touches the range. */
export function unmergeCells(content: SpreadsheetContent, sheetId: string, range: RangeCoord): SpreadsheetContent {
	return updateSheet(content, sheetId, (sheet) => {
		const kept = sheetMerges(sheet).filter((merge) => !intersects(merge, range)).map(formatRange);
		return { ...sheet, merges: kept.length ? kept : undefined };
	});
}

/**
 * Merges the range: as one block, one merge per row (horizontal) or one per column (vertical). Merges it touches
 * are replaced, and covered cells lose their content, keeping only the top-left value of each new merge.
 */
export function mergeCells(content: SpreadsheetContent, sheetId: string, range: RangeCoord, mode: MergeMode = "all"): SpreadsheetContent {
	const created: RangeCoord[] = [];
	if (mode === "all") created.push(range);
	else if (mode === "horizontal") for (let row = range.start.row; row <= range.end.row; row += 1) created.push({ start: { row, col: range.start.col }, end: { row, col: range.end.col } });
	else for (let col = range.start.col; col <= range.end.col; col += 1) created.push({ start: { row: range.start.row, col }, end: { row: range.end.row, col } });
	const merges = created.filter((merge) => !isSingle(merge));
	if (!merges.length) return content;
	return updateSheet(content, sheetId, (sheet) => {
		const kept = sheetMerges(sheet).filter((merge) => !intersects(merge, range));
		const cells: Record<string, Cell> = { ...sheet.cells };
		for (const merge of merges) {
			for (let row = merge.start.row; row <= merge.end.row; row += 1) {
				for (let col = merge.start.col; col <= merge.end.col; col += 1) {
					if (row !== merge.start.row || col !== merge.start.col) delete cells[cellAddress(row, col)];
				}
			}
		}
		return { ...sheet, cells, merges: [...kept, ...merges].map(formatRange) };
	});
}
