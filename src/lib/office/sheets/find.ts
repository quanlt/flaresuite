/** Find and replace over a workbook. */
import type { Cell, SpreadsheetContent } from "../types";
import { parseCellRef } from "./address";
import { isFormula } from "./formula";
import { cleanCell } from "./operations";

export type FindOptions = {
	matchCase?: boolean;
	/** The whole cell must match, not just part of it. */
	wholeCell?: boolean;
	/** The query is a regular expression. */
	regex?: boolean;
	/** Searches (and replaces in) formula text instead of the values formulas show. */
	formulas?: boolean;
	/** Limits the search to one sheet. */
	sheetId?: string;
};

export type FindMatch = { sheetId: string; row: number; col: number };

/** A global matcher for the query, or null when it is empty or not a valid regular expression. */
export function findPattern(query: string, options: FindOptions = {}): RegExp | null {
	if (!query) return null;
	const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	try {
		return new RegExp(options.wholeCell ? `^(?:${source})$` : source, options.matchCase ? "g" : "gi");
	} catch {
		return null;
	}
}

function cellsInOrder(cells: Record<string, Cell>) {
	const list: { address: string; row: number; col: number; cell: Cell }[] = [];
	for (const [address, cell] of Object.entries(cells)) {
		const ref = parseCellRef(address);
		if (ref && cell?.input) list.push({ address, row: ref.row, col: ref.col, cell });
	}
	return list.sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * Cells whose text matches, sheet by sheet in row order. Formula cells are matched on what they show
 * (`shownText`), or on their formula with `options.formulas`.
 */
export function findCells(content: SpreadsheetContent, query: string, options: FindOptions = {}, shownText: (sheetId: string, row: number, col: number) => string = () => ""): FindMatch[] {
	const pattern = findPattern(query, options);
	if (!pattern) return [];
	const matches: FindMatch[] = [];
	for (const sheet of content.sheets) {
		if (options.sheetId && sheet.id !== options.sheetId) continue;
		for (const { row, col, cell } of cellsInOrder(sheet.cells)) {
			const text = isFormula(cell.input) && !options.formulas ? shownText(sheet.id, row, col) : cell.input;
			pattern.lastIndex = 0;
			if (pattern.test(text)) matches.push({ sheetId: sheet.id, row, col });
		}
	}
	return matches;
}

/**
 * Replaces matches in typed values (and in formulas with `options.formulas`; formula results are never rewritten).
 * `only` restricts it to those cells, e.g. the current match for "Replace".
 */
export function replaceInCells(content: SpreadsheetContent, query: string, replacement: string, options: FindOptions = {}, only?: FindMatch[]): { content: SpreadsheetContent; count: number } {
	const pattern = findPattern(query, options);
	if (!pattern) return { content, count: 0 };
	const allowed = only ? new Set(only.map((match) => `${match.sheetId}!${match.row}:${match.col}`)) : null;
	let count = 0;
	const sheets = content.sheets.map((sheet) => {
		if (options.sheetId && sheet.id !== options.sheetId) return sheet;
		let cells: Record<string, Cell> | null = null;
		for (const { address, row, col, cell } of cellsInOrder(sheet.cells)) {
			if (allowed && !allowed.has(`${sheet.id}!${row}:${col}`)) continue;
			if (isFormula(cell.input) && !options.formulas) continue;
			pattern.lastIndex = 0;
			if (!pattern.test(cell.input)) continue;
			pattern.lastIndex = 0;
			const input = options.regex ? cell.input.replace(pattern, replacement) : cell.input.replace(pattern, () => replacement);
			if (input === cell.input) continue;
			cells ??= { ...sheet.cells };
			const next = cleanCell({ ...cell, input });
			if (next) cells[address] = next; else delete cells[address];
			count += 1;
		}
		return cells ? { ...sheet, cells } : sheet;
	});
	return { content: count ? { ...content, sheets } : content, count };
}
