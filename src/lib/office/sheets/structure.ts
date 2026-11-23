/**
 * Structural edits (insert or delete rows and columns, rename or delete sheets, sort) that keep every formula in
 * the workbook pointing at the same data, as other spreadsheets do. Pure functions returning new content.
 */
import type { Cell, Sheet, SpreadsheetContent } from "../types";
import { SPREADSHEET_MAX_COLS, SPREADSHEET_MAX_ROWS } from "../utils";
import { cellAddress, formatCellRef, parseCellRef, quoteSheetName } from "./address";
import type { CellRef, RangeCoord } from "./address";
import { isFormula, tokenize } from "./formula";

export type Axis = "row" | "col";

/** Replacement for one reference: new text, "#REF!" when it no longer exists, or null to keep it. */
type RefMapper = (sheetName: string | null, start: CellRef, end: CellRef | null) => string | null;

/** Rewrites every cell reference of a formula through `mapper`, leaving all other text untouched. */
export function rewriteReferences(formula: string, mapper: RefMapper): string {
	if (!isFormula(formula)) return formula;
	const body = formula.slice(1);
	let tokens: ReturnType<typeof tokenize>;
	try { tokens = tokenize(body); } catch { return formula; }
	let out = "";
	let cursor = 0;
	for (let index = 0; index < tokens.length; index += 1) {
		let token = tokens[index];
		let sheetName: string | null = null;
		const from = token.start;
		if (token.type === "sheet" && tokens[index + 1]?.type === "ref") { sheetName = token.value; index += 1; token = tokens[index]; }
		if (token.type !== "ref") continue;
		const start = parseCellRef(token.value);
		if (!start) continue;
		let end: CellRef | null = null;
		let to = token.end;
		const refStart = token.start;
		if (tokens[index + 1]?.type === "colon") {
			let endIndex = index + 2;
			if (tokens[endIndex]?.type === "sheet") endIndex += 1;
			const endToken = tokens[endIndex];
			const parsed = endToken?.type === "ref" ? parseCellRef(endToken.value) : null;
			if (parsed) { end = parsed; to = endToken.end; index = endIndex; }
		}
		const replacement = mapper(sheetName, start, end);
		if (replacement === null) continue;
		if (replacement === "#REF!") { out += body.slice(cursor, from) + "#REF!"; }
		else { out += body.slice(cursor, refStart) + replacement; }
		cursor = to;
	}
	return `=${out}${body.slice(cursor)}`;
}

const formatRef = (start: CellRef, end: CellRef | null) => (end ? `${formatCellRef(start)}:${formatCellRef(end)}` : formatCellRef(start));

/** Moves relative references by an offset, for copy, paste and fill. Absolute ($) parts stay put. */
export function shiftFormula(formula: string, rowDelta: number, colDelta: number): string {
	if (!rowDelta && !colDelta) return formula;
	return rewriteReferences(formula, (_sheet, start, end) => {
		const move = (ref: CellRef): CellRef | null => {
			const row = ref.rowAbs ? ref.row : ref.row + rowDelta;
			const col = ref.colAbs ? ref.col : ref.col + colDelta;
			return row < 0 || col < 0 || row >= SPREADSHEET_MAX_ROWS || col >= SPREADSHEET_MAX_COLS ? null : { ...ref, row, col };
		};
		const a = move(start);
		const b = end ? move(end) : null;
		if (!a || (end && !b)) return "#REF!";
		return formatRef(a, b);
	});
}

function refersTo(sheetName: string | null, formulaSheet: Sheet, target: Sheet): boolean {
	return sheetName === null ? formulaSheet.id === target.id : sheetName.toLowerCase() === target.name.toLowerCase();
}

/** Applies `mapper` to references that point into `target`, in every formula of the workbook. */
function rewriteWorkbook(content: SpreadsheetContent, target: Sheet, mapper: (start: CellRef, end: CellRef | null) => string | null): SpreadsheetContent {
	return {
		...content,
		sheets: content.sheets.map((sheet) => {
			let changed = false;
			const cells: Record<string, Cell> = {};
			for (const [address, cell] of Object.entries(sheet.cells)) {
				if (!isFormula(cell.input)) { cells[address] = cell; continue; }
				const input = rewriteReferences(cell.input, (sheetName, start, end) => (refersTo(sheetName, sheet, target) ? mapper(start, end) : null));
				if (input !== cell.input) { changed = true; cells[address] = { ...cell, input }; }
				else cells[address] = cell;
			}
			return changed ? { ...sheet, cells } : sheet;
		}),
	};
}

const coordOf = (ref: CellRef, axis: Axis) => (axis === "row" ? ref.row : ref.col);
const withCoord = (ref: CellRef, axis: Axis, value: number): CellRef => (axis === "row" ? { ...ref, row: value } : { ...ref, col: value });

function remapKeyed(map: Record<string, number> | undefined, mapIndex: (index: number) => number | null): Record<string, number> | undefined {
	if (!map) return map;
	const next: Record<string, number> = {};
	for (const [key, value] of Object.entries(map)) {
		const index = mapIndex(Number(key));
		if (index !== null) next[String(index)] = value;
	}
	return next;
}

