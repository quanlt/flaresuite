"use client";

import { memo } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { CellBorder, Sheet } from "@/lib/office/types";
import { cellAddress, columnName } from "@/lib/office/sheets/address";
import type { CellCoord, RangeCoord } from "@/lib/office/sheets/address";
import type { DisplayValue } from "@/lib/office/sheets/format";
import type { GridLayout, VisibleWindow } from "./sheets-editor-types";
import { cellFontFamily, cellFontPx, GRID_COLORS, HEADER_HEIGHT, ROW_HEADER_WIDTH } from "./sheets-editor-utils";

type GridProps = {
	sheet: Sheet;
	layout: GridLayout;
	window: VisibleWindow;
	scroll: { top: number; left: number };
	range: RangeCoord;
	active: CellCoord;
	display: (row: number, col: number) => DisplayValue;
	readOnly: boolean;
	merges: RangeCoord[];
	zoom: number;
	showGridlines: boolean;
	/** The filter range and the columns that currently hide values. */
	filter: { range: RangeCoord; activeCols: Set<number> } | null;
	renderFilterButton?: (col: number, active: boolean) => ReactNode;
	addRowsLabel: string;
	resizeLabel: string;
	selectAllLabel: string;
	onAddRows: () => void;
	onCellMouseDown: (row: number, col: number, event: ReactMouseEvent) => void;
	onCellDoubleClick: (row: number, col: number) => void;
	onToggleCheckbox: (row: number, col: number) => void;
	onHeaderMouseDown: (kind: "row" | "col" | "all", index: number, event: ReactMouseEvent) => void;
	onResizeStart: (col: number, event: ReactPointerEvent) => void;
	children?: ReactNode;
};

const ADD_ROWS_HEIGHT = 48;
const LINK_COLOR = "#1155cc";

/** Where a cell is drawn inside the scrolled canvas; frozen lines move with the scroll so they stay put on screen. */
export function cellRect(sheet: Sheet, layout: GridLayout, scroll: { top: number; left: number }, row: number, col: number) {
	const frozenRow = row < (sheet.frozenRows ?? 0);
	const frozenCol = col < (sheet.frozenCols ?? 0);
	return {
		left: ROW_HEADER_WIDTH + layout.colLefts[col] + (frozenCol ? scroll.left : 0),
		top: HEADER_HEIGHT + layout.rowTops[row] + (frozenRow ? scroll.top : 0),
		width: layout.colWidth(col),
		height: layout.rowTops[row + 1] - layout.rowTops[row],
		frozenRow,
		frozenCol,
	};
}

/** The box of a range (a merged cell), positioned like its top-left cell. */
export function rangeRect(sheet: Sheet, layout: GridLayout, scroll: { top: number; left: number }, range: RangeCoord) {
	const start = cellRect(sheet, layout, scroll, range.start.row, range.start.col);
	return {
		...start,
		width: Math.max(0, layout.colLefts[range.end.col + 1] - layout.colLefts[range.start.col]),
		height: Math.max(0, layout.rowTops[range.end.row + 1] - layout.rowTops[range.start.row]),
	};
}

function borderCss(border: CellBorder | undefined): string | undefined {
	if (!border) return undefined;
	const width = border.style === "thick" ? 2 : 1;
	const line = border.style === "dashed" ? "dashed" : border.style === "dotted" ? "dotted" : "solid";
	return `${width}px ${line} ${border.color || "#000000"}`;
}

function CheckMark({ size }: { size: number }) {
	return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>;
}

