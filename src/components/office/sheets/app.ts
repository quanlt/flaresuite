import type { Cell, CellStyle, Sheet, SpreadsheetContent } from "@/lib/office/types";
import { emptyContent, officeLocalId, SPREADSHEET_DEFAULT_COLS, SPREADSHEET_DEFAULT_ROWS } from "@/lib/office/utils";
import { cellAddress } from "@/lib/office/sheets/address";
import { detectDelimiter, parseDelimited, serializeDelimited } from "@/lib/office/sheets/csv";
import { formatCellValue } from "@/lib/office/sheets/format";
import { evaluateWorkbook, isError } from "@/lib/office/sheets/formula";
import type { Workbook } from "@/lib/office/sheets/formula";
import { getSheet, sheetFromRows, usedBounds } from "@/lib/office/sheets/operations";
import type { OfficeAppClient } from "../office-types";
import { downloadBlob, readFileText, safeFileName, stripExtension } from "../office-client-utils";

const HEADER: CellStyle = { bold: true, fill: "#e8f0fe", color: "#174ea6" };

/** Builds a one-sheet workbook from rows of inputs; `styles` maps addresses to formats. */
function templateSheet(name: string, rows: string[][], styles: Record<string, CellStyle> = {}, extra: Partial<Sheet> = {}): SpreadsheetContent {
	const cells: Record<string, Cell> = {};
	rows.forEach((line, row) => line.forEach((input, col) => {
		const address = cellAddress(row, col);
		if (input || styles[address]) cells[address] = styles[address] ? { input, style: styles[address] } : { input };
	}));
	for (const [address, style] of Object.entries(styles)) if (!cells[address]) cells[address] = { input: "", style };
	const id = officeLocalId("sh");
	return { sheets: [{ id, name, rowCount: SPREADSHEET_DEFAULT_ROWS, colCount: SPREADSHEET_DEFAULT_COLS, cells, ...extra }], activeSheetId: id };
}

function styleRange(columns: string, fromRow: number, toRow: number, style: CellStyle): Record<string, CellStyle> {
	const out: Record<string, CellStyle> = {};
	for (const column of columns) for (let row = fromRow; row <= toRow; row += 1) out[`${column}${row}`] = style;
	return out;
}

function budget(): SpreadsheetContent {
	const items = ["Housing", "Food", "Transport", "Utilities", "Health", "Entertainment", "Savings"];
	const planned = [1200, 450, 200, 150, 100, 150, 500];
	const actual = [1200, 520, 180, 160, 40, 210, 500];
	const rows = [["Category", "Planned", "Actual", "Difference"]];
	items.forEach((item, index) => rows.push([item, String(planned[index]), String(actual[index]), `=B${index + 2}-C${index + 2}`]));
	const total = items.length + 2;
	rows.push(["Total", `=SUM(B2:B${total - 1})`, `=SUM(C2:C${total - 1})`, `=B${total}-C${total}`]);
	const currency: CellStyle = { format: "currency" };
	return templateSheet("Budget", rows, {
		...styleRange("ABCD", 1, 1, HEADER),
		...styleRange("BCD", 2, total - 1, currency),
		[`A${total}`]: { bold: true },
		...styleRange("BCD", total, total, { ...currency, bold: true }),
	}, { frozenRows: 1, colWidths: { "0": 160, "1": 110, "2": 110, "3": 110 } });
}

function todo(): SpreadsheetContent {
	const rows = [
		["Task", "Owner", "Due", "Status", "Notes"],
		["Write project brief", "", "2026-12-01", "Done", ""],
		["Review designs", "", "2026-12-05", "In progress", ""],
		["Plan launch", "", "2026-12-12", "Not started", ""],
		["", "", "", "", ""],
	];
	rows[0].push("", "Completed", '=COUNTIF(D2:D500,"Done")/MAX(1,COUNTA(A2:A500))');
	return templateSheet("To-do", rows, {
		...styleRange("ABCDE", 1, 1, HEADER),
		...styleRange("C", 2, 50, { format: "date" }),
		G1: { bold: true },
		H1: { format: "percent", decimals: 0, bold: true },
	}, { frozenRows: 1, colWidths: { "0": 220, "1": 120, "2": 110, "3": 120, "4": 240 } });
}