function moveCells(sheet: Sheet, axis: Axis, mapIndex: (index: number) => number | null): Record<string, Cell> {
	const cells: Record<string, Cell> = {};
	for (const [address, cell] of Object.entries(sheet.cells)) {
		const ref = parseCellRef(address);
		if (!ref) continue;
		const index = mapIndex(coordOf(ref, axis));
		if (index === null) continue;
		cells[axis === "row" ? cellAddress(index, ref.col) : cellAddress(ref.row, index)] = cell;
	}
	return cells;
}

/** Inserts `count` empty rows or columns before `index`. */
export function insertLines(content: SpreadsheetContent, sheetId: string, axis: Axis, index: number, count = 1): SpreadsheetContent {
	const target = content.sheets.find((sheet) => sheet.id === sheetId);
	if (!target || count < 1) return content;
	const max = axis === "row" ? SPREADSHEET_MAX_ROWS : SPREADSHEET_MAX_COLS;
	const size = axis === "row" ? target.rowCount : target.colCount;
	const added = Math.min(count, max - size);
	if (added < 1) return content;
	const shift = (value: number) => (value >= index ? value + added : value);
	const rewritten = rewriteWorkbook(content, target, (start, end) => {
		const a = withCoord(start, axis, shift(coordOf(start, axis)));
		const b = end ? withCoord(end, axis, shift(coordOf(end, axis))) : null;
		return a.row === start.row && a.col === start.col && (!end || (b!.row === end.row && b!.col === end.col)) ? null : formatRef(a, b);
	});
	return {
		...rewritten,
		sheets: rewritten.sheets.map((sheet) => {
			if (sheet.id !== sheetId) return sheet;
			const mapIndex = (value: number) => { const next = shift(value); return next < max ? next : null; };
			return {
				...sheet,
				cells: moveCells(sheet, axis, mapIndex),
				rowCount: axis === "row" ? sheet.rowCount + added : sheet.rowCount,
				colCount: axis === "col" ? sheet.colCount + added : sheet.colCount,
				rowHeights: axis === "row" ? remapKeyed(sheet.rowHeights, mapIndex) : sheet.rowHeights,
				colWidths: axis === "col" ? remapKeyed(sheet.colWidths, mapIndex) : sheet.colWidths,
			};
		}),
	};
}

/** Deletes `count` rows or columns starting at `index`. References to deleted cells become #REF!. */
export function deleteLines(content: SpreadsheetContent, sheetId: string, axis: Axis, index: number, count = 1): SpreadsheetContent {
	const target = content.sheets.find((sheet) => sheet.id === sheetId);
	if (!target || count < 1) return content;
	const size = axis === "row" ? target.rowCount : target.colCount;
	const removed = Math.min(count, size - index, size - 1);
	if (removed < 1) return content;
	const last = index + removed;
	const mapIndex = (value: number): number | null => (value < index ? value : value >= last ? value - removed : null);
	const rewritten = rewriteWorkbook(content, target, (start, end) => {
		if (!end) {
			const next = mapIndex(coordOf(start, axis));
			if (next === null) return "#REF!";
			return next === coordOf(start, axis) ? null : formatRef(withCoord(start, axis, next), null);
		}
		const lowRef = coordOf(start, axis) <= coordOf(end, axis) ? start : end;
		const highRef = lowRef === start ? end : start;
		const low = coordOf(lowRef, axis);
		const high = coordOf(highRef, axis);
		if (low >= index && high < last) return "#REF!";
		const newLow = low < index ? low : low >= last ? low - removed : index;
		const newHigh = high >= last ? high - removed : high < index ? high : index - 1;
		if (newLow === low && newHigh === high) return null;
		return formatRef(withCoord(lowRef, axis, newLow), withCoord(highRef, axis, newHigh));
	});
	const clampFrozen = (frozen: number | undefined) => (frozen === undefined ? frozen : Math.max(0, frozen - Math.max(0, Math.min(frozen, last) - index)));
	return {
		...rewritten,
		sheets: rewritten.sheets.map((sheet) => {
			if (sheet.id !== sheetId) return sheet;
			return {
				...sheet,
				cells: moveCells(sheet, axis, mapIndex),
				rowCount: axis === "row" ? sheet.rowCount - removed : sheet.rowCount,
				colCount: axis === "col" ? sheet.colCount - removed : sheet.colCount,
				rowHeights: axis === "row" ? remapKeyed(sheet.rowHeights, mapIndex) : sheet.rowHeights,
				colWidths: axis === "col" ? remapKeyed(sheet.colWidths, mapIndex) : sheet.colWidths,
				frozenRows: axis === "row" ? clampFrozen(sheet.frozenRows) : sheet.frozenRows,
				frozenCols: axis === "col" ? clampFrozen(sheet.frozenCols) : sheet.frozenCols,
			};
		}),
	};
}