function SheetsGridInner(props: GridProps) {
	const { sheet, layout, window: visible, scroll, range, active, display, readOnly, merges, zoom, showGridlines } = props;
	const frozenRows = sheet.frozenRows ?? 0;
	const frozenCols = sheet.frozenCols ?? 0;
	const cells: ReactNode[] = [];
	const gridLine = showGridlines ? GRID_COLORS.line : "transparent";

	// Only merges that reach into the rendered window matter for this frame.
	const firstRow = visible.rows[0] ?? 0;
	const lastRow = visible.rows[visible.rows.length - 1] ?? -1;
	const firstCol = visible.cols[0] ?? 0;
	const lastCol = visible.cols[visible.cols.length - 1] ?? -1;
	const shownMerges = merges.filter((merge) => merge.end.row >= firstRow && merge.start.row <= lastRow && merge.end.col >= firstCol && merge.start.col <= lastCol);
	const mergeOf = (row: number, col: number) => (shownMerges.length ? shownMerges.find((merge) => row >= merge.start.row && row <= merge.end.row && col >= merge.start.col && col <= merge.end.col) ?? null : null);
	const renderedAnchors = new Set<RangeCoord>();

	function renderCell(row: number, col: number, merge: RangeCoord | null, spillWidth?: number) {
		const cell = sheet.cells[cellAddress(row, col)];
		const style = cell?.style;
		const rect = merge ? rangeRect(sheet, layout, scroll, merge) : cellRect(sheet, layout, scroll, row, col);
		const shown = display(row, col);
		const wrap = !!style?.wrap;
		const valign = style?.valign ?? "middle";
		const checkbox = !!style?.checkbox;
		const align = checkbox && !style?.align ? "center" : shown.align;
		const borders = style?.borders;
		const topLeft = borders?.top || borders?.left;
		const pad = Math.max(2, Math.round(4 * zoom));
		const cellStyle: CSSProperties = {
			position: "absolute",
			left: rect.left,
			top: rect.top,
			width: spillWidth ?? rect.width,
			height: rect.height,
			boxSizing: "border-box",
			borderRight: borderCss(borders?.right) ?? `1px solid ${gridLine}`,
			borderBottom: borderCss(borders?.bottom) ?? `1px solid ${gridLine}`,
			background: style?.fill ?? GRID_COLORS.surface,
			color: shown.error ? GRID_COLORS.error : style?.color ?? (cell?.link ? LINK_COLOR : GRID_COLORS.text),
			fontWeight: style?.bold ? 700 : 400,
			fontStyle: style?.italic ? "italic" : "normal",
			fontFamily: cellFontFamily(style),
			textDecoration: [style?.underline || cell?.link ? "underline" : "", style?.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none",
			fontSize: cellFontPx(style, zoom),
			display: "flex",
			alignItems: valign === "top" ? "flex-start" : valign === "bottom" ? "flex-end" : "center",
			justifyContent: align === "left" ? "flex-start" : align === "center" ? "center" : "flex-end",
			padding: wrap ? `${Math.max(1, Math.round(2 * zoom))}px ${pad}px` : `0 ${pad}px`,
			overflow: "hidden",
			zIndex: rect.frozenRow && rect.frozenCol ? 11 : rect.frozenRow || rect.frozenCol ? 10 : merge ? 2 : 1,
			userSelect: "none",
		};
		const checked = shown.text === "TRUE";
		const box = Math.round(14 * zoom);
		cells.push(
			<div
				key={`${row}:${col}`}
				role="gridcell"
				aria-rowindex={row + 1}
				aria-colindex={col + 1}
				aria-selected={row >= range.start.row && row <= range.end.row && col >= range.start.col && col <= range.end.col}
				style={cellStyle}
				onMouseDown={(event) => props.onCellMouseDown(row, col, event)}
				onDoubleClick={() => props.onCellDoubleClick(row, col)}
			>
				{topLeft && <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderTop: borderCss(borders?.top), borderLeft: borderCss(borders?.left), pointerEvents: "none" }} />}
				{checkbox && !shown.error ? (
					<span
						role="checkbox"
						aria-checked={checked}
						onMouseDown={(event) => {
							if (readOnly || event.button !== 0) return;
							event.stopPropagation();
							event.preventDefault();
							props.onToggleCheckbox(row, col);
						}}
						style={{ width: box, height: box, flexShrink: 0, boxSizing: "border-box", borderRadius: 2, border: `2px solid ${checked ? GRID_COLORS.selection : "#5f6368"}`, background: checked ? GRID_COLORS.selection : "#ffffff", color: "#ffffff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: readOnly ? "default" : "pointer" }}
					>
						{checked && <CheckMark size={box - 4} />}
					</span>
				) : (
					<span style={{ whiteSpace: wrap ? "pre-wrap" : "pre", wordBreak: wrap ? "break-word" : undefined, width: wrap ? "100%" : undefined, textAlign: align, lineHeight: 1.25, flexShrink: 0, maxWidth: wrap ? "100%" : undefined }}>{shown.text}</span>
				)}
			</div>,
		);
	}

	for (const row of visible.rows) {
		// Text spills into empty neighbours to the right, like other spreadsheets.
		let coveredUntil = -1;
		for (let index = 0; index < visible.cols.length; index += 1) {
			const col = visible.cols[index];
			const merge = mergeOf(row, col);
			if (merge) {
				if (merge.start.row === row && merge.start.col === col) { renderedAnchors.add(merge); renderCell(row, col, merge); }
				continue;
			}
			const cell = sheet.cells[cellAddress(row, col)];
			const style = cell?.style;
			if (col <= coveredUntil && !cell?.input && !style?.fill && !style?.borders) continue;
			const shown = display(row, col);
			let width = layout.colWidth(col);
			if (shown.text && shown.align === "left" && !style?.wrap && !style?.clip && !style?.checkbox) {
				const needed = (shown.text.length * 7 + 8) * (cellFontPx(style, zoom) / 13);
				for (let next = index + 1; next < visible.cols.length; next += 1) {
					const nextCol = visible.cols[next];
					if (nextCol !== visible.cols[next - 1] + 1 || (nextCol >= frozenCols) !== (col >= frozenCols)) break;
					const neighbour = sheet.cells[cellAddress(row, nextCol)];
					if (neighbour?.input || neighbour?.style?.fill || mergeOf(row, nextCol)) break;
					if (width >= needed) break;
					width += layout.colWidth(nextCol);
					coveredUntil = nextCol;
				}
			}
			renderCell(row, col, null, width);
		}
	}
	// A merge whose top-left cell scrolled out of view still draws over the part that is visible.
	for (const merge of shownMerges) if (!renderedAnchors.has(merge)) renderCell(merge.start.row, merge.start.col, merge);

	// Filter buttons sit at the right of each header cell of the filter range.
	const filterButtons: ReactNode[] = [];
	if (props.filter && props.renderFilterButton) {
		const headerRow = props.filter.range.start.row;
		if (visible.rows.includes(headerRow)) {
			for (const col of visible.cols) {
				if (col < props.filter.range.start.col || col > props.filter.range.end.col) continue;
				const rect = cellRect(sheet, layout, scroll, headerRow, col);
				const size = 18;
				filterButtons.push(
					<div key={`f${col}`} style={{ position: "absolute", left: rect.left + rect.width - size - 3, top: rect.top + Math.max(0, (rect.height - size) / 2), width: size, height: size, zIndex: rect.frozenRow || rect.frozenCol ? 13 : 3 }}>
						{props.renderFilterButton(col, props.filter.activeCols.has(col))}
					</div>,
				);
			}
		}
	}

	const headerBase: CSSProperties = {
		position: "absolute",
		boxSizing: "border-box",
		background: GRID_COLORS.headerBg,
		color: GRID_COLORS.headerText,
		fontSize: 11,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		userSelect: "none",
		cursor: "default",
	};
	const headers: ReactNode[] = [];
	for (const col of visible.cols) {
		const frozen = col < frozenCols;
		const selected = col >= range.start.col && col <= range.end.col;
		const left = ROW_HEADER_WIDTH + layout.colLefts[col] + (frozen ? scroll.left : 0);
		const width = layout.colWidth(col);
		headers.push(
			<div
				key={`c${col}`}
				role="columnheader"
				style={{ ...headerBase, left, top: scroll.top, width, height: HEADER_HEIGHT, borderRight: `1px solid ${GRID_COLORS.headerLine}`, borderBottom: `1px solid ${GRID_COLORS.headerLine}`, background: selected ? GRID_COLORS.headerActiveBg : GRID_COLORS.headerBg, fontWeight: selected ? 600 : 400, zIndex: frozen ? 22 : 21 }}
				onMouseDown={(event) => props.onHeaderMouseDown("col", col, event)}
			>
				{columnName(col)}
				{!readOnly && (
					<span
						role="separator"
						aria-orientation="vertical"
						aria-label={props.resizeLabel}
						onPointerDown={(event) => { event.stopPropagation(); props.onResizeStart(col, event); }}
						onMouseDown={(event) => event.stopPropagation()}
						style={{ position: "absolute", right: -3, top: 0, width: 6, height: "100%", cursor: "col-resize", zIndex: 1 }}
					/>
				)}
			</div>,
		);
	}
	for (const row of visible.rows) {
		const frozen = row < frozenRows;
		const selected = row >= range.start.row && row <= range.end.row;
		const top = HEADER_HEIGHT + layout.rowTops[row] + (frozen ? scroll.top : 0);
		headers.push(
			<div
				key={`r${row}`}
				role="rowheader"
				style={{ ...headerBase, left: scroll.left, top, width: ROW_HEADER_WIDTH, height: layout.rowTops[row + 1] - layout.rowTops[row], borderRight: `1px solid ${GRID_COLORS.headerLine}`, borderBottom: `1px solid ${GRID_COLORS.headerLine}`, background: selected ? GRID_COLORS.headerActiveBg : GRID_COLORS.headerBg, fontWeight: selected ? 600 : 400, zIndex: frozen ? 22 : 21 }}
				onMouseDown={(event) => props.onHeaderMouseDown("row", row, event)}
			>
				{row + 1}
			</div>,
		);
	}

	// Selection: a tinted range and a bold outline on the active cell.
	const startRect = cellRect(sheet, layout, scroll, range.start.row, range.start.col);
	const endRect = cellRect(sheet, layout, scroll, range.end.row, range.end.col);
	const activeMerge = merges.find((merge) => active.row >= merge.start.row && active.row <= merge.end.row && active.col >= merge.start.col && active.col <= merge.end.col);
	const activeRect = activeMerge ? rangeRect(sheet, layout, scroll, activeMerge) : cellRect(sheet, layout, scroll, active.row, active.col);
	const multi = (range.start.row !== range.end.row || range.start.col !== range.end.col) && !(activeMerge && activeMerge.start.row === range.start.row && activeMerge.start.col === range.start.col && activeMerge.end.row === range.end.row && activeMerge.end.col === range.end.col);
	const overlayZ = (rect: ReturnType<typeof cellRect>) => (rect.frozenRow || rect.frozenCol ? 12 : 2);

	return (
		<div
			role="grid"
			aria-rowcount={sheet.rowCount}
			aria-colcount={sheet.colCount}
			style={{ position: "relative", width: ROW_HEADER_WIDTH + layout.totalWidth, height: HEADER_HEIGHT + layout.totalHeight + (readOnly ? 0 : ADD_ROWS_HEIGHT), background: GRID_COLORS.surface }}
		>
			{cells}
			{filterButtons}
			{multi && (
				<div
					aria-hidden="true"
					style={{
						position: "absolute",
						left: startRect.left,
						top: startRect.top,
						width: Math.max(0, endRect.left + endRect.width - startRect.left),
						height: Math.max(0, endRect.top + endRect.height - startRect.top),
						background: GRID_COLORS.selectionFill,
						border: `1px solid ${GRID_COLORS.selection}`,
						pointerEvents: "none",
						zIndex: overlayZ(startRect),
					}}
				/>
			)}
			<div
				aria-hidden="true"
				style={{ position: "absolute", left: activeRect.left - 1, top: activeRect.top - 1, width: activeRect.width + 1, height: activeRect.height + 1, border: `2px solid ${GRID_COLORS.selection}`, pointerEvents: "none", zIndex: overlayZ(activeRect) }}
			/>
			{frozenRows > 0 && <div aria-hidden="true" style={{ position: "absolute", left: scroll.left, top: HEADER_HEIGHT + layout.frozenHeight + scroll.top - 1, width: ROW_HEADER_WIDTH + layout.totalWidth, height: 2, background: GRID_COLORS.headerLine, zIndex: 15, pointerEvents: "none" }} />}
			{frozenCols > 0 && <div aria-hidden="true" style={{ position: "absolute", top: scroll.top, left: ROW_HEADER_WIDTH + layout.frozenWidth + scroll.left - 1, height: HEADER_HEIGHT + layout.totalHeight, width: 2, background: GRID_COLORS.headerLine, zIndex: 15, pointerEvents: "none" }} />}
			{headers}
			<div
				role="button"
				aria-label={props.selectAllLabel}
				style={{ ...headerBase, left: scroll.left, top: scroll.top, width: ROW_HEADER_WIDTH, height: HEADER_HEIGHT, borderRight: `1px solid ${GRID_COLORS.headerLine}`, borderBottom: `1px solid ${GRID_COLORS.headerLine}`, zIndex: 30 }}
				onMouseDown={(event) => props.onHeaderMouseDown("all", 0, event)}
			/>
			{!readOnly && (
				<div style={{ position: "absolute", left: scroll.left + ROW_HEADER_WIDTH + 8, top: HEADER_HEIGHT + layout.totalHeight + 8, zIndex: 5 }}>
					<button type="button" onClick={props.onAddRows} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
						{props.addRowsLabel}
					</button>
				</div>
			)}
			{props.children}
		</div>
	);
}

export const SheetsGrid = memo(SheetsGridInner);
