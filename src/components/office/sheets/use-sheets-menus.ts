"use client";

import { useMemo } from "react";
import type { RefObject } from "react";
import { Bold, CheckSquare2, Copy, Italic, Link2, Plus, RemoveFormatting, RotateCw, Search, Strikethrough, Trash2, Underline, Undo2 } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import type { CellStyle } from "@/lib/office/types";
import { columnName } from "@/lib/office/sheets/address";
import { shortcutLabel, useOfficeMenus } from "../office-menus";
import type { OfficeMenu, OfficeMenuItem } from "../office-menus";
import type { SheetAction, SheetViewState } from "./sheets-editor-types";
import { FONT_FAMILIES, FONT_SIZES, MENU_FUNCTIONS, ZOOM_LEVELS } from "./sheets-editor-utils";
import {
	AlignCenterIcon, AlignLeftIcon, AlignRightIcon, BorderAllIcon, CutIcon, DuplicatesIcon, FilterIcon, FontSizeIcon, FormulaBarIcon, FunctionIcon, GridlinesIcon,
	InsertColIcon, InsertRowIcon, MergeIcon, PasteIcon, SnowflakeIcon, SortAscIcon, SortDescIcon, TextIcon, VAlignMiddleIcon, WrapTextIcon, ZoomIcon,
} from "./sheets-icons";

/**
 * Registers Edit, View, Insert, Format and Data in the shared header. Items call `dispatch.current`, so the menus
 * only rebuild when something they show changes (checked states, undo availability), not on every render.
 */