/** Rewrites "Old!A1" to "New!A1" in every formula, then renames the sheet. */
export function renameSheet(content: SpreadsheetContent, sheetId: string, name: string): SpreadsheetContent {
	const target = content.sheets.find((sheet) => sheet.id === sheetId);
	const trimmed = name.trim();
	if (!target || !trimmed || trimmed === target.name) return content;
	if (content.sheets.some((sheet) => sheet.id !== sheetId && sheet.name.toLowerCase() === trimmed.toLowerCase())) return content;
	const oldName = target.name.toLowerCase();
	const sheets = content.sheets.map((sheet) => {
		let changed = false;
		const cells: Record<string, Cell> = {};
		for (const [address, cell] of Object.entries(sheet.cells)) {
			if (!isFormula(cell.input)) { cells[address] = cell; continue; }
			const input = renameInFormula(cell.input, oldName, trimmed);
			if (input !== cell.input) changed = true;
			cells[address] = input === cell.input ? cell : { ...cell, input };
		}
		const base = changed ? { ...sheet, cells } : sheet;
		return sheet.id === sheetId ? { ...base, name: trimmed } : base;
	});
	return { ...content, sheets };
}

function renameInFormula(formula: string, oldLower: string, name: string): string {
	const body = formula.slice(1);
	let tokens: ReturnType<typeof tokenize>;
	try { tokens = tokenize(body); } catch { return formula; }
	let out = "";
	let cursor = 0;
	for (const token of tokens) {
		if (token.type !== "sheet" || token.value.toLowerCase() !== oldLower) continue;
		out += `${body.slice(cursor, token.start)}${quoteSheetName(name)}!`;
		cursor = token.end;
	}
	return cursor ? `=${out}${body.slice(cursor)}` : formula;
}

/** Removes a sheet (keeping at least one); references to it become #REF!. */
export function deleteSheet(content: SpreadsheetContent, sheetId: string): SpreadsheetContent {
	const target = content.sheets.find((sheet) => sheet.id === sheetId);
	if (!target || content.sheets.length < 2) return content;
	const remaining: SpreadsheetContent = { ...content, sheets: content.sheets.filter((sheet) => sheet.id !== sheetId) };
	const rewritten = {
		...remaining,
		sheets: remaining.sheets.map((sheet) => {
			let changed = false;
			const cells: Record<string, Cell> = {};
			for (const [address, cell] of Object.entries(sheet.cells)) {
				if (!isFormula(cell.input)) { cells[address] = cell; continue; }
				const input = rewriteReferences(cell.input, (sheetName) => (sheetName && sheetName.toLowerCase() === target.name.toLowerCase() ? "#REF!" : null));
				if (input !== cell.input) changed = true;
				cells[address] = input === cell.input ? cell : { ...cell, input };
			}
			return changed ? { ...sheet, cells } : sheet;
		}),
	};
	const activeSheetId = content.activeSheetId === sheetId ? rewritten.sheets[Math.max(0, content.sheets.indexOf(target) - 1)]?.id : content.activeSheetId;
	return { ...rewritten, activeSheetId };
}

/**
 * Sorts the rows of a range by one column, using computed values (`valueAt`). Blank cells go last either way.
 * Relative references inside moved formulas follow their row, as when cutting and pasting the row.
 */
export function sortRange(
	content: SpreadsheetContent,
	sheetId: string,
	range: RangeCoord,
	column: number,
	ascending: boolean,
	valueAt: (row: number, col: number) => number | string | boolean | null,
): SpreadsheetContent {
	const sheet = content.sheets.find((entry) => entry.id === sheetId);
	if (!sheet || range.end.row <= range.start.row) return content;
	const rows: number[] = [];
	for (let row = range.start.row; row <= range.end.row; row += 1) rows.push(row);
	const rank = (value: ReturnType<typeof valueAt>) => (value === null || value === "" ? 3 : typeof value === "number" ? 0 : typeof value === "string" ? 1 : 2);
	const order = [...rows].sort((a, b) => {
		const x = valueAt(a, column);
		const y = valueAt(b, column);
		const blankX = rank(x) === 3;
		const blankY = rank(y) === 3;
		if (blankX || blankY) return blankX === blankY ? a - b : blankX ? 1 : -1;
		let compared = rank(x) - rank(y);
		if (!compared) compared = typeof x === "string" && typeof y === "string" ? x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) : Number(x) - Number(y);
		return (ascending ? compared : -compared) || a - b;
	});
	const cells = { ...sheet.cells };
	for (let row = range.start.row; row <= range.end.row; row += 1) for (let col = range.start.col; col <= range.end.col; col += 1) delete cells[cellAddress(row, col)];
	order.forEach((fromRow, position) => {
		const toRow = range.start.row + position;
		for (let col = range.start.col; col <= range.end.col; col += 1) {
			const cell = sheet.cells[cellAddress(fromRow, col)];
			if (!cell) continue;
			cells[cellAddress(toRow, col)] = isFormula(cell.input) ? { ...cell, input: shiftFormula(cell.input, toRow - fromRow, 0) } : cell;
		}
	});
	return { ...content, sheets: content.sheets.map((entry) => (entry.id === sheetId ? { ...entry, cells } : entry)) };
}