function invoice(): SpreadsheetContent {
	const rows = [
		["Invoice", "", "", ""],
		["Number", "INV-001", "Date", "=TODAY()"],
		["Bill to", "", "", ""],
		[],
		["Item", "Quantity", "Unit price", "Amount"],
		["Consulting", "10", "120", "=B6*C6"],
		["Design", "4", "90", "=B7*C7"],
		["Hosting", "1", "30", "=B8*C8"],
		["", "", "", '=IF(B9="","",B9*C9)'],
		[],
		["", "", "Subtotal", "=SUM(D6:D9)"],
		["", "", "Tax rate", "10%"],
		["", "", "Tax", "=D11*D12"],
		["", "", "Total", "=D11+D13"],
	];
	const currency: CellStyle = { format: "currency" };
	return templateSheet("Invoice", rows, {
		A1: { bold: true, color: "#174ea6" },
		D2: { format: "date", align: "left" },
		...styleRange("ABCD", 5, 5, HEADER),
		...styleRange("CD", 6, 9, currency),
		D11: currency,
		D12: { format: "percent", decimals: 0 },
		D13: currency,
		C14: { bold: true },
		D14: { ...currency, bold: true },
	}, { colWidths: { "0": 200, "1": 100, "2": 110, "3": 120 } });
}

/** Displayed text of every used cell of a sheet. */
function sheetRows(workbook: Workbook, sheet: Sheet): string[][] {
	const { lastRow, lastCol } = usedBounds(sheet);
	const rows: string[][] = [];
	for (let row = 0; row <= lastRow; row += 1) {
		const line: string[] = [];
		for (let col = 0; col <= lastCol; col += 1) line.push(formatCellValue(workbook.getValue(sheet.id, row, col), sheet.cells[cellAddress(row, col)]?.style).text);
		rows.push(line);
	}
	return rows;
}

function exportDelimited(content: SpreadsheetContent, name: string, delimiter: "," | "\t") {
	const sheet = getSheet(content, content.activeSheetId);
	const text = serializeDelimited(sheetRows(evaluateWorkbook(content), sheet), delimiter);
	const extension = delimiter === "," ? "csv" : "tsv";
	const fileName = content.sheets.length > 1 ? `${name} - ${sheet.name}` : name;
	// A byte order mark makes Excel read UTF-8 (accents, Vietnamese) correctly.
	downloadBlob(new Blob([`﻿${text}`], { type: delimiter === "," ? "text/csv;charset=utf-8" : "text/tab-separated-values;charset=utf-8" }), safeFileName(fileName, extension));
}