export function useSheetsMenus({ dispatch, readOnly, view, style }: { dispatch: RefObject<(action: SheetAction) => void>; readOnly: boolean; view: SheetViewState; style: CellStyle }) {
	const { t } = useLanguage();
	const { zoom, showFormulaBar, showFormulas, showGridlines, frozenRows, frozenCols, filterOn, merged, canUndo, canRedo, activeRow, activeCol } = view;
	const { bold, italic, underline, strike, format, align, valign, wrap, clip, fontSize, fontFamily, checkbox } = style;

	const menus = useMemo<OfficeMenu[]>(() => {
		const run = (action: SheetAction) => () => dispatch.current?.(action);
		const item = (id: string, label: string, action: SheetAction, extra: Partial<Extract<OfficeMenuItem, { kind: "item" }>> = {}): OfficeMenuItem => ({ kind: "item", id, label, onSelect: run(action), ...extra });
		const separator: OfficeMenuItem = { kind: "separator" };
		const submenu = (id: string, label: string, items: OfficeMenuItem[], icon?: Extract<OfficeMenuItem, { kind: "submenu" }>["icon"]): OfficeMenuItem => ({ kind: "submenu", id, label, items, icon });

		const zoomMenu = submenu("zoom", t("sheets.zoom"), ZOOM_LEVELS.map((level) => item(`zoom-${level}`, `${Math.round(level * 100)}%`, { type: "zoom", value: level }, { checked: Math.abs(zoom - level) < 0.001 })), ZoomIcon);
		const edit: OfficeMenu = {
			id: "edit",
			label: t("sheets.menuEdit"),
			items: readOnly
				? [
					item("copy", t("sheets.copy"), { type: "copy" }, { icon: Copy, shortcut: shortcutLabel("Mod+C") }),
					separator,
					item("find", t("sheets.find"), { type: "find", replace: false }, { icon: Search, shortcut: shortcutLabel("Mod+F") }),
					item("select-all", t("sheets.selectAll"), { type: "selectAll" }, { shortcut: shortcutLabel("Mod+A") }),
				]
				: [
					item("undo", t("sheets.undoShort"), { type: "undo" }, { icon: Undo2, shortcut: shortcutLabel("Mod+Z"), disabled: !canUndo }),
					item("redo", t("sheets.redoShort"), { type: "redo" }, { icon: RotateCw, shortcut: shortcutLabel("Mod+Y"), disabled: !canRedo }),
					separator,
					item("cut", t("sheets.cut"), { type: "cut" }, { icon: CutIcon, shortcut: shortcutLabel("Mod+X") }),
					item("copy", t("sheets.copy"), { type: "copy" }, { icon: Copy, shortcut: shortcutLabel("Mod+C") }),
					item("paste", t("sheets.paste"), { type: "paste", mode: "all" }, { icon: PasteIcon, shortcut: shortcutLabel("Mod+V") }),
					submenu("paste-special", t("sheets.pasteSpecial"), [
						item("paste-values", t("sheets.pasteValues"), { type: "paste", mode: "values" }, { shortcut: shortcutLabel("Mod+Shift+V") }),
						item("paste-format", t("sheets.pasteFormat"), { type: "paste", mode: "format" }),
					]),
					separator,
					item("delete-values", t("sheets.deleteValues"), { type: "deleteValues" }, { icon: Trash2, shortcut: "Del" }),
					item("delete-rows", t("sheets.deleteRows"), { type: "delete", axis: "row" }),
					item("delete-cols", t("sheets.deleteColumns"), { type: "delete", axis: "col" }),
					separator,
					item("find", t("sheets.findReplace"), { type: "find", replace: true }, { icon: Search, shortcut: shortcutLabel("Mod+H") }),
					item("select-all", t("sheets.selectAll"), { type: "selectAll" }, { shortcut: shortcutLabel("Mod+A") }),
				],
		};

		const freezeRows = [0, 1, 2].map((count) => item(`freeze-r${count}`, count === 0 ? t("sheets.freezeNoRows") : count === 1 ? t("sheets.freezeOneRow") : t("sheets.freezeTwoRows"), { type: "freeze", rows: count }, { checked: frozenRows === count }));
		if (activeRow + 1 > 2) freezeRows.push(item("freeze-r-active", t("sheets.freezeUpToRow", { row: String(activeRow + 1) }), { type: "freeze", rows: activeRow + 1 }, { checked: frozenRows === activeRow + 1 }));
		const freezeCols = [0, 1, 2].map((count) => item(`freeze-c${count}`, count === 0 ? t("sheets.freezeNoColumns") : count === 1 ? t("sheets.freezeOneColumn") : t("sheets.freezeTwoColumns"), { type: "freeze", cols: count }, { checked: frozenCols === count }));
		if (activeCol + 1 > 2) freezeCols.push(item("freeze-c-active", t("sheets.freezeUpToColumn", { column: columnName(activeCol) }), { type: "freeze", cols: activeCol + 1 }, { checked: frozenCols === activeCol + 1 }));
		const view: OfficeMenu = {
			id: "view",
			label: t("sheets.menuView"),
			items: [
				...(readOnly ? [] : [submenu("freeze", t("sheets.freeze"), [...freezeRows, separator, ...freezeCols], SnowflakeIcon), separator]),
				submenu("show", t("sheets.show"), [
					...(readOnly ? [] : [item("gridlines", t("sheets.showGridlines"), { type: "gridlines" }, { checked: showGridlines, icon: GridlinesIcon })]),
					item("formula-bar", t("sheets.formulaBar"), { type: "formulaBar" }, { checked: showFormulaBar, icon: FormulaBarIcon }),
					item("formulas", t("sheets.showFormulas"), { type: "showFormulas" }, { checked: showFormulas, shortcut: shortcutLabel("Mod+`") }),
				]),
				zoomMenu,
			],
		};
		if (readOnly) return [edit, view];

		const insert: OfficeMenu = {
			id: "insert",
			label: t("sheets.menuInsert"),
			items: [
				item("row-above", t("sheets.insertRowAbove"), { type: "insert", axis: "row", after: false }, { icon: InsertRowIcon }),
				item("row-below", t("sheets.insertRowBelow"), { type: "insert", axis: "row", after: true }),
				item("col-left", t("sheets.insertColumnLeft"), { type: "insert", axis: "col", after: false }, { icon: InsertColIcon }),
				item("col-right", t("sheets.insertColumnRight"), { type: "insert", axis: "col", after: true }),
				separator,
				item("sheet", t("sheets.addSheet"), { type: "insertSheet" }, { icon: Plus, shortcut: "Shift+F11" }),
				separator,
				submenu("function", t("sheets.functions"), MENU_FUNCTIONS.map((name) => item(`fn-${name}`, name, { type: "insertFunction", name })), FunctionIcon),
				separator,
				item("checkbox", t("sheets.checkbox"), { type: "checkbox" }, { icon: CheckSquare2, checked: !!checkbox }),
				item("link", t("sheets.link"), { type: "link" }, { icon: Link2, shortcut: shortcutLabel("Mod+K") }),
			],
		};

		const currentFormat = format ?? "general";
		const numberFormats: { value: NonNullable<CellStyle["format"]>; label: string; shortcut?: string }[] = [
			{ value: "general", label: t("sheets.formatGeneral") },
			{ value: "text", label: t("sheets.formatText") },
			{ value: "number", label: t("sheets.formatNumber"), shortcut: shortcutLabel("Mod+Shift+1") },
			{ value: "percent", label: t("sheets.formatPercent"), shortcut: shortcutLabel("Mod+Shift+5") },
			{ value: "currency", label: t("sheets.formatCurrency"), shortcut: shortcutLabel("Mod+Shift+4") },
			{ value: "date", label: t("sheets.formatDate"), shortcut: shortcutLabel("Mod+Shift+3") },
			{ value: "time", label: t("sheets.formatTime"), shortcut: shortcutLabel("Mod+Shift+2") },
		];
		const wrapMode = wrap ? "wrap" : clip ? "clip" : "overflow";
		const formatMenu: OfficeMenu = {
			id: "format",
			label: t("sheets.menuFormat"),
			items: [
				submenu("number", t("sheets.formatNumber"), [
					...numberFormats.map((entry) => item(`nf-${entry.value}`, entry.label, { type: "format", format: entry.value }, { checked: currentFormat === entry.value, shortcut: entry.shortcut })),
					separator,
					item("decimals-more", t("sheets.decimalsMore"), { type: "decimals", delta: 1 }),
					item("decimals-less", t("sheets.decimalsLess"), { type: "decimals", delta: -1 }),
				]),
				submenu("text", t("sheets.text"), [
					item("bold", t("sheets.textBold"), { type: "toggle", key: "bold" }, { icon: Bold, checked: !!bold, shortcut: shortcutLabel("Mod+B") }),
					item("italic", t("sheets.textItalic"), { type: "toggle", key: "italic" }, { icon: Italic, checked: !!italic, shortcut: shortcutLabel("Mod+I") }),
					item("underline", t("sheets.textUnderline"), { type: "toggle", key: "underline" }, { icon: Underline, checked: !!underline, shortcut: shortcutLabel("Mod+U") }),
					item("strike", t("sheets.strikethrough"), { type: "toggle", key: "strike" }, { icon: Strikethrough, checked: !!strike, shortcut: shortcutLabel("Alt+Shift+5") }),
				], TextIcon),
				submenu("font", t("sheets.font"), FONT_FAMILIES.map((entry) => item(`font-${entry.label}`, entry.label, { type: "fontFamily", value: entry.value }, { checked: (fontFamily ?? undefined) === entry.value }))),
				submenu("font-size", t("sheets.fontSize"), FONT_SIZES.map((size) => item(`size-${size}`, String(size), { type: "fontSize", value: size }, { checked: (fontSize ?? 10) === size })), FontSizeIcon),
				separator,
				submenu("align", t("sheets.alignment"), [
					item("align-left", t("sheets.alignLeft"), { type: "align", value: "left" }, { icon: AlignLeftIcon, checked: align === "left", shortcut: shortcutLabel("Mod+Shift+L") }),
					item("align-center", t("sheets.alignCenter"), { type: "align", value: "center" }, { icon: AlignCenterIcon, checked: align === "center", shortcut: shortcutLabel("Mod+Shift+E") }),
					item("align-right", t("sheets.alignRight"), { type: "align", value: "right" }, { icon: AlignRightIcon, checked: align === "right", shortcut: shortcutLabel("Mod+Shift+R") }),
					separator,
					item("valign-top", t("sheets.valignTop"), { type: "valign", value: "top" }, { checked: valign === "top" }),
					item("valign-middle", t("sheets.valignMiddle"), { type: "valign", value: "middle" }, { checked: !valign || valign === "middle" }),
					item("valign-bottom", t("sheets.valignBottom"), { type: "valign", value: "bottom" }, { checked: valign === "bottom" }),
				], VAlignMiddleIcon),
				submenu("wrapping", t("sheets.wrapping"), [
					item("wrap-overflow", t("sheets.wrapOverflow"), { type: "wrap", value: "overflow" }, { checked: wrapMode === "overflow" }),
					item("wrap-wrap", t("sheets.wrapWrap"), { type: "wrap", value: "wrap" }, { checked: wrapMode === "wrap" }),
					item("wrap-clip", t("sheets.wrapClip"), { type: "wrap", value: "clip" }, { checked: wrapMode === "clip" }),
				], WrapTextIcon),
				submenu("merge", t("sheets.merge"), [
					item("merge-all", t("sheets.mergeAll"), { type: "merge", mode: "all" }),
					item("merge-h", t("sheets.mergeHorizontal"), { type: "merge", mode: "horizontal" }),
					item("merge-v", t("sheets.mergeVertical"), { type: "merge", mode: "vertical" }),
					item("unmerge", t("sheets.unmerge"), { type: "unmerge" }, { disabled: !merged }),
				], MergeIcon),
				submenu("borders", t("sheets.borders"), [
					item("b-all", t("sheets.borderAll"), { type: "borders", kind: "all" }),
					item("b-inner", t("sheets.borderInner"), { type: "borders", kind: "inner" }),
					item("b-outer", t("sheets.borderOuter"), { type: "borders", kind: "outer" }, { shortcut: shortcutLabel("Alt+Shift+7") }),
					item("b-h", t("sheets.borderHorizontal"), { type: "borders", kind: "horizontal" }),
					item("b-v", t("sheets.borderVertical"), { type: "borders", kind: "vertical" }),
					separator,
					item("b-top", t("sheets.borderTop"), { type: "borders", kind: "top" }),
					item("b-bottom", t("sheets.borderBottom"), { type: "borders", kind: "bottom" }),
					item("b-left", t("sheets.borderLeft"), { type: "borders", kind: "left" }),
					item("b-right", t("sheets.borderRight"), { type: "borders", kind: "right" }),
					separator,
					item("b-none", t("sheets.borderNone"), { type: "borders", kind: "none" }, { shortcut: shortcutLabel("Alt+Shift+6") }),
				], BorderAllIcon),
				separator,
				item("clear-format", t("sheets.clearFormatting"), { type: "clearFormat" }, { icon: RemoveFormatting, shortcut: shortcutLabel("Mod+\\") }),
			],
		};

		const data: OfficeMenu = {
			id: "data",
			label: t("sheets.menuData"),
			items: [
				item("sort-sheet-asc", t("sheets.sortSheetAsc"), { type: "sort", ascending: true, scope: "sheet" }, { icon: SortAscIcon }),
				item("sort-sheet-desc", t("sheets.sortSheetDesc"), { type: "sort", ascending: false, scope: "sheet" }, { icon: SortDescIcon }),
				item("sort-range-asc", t("sheets.sortRangeAsc"), { type: "sort", ascending: true, scope: "range" }),
				item("sort-range-desc", t("sheets.sortRangeDesc"), { type: "sort", ascending: false, scope: "range" }),
				separator,
				item("filter", filterOn ? t("sheets.removeFilter") : t("sheets.createFilter"), { type: "filter" }, { icon: FilterIcon, shortcut: shortcutLabel("Mod+Shift+F") }),
				separator,
				item("dedupe", t("sheets.removeDuplicates"), { type: "removeDuplicates" }, { icon: DuplicatesIcon }),
				item("trim", t("sheets.trimWhitespace"), { type: "trimWhitespace" }),
			],
		};
		return [edit, view, insert, formatMenu, data];
	}, [t, dispatch, readOnly, zoom, showFormulaBar, showFormulas, showGridlines, frozenRows, frozenCols, filterOn, merged, canUndo, canRedo, activeRow, activeCol, bold, italic, underline, strike, format, align, valign, wrap, clip, fontSize, fontFamily, checkbox]);

	useOfficeMenus(menus);
}
