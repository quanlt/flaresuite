import type { CellBorder, CellNumberFormat } from "@/lib/office/types";
import type { CellCoord, RangeCoord } from "@/lib/office/sheets/address";
import type { BorderKind } from "@/lib/office/sheets/borders";
import type { MergeMode } from "@/lib/office/sheets/merge";
import type { Axis } from "@/lib/office/sheets/structure";

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

export type WrapMode = "overflow" | "wrap" | "clip";

/** Everything the toolbar, the header menus and keyboard shortcuts can ask the editor to do. */
export type SheetAction =
	| { type: "undo" }
	| { type: "redo" }
	| { type: "print" }
	| { type: "zoom"; value: number }
	| { type: "format"; format: CellNumberFormat }
	| { type: "decimals"; delta: number }
	| { type: "toggle"; key: "bold" | "italic" | "underline" | "strike" }
	| { type: "wrap"; value: WrapMode }
	| { type: "color"; key: "color" | "fill"; value: string | undefined }
	| { type: "align"; value: "left" | "center" | "right" }
	| { type: "valign"; value: "top" | "middle" | "bottom" }
	| { type: "fontSize"; value: number }
	| { type: "fontFamily"; value: string | undefined }
	| { type: "borders"; kind: BorderKind; color?: string; style?: CellBorder["style"] }
	| { type: "merge"; mode: MergeMode }
	| { type: "unmerge" }
	| { type: "clearFormat" }
	| { type: "freeze"; rows?: number; cols?: number }
	| { type: "insert"; axis: Axis; after: boolean }
	| { type: "delete"; axis: Axis }
	| { type: "insertSheet" }
	| { type: "sort"; ascending: boolean; scope: "sheet" | "range" }
	| { type: "filter" }
	| { type: "removeDuplicates" }
	| { type: "trimWhitespace" }
	| { type: "insertFunction"; name: string }
	| { type: "checkbox" }
	| { type: "link" }
	| { type: "cut" }
	| { type: "copy" }
	| { type: "paste"; mode: "all" | "values" | "format" }
	| { type: "deleteValues" }
	| { type: "find"; replace: boolean }
	| { type: "selectAll" }
	| { type: "gridlines" }
	| { type: "formulaBar" }
	| { type: "showFormulas" };

/** View state that the menus and the toolbar reflect. */
export type SheetViewState = {
	zoom: number;
	showFormulaBar: boolean;
	showFormulas: boolean;
	showGridlines: boolean;
	frozenRows: number;
	frozenCols: number;
	filterOn: boolean;
	merged: boolean;
	canUndo: boolean;
	canRedo: boolean;
	activeRow: number;
	activeCol: number;
};
