/** Cell-level edits used by the editor. Pure functions over SpreadsheetContent. */
import type { Cell, CellStyle, Sheet, SpreadsheetContent } from "../types";
import { officeLocalId, SPREADSHEET_DEFAULT_COLS, SPREADSHEET_DEFAULT_ROWS, SPREADSHEET_MAX_COLS, SPREADSHEET_MAX_ROWS } from "../utils";
import { cellAddress } from "./address";
import type { RangeCoord } from "./address";
import { isFormula } from "./formula";
import { shiftFormula } from "./structure";

export function getSheet(content: SpreadsheetContent, sheetId: string | undefined): Sheet {
	return content.sheets.find((sheet) => sheet.id === sheetId) ?? content.sheets[0];
}

export function updateSheet(content: SpreadsheetContent, sheetId: string, update: (sheet: Sheet) => Sheet): SpreadsheetContent {
	return { ...content, sheets: content.sheets.map((sheet) => (sheet.id === sheetId ? update(sheet) : sheet)) };
}

const isEmptyValue = (value: unknown): boolean => value === undefined || value === false || (!!value && typeof value === "object" && Object.values(value).every(isEmptyValue));
const isEmptyStyle = (style: CellStyle | undefined) => !style || Object.values(style).every(isEmptyValue);

/** Drops empty styles and links; null when nothing is left to store. */
export function cleanCell(cell: Cell | undefined): Cell | undefined {
	if (!cell) return undefined;
	const style = isEmptyStyle(cell.style) ? undefined : cell.style;
	const link = cell.link || undefined;
	if (!cell.input && !style && !link) return undefined;
	const next: Cell = { input: cell.input };
	if (style) next.style = style;
	if (link) next.link = link;
	return next;
}

/** Grows the sheet so a cell at (row, col) is inside it. */
function ensureSize(sheet: Sheet, row: number, col: number): Sheet {
	const rowCount = Math.min(SPREADSHEET_MAX_ROWS, Math.max(sheet.rowCount, row + 1));
	const colCount = Math.min(SPREADSHEET_MAX_COLS, Math.max(sheet.colCount, col + 1));
	return rowCount === sheet.rowCount && colCount === sheet.colCount ? sheet : { ...sheet, rowCount, colCount };
}

export function setCellInput(content: SpreadsheetContent, sheetId: string, row: number, col: number, input: string): SpreadsheetContent {
	return updateSheet(content, sheetId, (sheet) => {
		const address = cellAddress(row, col);
		const cells = { ...sheet.cells };
		const next = cleanCell({ ...cells[address], input });
		if (next) cells[address] = next; else delete cells[address];
		return ensureSize({ ...sheet, cells }, row, col);
	});
}

export function forEachCell(range: RangeCoord, visit: (row: number, col: number) => void): void {
	for (let row = range.start.row; row <= range.end.row; row += 1) for (let col = range.start.col; col <= range.end.col; col += 1) visit(row, col);
}

/** Merges a style patch into every cell of the range (undefined values remove that property). */
export function applyStyle(content: SpreadsheetContent, sheetId: string, range: RangeCoord, patch: Partial<CellStyle> | ((current: CellStyle) => Partial<CellStyle>)): SpreadsheetContent {
	return updateSheet(content, sheetId, (sheet) => {
		const cells = { ...sheet.cells };
		forEachCell(range, (row, col) => {
			const address = cellAddress(row, col);
			const current = cells[address];
			const changes = typeof patch === "function" ? patch(current?.style ?? {}) : patch;
			const style: CellStyle = { ...current?.style, ...changes };
			for (const key of Object.keys(style) as (keyof CellStyle)[]) if (isEmptyValue(style[key])) delete style[key];
			const next = cleanCell({ ...current, input: current?.input ?? "", style });
			if (next) cells[address] = next; else delete cells[address];
		});
		return { ...sheet, cells };
	});
}

/** Clears values (and, with `styles`, formatting) in a range. */
export function clearRange(content: SpreadsheetContent, sheetId: string, range: RangeCoord, styles = false): SpreadsheetContent {
	return updateSheet(content, sheetId, (sheet) => {
		const cells = { ...sheet.cells };
		forEachCell(range, (row, col) => {
			const address = cellAddress(row, col);
			if (!cells[address]) return;
			const next = styles ? undefined : cleanCell({ ...cells[address], input: "", link: undefined });
			if (next) cells[address] = next; else delete cells[address];
		});
		return { ...sheet, cells };
	});
}

/** A block of copied cells: inputs, styles and where they came from (to shift relative references). */
export type ClipboardBlock = { rows: { input: string; style?: CellStyle; link?: string }[][]; origin: { row: number; col: number } | null };

