"use client";

import { memo } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { Sheet } from "@/lib/office/types";
import { cellAddress, columnName } from "@/lib/office/sheets/address";
import type { CellCoord, RangeCoord } from "@/lib/office/sheets/address";
import type { DisplayValue } from "@/lib/office/sheets/format";
import type { GridLayout, VisibleWindow } from "./sheets-editor-types";
import { GRID_COLORS, HEADER_HEIGHT, ROW_HEADER_WIDTH } from "./sheets-editor-utils";

type GridProps = {
	sheet: Sheet;
	layout: GridLayout;
	window: VisibleWindow;
	scroll: { top: number; left: number };
	range: RangeCoord;
	active: CellCoord;
	display: (row: number, col: number) => DisplayValue;
	readOnly: boolean;
	addRowsLabel: string;
	resizeLabel: string;
	selectAllLabel: string;
	onAddRows: () => void;
	onCellMouseDown: (row: number, col: number, event: ReactMouseEvent) => void;
	onCellDoubleClick: (row: number, col: number) => void;
	onHeaderMouseDown: (kind: "row" | "col" | "all", index: number, event: ReactMouseEvent) => void;
	onResizeStart: (col: number, event: ReactPointerEvent) => void;
	children?: ReactNode;
};

const ADD_ROWS_HEIGHT = 48;

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

function SheetsGridInner(props: GridProps) {
	const { sheet, layout, window: visible, scroll, range, active, display, readOnly } = props;
	const frozenRows = sheet.frozenRows ?? 0;
	const frozenCols = sheet.frozenCols ?? 0;
	const cells: ReactNode[] = [];

	for (const row of visible.rows) {
		// Text spills into empty neighbours to the right, like other spreadsheets.
		let coveredUntil = -1;
		for (let index = 0; index < visible.cols.length; index += 1) {
			const col = visible.cols[index];
			const cell = sheet.cells[cellAddress(row, col)];
			const style = cell?.style;
			const rect = cellRect(sheet, layout, scroll, row, col);
			const shown = display(row, col);
			let width = rect.width;
			if (col <= coveredUntil && !cell?.input && !style?.fill) continue;
			if (shown.text && shown.align === "left" && !style?.wrap) {
				for (let next = index + 1; next < visible.cols.length; next += 1) {
					const nextCol = visible.cols[next];
					if (nextCol !== visible.cols[next - 1] + 1 || (nextCol >= frozenCols) !== (col >= frozenCols)) break;
					const neighbour = sheet.cells[cellAddress(row, nextCol)];
					if (neighbour?.input || neighbour?.style?.fill) break;
					if (width >= shown.text.length * 8 + 8) break;
					width += layout.colWidth(nextCol);
					coveredUntil = nextCol;
				}
			}
			const cellStyle: CSSProperties = {
				position: "absolute",
				left: rect.left,
				top: rect.top,
				width,
				height: rect.height,
				boxSizing: "border-box",
				borderRight: `1px solid ${GRID_COLORS.line}`,
				borderBottom: `1px solid ${GRID_COLORS.line}`,
				background: style?.fill ?? GRID_COLORS.surface,
				color: shown.error ? GRID_COLORS.error : style?.color ?? GRID_COLORS.text,
				fontWeight: style?.bold ? 700 : 400,
				fontStyle: style?.italic ? "italic" : "normal",
				textDecoration: [style?.underline ? "underline" : "", style?.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none",
				textAlign: shown.align,
				fontSize: 13,
				lineHeight: style?.wrap ? "16px" : `${rect.height - 1}px`,
				padding: style?.wrap ? "3px 4px" : "0 4px",
				whiteSpace: style?.wrap ? "pre-wrap" : "pre",
				wordBreak: style?.wrap ? "break-word" : undefined,
				overflow: "hidden",
				textOverflow: "clip",
				zIndex: rect.frozenRow && rect.frozenCol ? 11 : rect.frozenRow || rect.frozenCol ? 10 : 1,
				userSelect: "none",
			};
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
					{shown.text}
				</div>,
			);
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
	const activeRect = cellRect(sheet, layout, scroll, active.row, active.col);
	const multi = range.start.row !== range.end.row || range.start.col !== range.end.col;
	const overlayZ = (rect: ReturnType<typeof cellRect>) => (rect.frozenRow || rect.frozenCol ? 12 : 2);

	return (
		<div
			role="grid"
			aria-rowcount={sheet.rowCount}
			aria-colcount={sheet.colCount}
			style={{ position: "relative", width: ROW_HEADER_WIDTH + layout.totalWidth, height: HEADER_HEIGHT + layout.totalHeight + (readOnly ? 0 : ADD_ROWS_HEIGHT), background: GRID_COLORS.surface }}
		>
			{cells}
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