const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** Excel 2003 XML (SpreadsheetML): every sheet, computed values, basic styles. Opens in Excel, Numbers and LibreOffice. */
export function toSpreadsheetMl(content: SpreadsheetContent): string {
	const workbook = evaluateWorkbook(content);
	const styles = new Map<string, string>();
	const styleId = (style: CellStyle | undefined) => {
		if (!style) return null;
		const parts: string[] = [];
		if (style.bold || style.italic || style.underline || style.strike || style.color) {
			parts.push(`<Font${style.bold ? ' ss:Bold="1"' : ""}${style.italic ? ' ss:Italic="1"' : ""}${style.underline ? ' ss:Underline="Single"' : ""}${style.strike ? ' ss:StrikeThrough="1"' : ""}${style.color ? ` ss:Color="${xml(style.color)}"` : ""}/>`);
		}
		if (style.fill) parts.push(`<Interior ss:Color="${xml(style.fill)}" ss:Pattern="Solid"/>`);
		if (style.align || style.wrap) parts.push(`<Alignment${style.align ? ` ss:Horizontal="${style.align === "left" ? "Left" : style.align === "center" ? "Center" : "Right"}"` : ""}${style.wrap ? ' ss:WrapText="1"' : ""}/>`);
		const decimals = "0".repeat(Math.max(0, Math.min(10, style.decimals ?? 2)));
		const formats: Record<string, string> = { number: `#,##0${decimals ? `.${decimals}` : ""}`, percent: `0${decimals ? `.${decimals}` : ""}%`, currency: `"$"#,##0${decimals ? `.${decimals}` : ""}`, date: "yyyy-mm-dd" };
		if (style.format && formats[style.format]) parts.push(`<NumberFormat ss:Format="${xml(formats[style.format])}"/>`);
		if (!parts.length) return null;
		const body = parts.join("");
		if (!styles.has(body)) styles.set(body, `s${styles.size + 1}`);
		return styles.get(body)!;
	};
	const sheetXml = content.sheets.map((sheet) => {
		const { lastRow, lastCol } = usedBounds(sheet);
		const columns: string[] = [];
		for (let col = 0; col <= lastCol; col += 1) {
			const width = sheet.colWidths?.[String(col)];
			columns.push(width ? `<Column ss:Index="${col + 1}" ss:Width="${Math.round(width * 0.75)}"/>` : "");
		}
		const rows: string[] = [];
		for (let row = 0; row <= lastRow; row += 1) {
			const cells: string[] = [];
			for (let col = 0; col <= lastCol; col += 1) {
				const cell = sheet.cells[cellAddress(row, col)];
				const value = workbook.getValue(sheet.id, row, col);
				const id = styleId(cell?.style);
				if (value === null || value === "") {
					if (id) cells.push(`<Cell ss:Index="${col + 1}" ss:StyleID="${id}"/>`);
					continue;
				}
				const type = isError(value) ? "Error" : typeof value === "number" ? "Number" : typeof value === "boolean" ? "Boolean" : "String";
				const text = isError(value) ? value.code : typeof value === "boolean" ? (value ? "1" : "0") : String(value);
				cells.push(`<Cell ss:Index="${col + 1}"${id ? ` ss:StyleID="${id}"` : ""}><Data ss:Type="${type}">${xml(text)}</Data></Cell>`);
			}
			rows.push(`<Row ss:Index="${row + 1}">${cells.join("")}</Row>`);
		}
		const frozen = (sheet.frozenRows ?? 0) || (sheet.frozenCols ?? 0)
			? `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/>${sheet.frozenRows ? `<SplitHorizontal>${sheet.frozenRows}</SplitHorizontal><TopRowBottomPane>${sheet.frozenRows}</TopRowBottomPane>` : ""}${sheet.frozenCols ? `<SplitVertical>${sheet.frozenCols}</SplitVertical><LeftColumnRightPane>${sheet.frozenCols}</LeftColumnRightPane>` : ""}</WorksheetOptions>`
			: "";
		return `<Worksheet ss:Name="${xml(sheet.name.slice(0, 31))}"><Table>${columns.join("")}${rows.join("")}</Table>${frozen}</Worksheet>`;
	});
	const styleXml = [...styles.entries()].map(([body, id]) => `<Style ss:ID="${id}">${body}</Style>`).join("");
	return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Arial" ss:Size="10"/></Style>${styleXml}</Styles>${sheetXml.join("")}</Workbook>`;
}

/** Turns CSV or TSV text into a one-sheet workbook. */
export function contentFromDelimited(text: string, delimiter?: "," | "\t"): SpreadsheetContent {
	const rows = parseDelimited(text, delimiter ?? detectDelimiter(text));
	if (!rows.length) return emptyContent("spreadsheet");
	const sheet = sheetFromRows(rows);
	return { sheets: [sheet], activeSheetId: sheet.id };
}

/** Sheets: templates, CSV/TSV import, CSV/TSV/Excel export. */
export const sheetsApp: OfficeAppClient<"spreadsheet"> = {
	kind: "spreadsheet",
	templates: [
		{ id: "budget", labelKey: "sheets.templateBudget", create: budget },
		{ id: "todo", labelKey: "sheets.templateTodo", create: todo },
		{ id: "invoice", labelKey: "sheets.templateInvoice", create: invoice },
	],
	exports: [
		{ id: "csv", labelKey: "sheets.exportCsv", run: (content, name) => exportDelimited(content, name, ",") },
		{ id: "tsv", labelKey: "sheets.exportTsv", run: (content, name) => exportDelimited(content, name, "\t") },
		{ id: "xls", labelKey: "sheets.exportExcel", run: (content, name) => downloadBlob(new Blob([toSpreadsheetMl(content)], { type: "application/vnd.ms-excel" }), safeFileName(name, "xls")) },
	],
	importAccept: ".csv,.tsv,text/csv,text/tab-separated-values",
	importFile: async (file) => {
		const text = await readFileText(file);
		const delimiter = /\.tsv$/i.test(file.name) || file.type === "text/tab-separated-values" ? "\t" : /\.csv$/i.test(file.name) ? "," : undefined;
		return { name: stripExtension(file.name), content: contentFromDelimited(text, delimiter) };
	},
};