export function copyBlock(sheet: Sheet, range: RangeCoord): ClipboardBlock {
	const rows: ClipboardBlock["rows"] = [];
	for (let row = range.start.row; row <= range.end.row; row += 1) {
		const line: ClipboardBlock["rows"][number] = [];
		for (let col = range.start.col; col <= range.end.col; col += 1) {
			const cell = sheet.cells[cellAddress(row, col)];
			line.push(cell?.link ? { input: cell.input, style: cell.style, link: cell.link } : { input: cell?.input ?? "", style: cell?.style });
		}
		rows.push(line);
	}
	return { rows, origin: { ...range.start } };
}

/**
 * Pastes a block at (row, col). Formulas copied from this sheet shift their relative references by the distance
 * moved; plain text pasted from elsewhere (origin null) is taken as typed. A single copied cell pasted onto a
 * larger selection fills it.
 */
export function pasteBlock(content: SpreadsheetContent, sheetId: string, target: RangeCoord, block: ClipboardBlock): { content: SpreadsheetContent; range: RangeCoord } {
	const height = block.rows.length;
	const width = Math.max(0, ...block.rows.map((line) => line.length));
	if (!height || !width) return { content, range: target };
	const fill = height === 1 && width === 1;
	const targetHeight = fill ? target.end.row - target.start.row + 1 : height;
	const targetWidth = fill ? target.end.col - target.start.col + 1 : width;
	const start = target.start;
	const range: RangeCoord = {
		start,
		end: { row: Math.min(SPREADSHEET_MAX_ROWS - 1, start.row + targetHeight - 1), col: Math.min(SPREADSHEET_MAX_COLS - 1, start.col + targetWidth - 1) },
	};
	const next = updateSheet(content, sheetId, (sheet) => {
		const cells = { ...sheet.cells };
		forEachCell(range, (row, col) => {
			const source = block.rows[(row - start.row) % height]?.[(col - start.col) % width] ?? { input: "" };
			let input = source.input;
			if (block.origin && isFormula(input)) {
				const sourceRow = block.origin.row + ((row - start.row) % height);
				const sourceCol = block.origin.col + ((col - start.col) % width);
				input = shiftFormula(input, row - sourceRow, col - sourceCol);
			}
			const address = cellAddress(row, col);
			const cell = cleanCell({ input, style: block.origin ? source.style : cells[address]?.style, link: block.origin ? source.link : undefined });
			if (cell) cells[address] = cell; else delete cells[address];
		});
		return ensureSize({ ...sheet, cells }, range.end.row, range.end.col);
	});
	return { content: next, range };
}

/** Ctrl+D: copies the top row of the range into the rows below it. */
export function fillDown(content: SpreadsheetContent, sheetId: string, range: RangeCoord): SpreadsheetContent {
	const sheet = getSheet(content, sheetId);
	if (range.end.row === range.start.row) {
		if (range.start.row === 0) return content;
		const source = { start: { row: range.start.row - 1, col: range.start.col }, end: { row: range.start.row - 1, col: range.end.col } };
		return pasteBlock(content, sheetId, range, copyBlock(sheet, source)).content;
	}
	const top = { start: range.start, end: { row: range.start.row, col: range.end.col } };
	const below = { start: { row: range.start.row + 1, col: range.start.col }, end: range.end };
	return pasteBlock(content, sheetId, below, copyBlock(sheet, top)).content;
}

export function nextSheetName(content: SpreadsheetContent, base = "Sheet"): string {
	const taken = new Set(content.sheets.map((sheet) => sheet.name.toLowerCase()));
	for (let index = content.sheets.length + 1; ; index += 1) if (!taken.has(`${base}${index}`.toLowerCase())) return `${base}${index}`;
}

export function createSheet(name: string): Sheet {
	return { id: officeLocalId("sh"), name, rowCount: SPREADSHEET_DEFAULT_ROWS, colCount: SPREADSHEET_DEFAULT_COLS, cells: {} };
}

export function addSheet(content: SpreadsheetContent): SpreadsheetContent {
	const sheet = createSheet(nextSheetName(content));
	return { ...content, sheets: [...content.sheets, sheet], activeSheetId: sheet.id };
}

export function duplicateSheet(content: SpreadsheetContent, sheetId: string): SpreadsheetContent {
	const source = content.sheets.find((sheet) => sheet.id === sheetId);
	if (!source) return content;
	const taken = new Set(content.sheets.map((sheet) => sheet.name.toLowerCase()));
	let name = `${source.name} copy`;
	for (let index = 2; taken.has(name.toLowerCase()); index += 1) name = `${source.name} copy ${index}`;
	const copy: Sheet = { ...structuredClone(source), id: officeLocalId("sh"), name };
	const position = content.sheets.indexOf(source) + 1;
	return { ...content, sheets: [...content.sheets.slice(0, position), copy, ...content.sheets.slice(position)], activeSheetId: copy.id };
}

