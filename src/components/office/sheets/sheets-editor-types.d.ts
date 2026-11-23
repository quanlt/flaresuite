import type { CellCoord, RangeCoord } from "@/lib/office/sheets/address";

export type Selection = { anchor: CellCoord; focus: CellCoord };

export type EditState = {
	row: number;
	col: number;
	value: string;
	/** "enter": started by typing, arrows commit and move. "edit": F2/double-click, arrows move the caret. */
	mode: "enter" | "edit";
	/** Where focus lives while editing. */
	source: "cell" | "bar";
};

/** The reference last inserted into a formula by clicking cells, so dragging or clicking again replaces it. */
export type RefInsertion = { start: number; end: number; anchor: CellCoord };

export type GridLayout = {
	colLefts: number[];
	rowTops: number[];
	totalWidth: number;
	totalHeight: number;
	frozenWidth: number;
	frozenHeight: number;
	colWidth: (col: number) => number;
	rowHeight: (row: number) => number;
};

export type VisibleWindow = { rows: number[]; cols: number[] };

export type SelectionStats = { sum: number; average: number | null; count: number; numbers: number };

export type SelectionRange = RangeCoord;
