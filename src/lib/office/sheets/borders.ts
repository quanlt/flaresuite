/** Cell borders, applied to a range the way the Borders menu of a spreadsheet does. */
import type { CellBorder, CellStyle, SpreadsheetContent } from "../types";
import { cellAddress } from "./address";
import type { RangeCoord } from "./address";
import { applyStyle, forEachCell, getSheet, updateSheet } from "./operations";

export type BorderKind = "all" | "inner" | "horizontal" | "vertical" | "outer" | "left" | "top" | "right" | "bottom" | "none";
type Side = "top" | "right" | "bottom" | "left";

/** Which sides of the cell at (row, col) a border kind draws. Shared edges are drawn once, on the top/left cell side. */
export function borderSides(kind: BorderKind, range: RangeCoord, row: number, col: number): Side[] {
	const first = { row: row === range.start.row, col: col === range.start.col };
	const last = { row: row === range.end.row, col: col === range.end.col };
	const sides: Side[] = [];
	switch (kind) {
		case "all":
			sides.push("top", "left");
			if (last.col) sides.push("right");
			if (last.row) sides.push("bottom");
			break;
		case "inner":
			if (!first.row) sides.push("top");
			if (!first.col) sides.push("left");
			break;
		case "horizontal": if (!first.row) sides.push("top"); break;
		case "vertical": if (!first.col) sides.push("left"); break;
		case "outer":
			if (first.row) sides.push("top");
			if (last.row) sides.push("bottom");
			if (first.col) sides.push("left");
			if (last.col) sides.push("right");
			break;
		case "top": if (first.row) sides.push("top"); break;
		case "bottom": if (last.row) sides.push("bottom"); break;
		case "left": if (first.col) sides.push("left"); break;
		case "right": if (last.col) sides.push("right"); break;
		case "none": break;
	}
	return sides;
}

/** Adds borders to the range, or with "none" removes every border in it and the neighbours' sides facing it. */
export function applyBorders(content: SpreadsheetContent, sheetId: string, range: RangeCoord, kind: BorderKind, border: CellBorder = {}): SpreadsheetContent {
	// A stored side always has a color, so it never looks like an empty style.
	const line: CellBorder = { color: border.color || "#000000" };
	if (border.style && border.style !== "solid") line.style = border.style;
	if (kind === "none") {
		let next = applyStyle(content, sheetId, range, { borders: undefined });
		const sheet = getSheet(next, sheetId);
		const dropSide = (side: Side) => (style: CellStyle): Partial<CellStyle> => (style.borders?.[side] ? { borders: { ...style.borders, [side]: undefined } } : {});
		if (range.start.row > 0) next = applyStyle(next, sheetId, { start: { row: range.start.row - 1, col: range.start.col }, end: { row: range.start.row - 1, col: range.end.col } }, dropSide("bottom"));
		if (range.start.col > 0) next = applyStyle(next, sheetId, { start: { row: range.start.row, col: range.start.col - 1 }, end: { row: range.end.row, col: range.start.col - 1 } }, dropSide("right"));
		if (range.end.row + 1 < sheet.rowCount) next = applyStyle(next, sheetId, { start: { row: range.end.row + 1, col: range.start.col }, end: { row: range.end.row + 1, col: range.end.col } }, dropSide("top"));
		if (range.end.col + 1 < sheet.colCount) next = applyStyle(next, sheetId, { start: { row: range.start.row, col: range.end.col + 1 }, end: { row: range.end.row, col: range.end.col + 1 } }, dropSide("left"));
		return next;
	}
	return updateSheet(content, sheetId, (sheet) => {
		const cells = { ...sheet.cells };
		forEachCell(range, (row, col) => {
			const sides = borderSides(kind, range, row, col);
			if (!sides.length) return;
			const address = cellAddress(row, col);
			const current = cells[address];
			const borders = { ...current?.style?.borders };
			for (const side of sides) borders[side] = { ...line };
			cells[address] = { ...current, input: current?.input ?? "", style: { ...current?.style, borders } };
		});
		return { ...sheet, cells };
	});
}