export function moveSheet(content: SpreadsheetContent, sheetId: string, toIndex: number): SpreadsheetContent {
	const from = content.sheets.findIndex((sheet) => sheet.id === sheetId);
	if (from < 0) return content;
	const sheets = [...content.sheets];
	const [sheet] = sheets.splice(from, 1);
	sheets.splice(Math.max(0, Math.min(sheets.length, toIndex)), 0, sheet);
	return { ...content, sheets };
}

/** Builds one sheet from rows of text (CSV import), sized to the data with a little room to grow. */
export function sheetFromRows(rows: string[][], name = "Sheet1"): Sheet {
	const sheet = createSheet(name);
	const height = Math.min(SPREADSHEET_MAX_ROWS, rows.length);
	const width = Math.min(SPREADSHEET_MAX_COLS, Math.max(0, ...rows.map((row) => row.length)));
	for (let row = 0; row < height; row += 1) {
		for (let col = 0; col < Math.min(width, rows[row].length); col += 1) {
			const input = rows[row][col];
			if (input !== "") sheet.cells[cellAddress(row, col)] = { input };
		}
	}
	sheet.rowCount = Math.min(SPREADSHEET_MAX_ROWS, Math.max(SPREADSHEET_DEFAULT_ROWS, height + 20));
	sheet.colCount = Math.min(SPREADSHEET_MAX_COLS, Math.max(SPREADSHEET_DEFAULT_COLS, width + 2));
	return sheet;
}

/** The last row and column that hold anything, for exports. -1 when the sheet is empty. */
export function usedBounds(sheet: Sheet): { lastRow: number; lastCol: number } {
	let lastRow = -1;
	let lastCol = -1;
	for (const address of Object.keys(sheet.cells)) {
		if (!sheet.cells[address]?.input) continue;
		const match = /^([A-Z]+)(\d+)$/.exec(address);
		if (!match) continue;
		let col = 0;
		for (const char of match[1]) col = col * 26 + char.charCodeAt(0) - 64;
		lastCol = Math.max(lastCol, col - 1);
		lastRow = Math.max(lastRow, Number(match[2]) - 1);
	}
	return { lastRow, lastCol };
}


/** A URL a cell may link to: http(s) or mailto. Bare domains get https://. Null for anything else (javascript:, data:). */
export function normalizeLinkUrl(text: string): string | null {
	if (typeof text !== "string") return null;
	const trimmed = text.trim();
	if (!trimmed || /\s/.test(trimmed)) return null;
	const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : /^[^@/]+@[^@/]+\.[^@/]+$/.test(trimmed) ? `mailto:${trimmed}` : `https://${trimmed}`;
	try {
		const url = new URL(candidate);
		if (url.protocol === "mailto:") return candidate;
		if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".")) return url.href;
	} catch {
		return null;
	}
	return null;
}

/** Links a cell (or removes its link with an empty url). `text` replaces its value; an empty cell shows the URL. */
export function setCellLink(content: SpreadsheetContent, sheetId: string, row: number, col: number, url: string | null, text?: string): SpreadsheetContent {
	return updateSheet(content, sheetId, (sheet) => {
		const address = cellAddress(row, col);
		const cells = { ...sheet.cells };
		const current = cells[address];
		const input = text !== undefined && text !== "" ? text : current?.input || (url ?? "");
		const next = cleanCell({ ...current, input, link: url ?? undefined });
		if (next) cells[address] = next; else delete cells[address];
		return ensureSize({ ...sheet, cells }, row, col);
	});
}

/** Paste special, format only: copies the block's styles onto the target, tiling like `pasteBlock`; values stay. */
export function pasteFormats(content: SpreadsheetContent, sheetId: string, target: RangeCoord, block: ClipboardBlock): { content: SpreadsheetContent; range: RangeCoord } {
	const height = block.rows.length;
	const width = Math.max(0, ...block.rows.map((line) => line.length));
	if (!height || !width) return { content, range: target };
	const fill = height === 1 && width === 1;
	const start = target.start;
	const range: RangeCoord = {
		start,
		end: {
			row: Math.min(SPREADSHEET_MAX_ROWS - 1, start.row + (fill ? target.end.row - target.start.row + 1 : height) - 1),
			col: Math.min(SPREADSHEET_MAX_COLS - 1, start.col + (fill ? target.end.col - target.start.col + 1 : width) - 1),
		},
	};
	const next = updateSheet(content, sheetId, (sheet) => {
		const cells = { ...sheet.cells };
		forEachCell(range, (row, col) => {
			const source = block.rows[(row - start.row) % height]?.[(col - start.col) % width];
			const address = cellAddress(row, col);
			const cell = cleanCell({ ...cells[address], input: cells[address]?.input ?? "", style: source?.style });
			if (cell) cells[address] = cell; else delete cells[address];
		});
		return ensureSize({ ...sheet, cells }, range.end.row, range.end.col);
	});
	return { content: next, range };
}
