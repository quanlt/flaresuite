/** A1-style addresses. Rows and columns are zero-based internally; "A1" is { row: 0, col: 0 }. */

export type CellCoord = { row: number; col: number };
export type CellRef = CellCoord & { rowAbs: boolean; colAbs: boolean };
export type RangeCoord = { start: CellCoord; end: CellCoord };

/** 0 -> "A", 25 -> "Z", 26 -> "AA", 701 -> "ZZ". */
export function columnName(index: number): string {
	let name = "";
	let value = index + 1;
	while (value > 0) {
		const rest = (value - 1) % 26;
		name = String.fromCharCode(65 + rest) + name;
		value = Math.floor((value - 1) / 26);
	}
	return name;
}

/** "A" -> 0, "ZZ" -> 701. -1 for anything that is not letters. */
export function columnIndex(name: string): number {
	if (!/^[A-Za-z]+$/.test(name)) return -1;
	let value = 0;
	for (const char of name.toUpperCase()) value = value * 26 + (char.charCodeAt(0) - 64);
	return value - 1;
}

export function cellAddress(row: number, col: number): string {
	return `${columnName(col)}${row + 1}`;
}

const REF = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})$/;

/** Parses "B12", "$B$12", "b12". Null when it is not a cell reference. */
export function parseCellRef(text: string): CellRef | null {
	const match = REF.exec(text.trim());
	if (!match) return null;
	const col = columnIndex(match[2]);
	const row = Number(match[4]) - 1;
	if (col < 0 || row < 0) return null;
	return { row, col, colAbs: match[1] === "$", rowAbs: match[3] === "$" };
}

export function parseAddress(text: string): CellCoord | null {
	const ref = parseCellRef(text);
	return ref ? { row: ref.row, col: ref.col } : null;
}

export function formatCellRef(ref: CellRef): string {
	return `${ref.colAbs ? "$" : ""}${columnName(ref.col)}${ref.rowAbs ? "$" : ""}${ref.row + 1}`;
}

export function normalizeRange(a: CellCoord, b: CellCoord): RangeCoord {
	return {
		start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
		end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
	};
}

/** Parses "A1:B3" or a single cell "A1" into a normalized range. */
export function parseRange(text: string): RangeCoord | null {
	const parts = text.trim().split(":");
	if (parts.length === 1) {
		const cell = parseAddress(parts[0]);
		return cell ? { start: cell, end: cell } : null;
	}
	if (parts.length !== 2) return null;
	const a = parseAddress(parts[0]);
	const b = parseAddress(parts[1]);
	return a && b ? normalizeRange(a, b) : null;
}

export function formatRange(range: RangeCoord): string {
	const start = cellAddress(range.start.row, range.start.col);
	const end = cellAddress(range.end.row, range.end.col);
	return start === end ? start : `${start}:${end}`;
}

/** Sheet names that are not plain identifiers must be quoted: 'My Sheet'!A1. */
export function quoteSheetName(name: string): string {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !REF.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/** Splits "Sheet2!A1:B2" / "'My Sheet'!A1" into sheet and range text. */
export function splitSheetRef(text: string): { sheet: string | null; ref: string } {
	const trimmed = text.trim();
	const quoted = /^'((?:[^']|'')+)'!(.+)$/.exec(trimmed);
	if (quoted) return { sheet: quoted[1].replace(/''/g, "'"), ref: quoted[2] };
	const plain = /^([^!']+)!(.+)$/.exec(trimmed);
	if (plain) return { sheet: plain[1], ref: plain[2] };
	return { sheet: null, ref: trimmed };
}

export function inRange(range: RangeCoord, row: number, col: number): boolean {
	return row >= range.start.row && row <= range.end.row && col >= range.start.col && col <= range.end.col;
}
