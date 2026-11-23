import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(root, "node_modules", "flaresuite-office-sheets-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: [
			`export * from "./src/lib/office/sheets/address.ts";`,
			`export * from "./src/lib/office/sheets/formula.ts";`,
			`export * from "./src/lib/office/sheets/structure.ts";`,
			`export * from "./src/lib/office/sheets/format.ts";`,
			`export * from "./src/lib/office/sheets/csv.ts";`,
			`export * from "./src/lib/office/sheets/operations.ts";`,
			`export * from "./src/lib/office/sheets/merge.ts";`,
			`export * from "./src/lib/office/sheets/borders.ts";`,
			`export * from "./src/lib/office/sheets/find.ts";`,
			`export * from "./src/lib/office/sheets/data.ts";`,
			`export { toSpreadsheetMl, contentFromDelimited } from "./src/components/office/sheets/app.ts";`,
			`export { validateOfficeContent, parseEnvelope, createEnvelope } from "./src/lib/office/utils.ts";`,
		].join("\n"),
		resolveDir: root,
		sourcefile: "office-sheets-entry.ts",
	},
	outfile: join(directory, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
	packages: "external",
	logLevel: "silent",
});
const S = await import(pathToFileURL(join(directory, "entry.mjs")).href);

function workbook(cellsBySheet) {
	const sheets = Object.entries(cellsBySheet).map(([name, cells], index) => ({
		id: `s${index + 1}`, name, rowCount: 100, colCount: 26,
		cells: Object.fromEntries(Object.entries(cells).map(([address, input]) => [address, { input }])),
	}));
	return { sheets, activeSheetId: "s1" };
}
const value = (content, address, sheetId = "s1") => {
	const ref = S.parseAddress(address);
	return S.evaluateWorkbook(content, new Date(2026, 10, 23, 12, 0, 0)).getValue(sheetId, ref.row, ref.col);
};
const shown = (v) => S.valueToText(v);
const calc = (formula, cells = {}) => shown(value(workbook({ Sheet1: { ...cells, Z99: formula } }), "Z99"));

test("column names and addresses round-trip", () => {
	assert.equal(S.columnName(0), "A");
	assert.equal(S.columnName(25), "Z");
	assert.equal(S.columnName(26), "AA");
	assert.equal(S.columnName(701), "ZZ");
	assert.equal(S.columnIndex("ZZ"), 701);
	assert.equal(S.columnIndex("a"), 0);
	assert.deepEqual(S.parseCellRef("$B$12"), { row: 11, col: 1, colAbs: true, rowAbs: true });
	assert.equal(S.formatCellRef({ row: 2, col: 2, colAbs: false, rowAbs: true }), "C$3");
	assert.deepEqual(S.parseRange("C3:A1"), { start: { row: 0, col: 0 }, end: { row: 2, col: 2 } });
	assert.equal(S.formatRange({ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }), "A1");
	assert.deepEqual(S.splitSheetRef("'My ''Sheet'''!A1:B2"), { sheet: "My 'Sheet'", ref: "A1:B2" });
	assert.equal(S.quoteSheetName("Sheet1"), "Sheet1");
	assert.equal(S.quoteSheetName("My Sheet"), "'My Sheet'");
	assert.equal(S.quoteSheetName("A1"), "'A1'");
});

test("literals: numbers, percents, booleans and forced text", () => {
	assert.equal(S.parseLiteral("12.5"), 12.5);
	assert.equal(S.parseLiteral("1,234.5"), 1234.5);
	assert.equal(S.parseLiteral("50%"), 0.5);
	assert.equal(S.parseLiteral("TRUE"), true);
	assert.equal(S.parseLiteral("'123"), "123");
	assert.equal(S.parseLiteral(""), null);
	assert.equal(S.parseLiteral("hello"), "hello");
});

test("arithmetic, precedence and operators", () => {
	assert.equal(calc("=1+2*3"), "7");
	assert.equal(calc("=(1+2)*3"), "9");
	assert.equal(calc("=2^3^2"), "64");
	assert.equal(calc("=-2^2"), "4");
	assert.equal(calc("=10/4"), "2.5");
	assert.equal(calc("=50%*10"), "5");
	assert.equal(calc('="a"&"b"&1'), "ab1");
	assert.equal(calc("=1<2"), "TRUE");
	assert.equal(calc('="abc"="ABC"'), "TRUE");
	assert.equal(calc("=1<>1"), "FALSE");
	assert.equal(calc("=0.1+0.2"), "0.3");
	assert.equal(calc("=A1*2", { A1: "21" }), "42");
	assert.equal(calc("=A1+1"), "1");
});

test("errors", () => {
	assert.equal(calc("=1/0"), "#DIV/0!");
	assert.equal(calc('="a"+1'), "#VALUE!");
	assert.equal(calc("=NOPE(1)"), "#NAME?");
	assert.equal(calc("=foo"), "#NAME?");
	assert.equal(calc("=1+"), "#ERROR!");
	assert.equal(calc("=Missing!A1"), "#REF!");
	assert.equal(calc("=A1+1", { A1: "=1/0" }), "#DIV/0!");
	const cycle = workbook({ Sheet1: { A1: "=B1", B1: "=A1+1", C1: "=A1" } });
	assert.equal(shown(value(cycle, "A1")), "#CYCLE!");
	assert.equal(shown(value(cycle, "C1")), "#CYCLE!");
	assert.equal(shown(value(workbook({ Sheet1: { A1: "=A1" } }), "A1")), "#CYCLE!");
});

test("aggregates over ranges skip text and blanks", () => {
	const cells = { A1: "1", A2: "2", A3: "x", A4: "", A5: "4" };
	assert.equal(calc("=SUM(A1:A5)", cells), "7");
	assert.equal(calc("=SUM(A1:A5, 10, \"3\")", cells), "20");
	assert.equal(calc("=AVERAGE(A1:A5)", cells), "2.33333333333");
	assert.equal(calc("=MIN(A1:A5)", cells), "1");
	assert.equal(calc("=MAX(A1:A5)", cells), "4");
	assert.equal(calc("=COUNT(A1:A5)", cells), "3");
	assert.equal(calc("=COUNTA(A1:A5)", cells), "4");
	assert.equal(calc("=PRODUCT(A1:A5)", cells), "8");
	assert.equal(calc("=MEDIAN(A1:A5)", cells), "2");
	assert.equal(calc("=AVERAGE(B1:B3)"), "#DIV/0!");
});

test("conditional aggregates and criteria", () => {
	const cells = { A1: "apple", A2: "banana", A3: "apple", A4: "cherry", B1: "10", B2: "20", B3: "30", B4: "40" };
	assert.equal(calc('=COUNTIF(A1:A4,"apple")', cells), "2");
	assert.equal(calc('=COUNTIF(B1:B4,">15")', cells), "3");
	assert.equal(calc('=COUNTIF(A1:A4,"<>apple")', cells), "2");
	assert.equal(calc('=COUNTIF(A1:A4,"*an*")', cells), "1");
	assert.equal(calc('=SUMIF(A1:A4,"apple",B1:B4)', cells), "40");
	assert.equal(calc('=SUMIF(B1:B4,">=30")', cells), "70");
	assert.equal(calc('=AVERAGEIF(A1:A4,"apple",B1:B4)', cells), "20");
});

test("logic functions", () => {
	assert.equal(calc('=IF(1>2,"yes","no")'), "no");
	assert.equal(calc("=IF(TRUE,1/0,2)"), "#DIV/0!");
	assert.equal(calc("=IF(FALSE,1/0,2)"), "2");
	assert.equal(calc('=IFS(1>2,"a",2>1,"b")'), "b");
	assert.equal(calc("=IFS(FALSE,1)"), "#N/A");
	assert.equal(calc('=IFERROR(1/0,"oops")'), "oops");
	assert.equal(calc("=IFERROR(5,0)"), "5");
	assert.equal(calc("=AND(TRUE,1,2>1)"), "TRUE");
	assert.equal(calc("=OR(FALSE,0)"), "FALSE");
	assert.equal(calc("=NOT(0)"), "TRUE");
});

test("math functions", () => {
	assert.equal(calc("=ROUND(2.345,2)"), "2.35");
	assert.equal(calc("=ROUND(-2.5,0)"), "-3");
	assert.equal(calc("=ROUND(1234,-2)"), "1200");
	assert.equal(calc("=ROUNDUP(2.301,1)"), "2.4");
	assert.equal(calc("=ROUNDDOWN(2.399,1)"), "2.3");
	assert.equal(calc("=ABS(-3)"), "3");
	assert.equal(calc("=SQRT(16)"), "4");
	assert.equal(calc("=SQRT(-1)"), "#NUM!");
	assert.equal(calc("=POWER(2,10)"), "1024");
	assert.equal(calc("=MOD(-3,2)"), "1");
	assert.equal(calc("=MOD(1,0)"), "#DIV/0!");
	assert.equal(calc("=INT(-1.5)"), "-2");
});

test("text functions", () => {
	assert.equal(calc('=CONCAT("a",1,TRUE)'), "a1TRUE");
	assert.equal(calc("=CONCATENATE(A1:A2)", { A1: "x", A2: "y" }), "xy");
	assert.equal(calc('=TEXTJOIN(", ",TRUE,A1:A3)', { A1: "a", A3: "c" }), "a, c");
	assert.equal(calc('=LEN("hello")'), "5");
	assert.equal(calc('=LEFT("hello",2)'), "he");
	assert.equal(calc('=RIGHT("hello",3)'), "llo");
	assert.equal(calc('=MID("hello",2,3)'), "ell");
	assert.equal(calc('=UPPER("abc")'), "ABC");
	assert.equal(calc('=LOWER("ABC")'), "abc");
	assert.equal(calc('=PROPER("hello wORLD")'), "Hello World");
	assert.equal(calc('=TRIM("  a   b  ")'), "a b");
	assert.equal(calc('=SUBSTITUTE("a-b-c","-","+")'), "a+b+c");
	assert.equal(calc('=SUBSTITUTE("a-b-c","-","+",2)'), "a-b+c");
	assert.equal(calc('=FIND("l","hello")'), "3");
	assert.equal(calc('=FIND("z","hello")'), "#VALUE!");
	assert.equal(calc('=VALUE("12.5")+1'), "13.5");
	assert.equal(calc('=TEXT(1234.567,"#,##0.00")'), "1,234.57");
	assert.equal(calc('=TEXT(0.256,"0.0%")'), "25.6%");
	assert.equal(calc('=TEXT(DATE(2026,1,5),"yyyy-mm-dd")'), "2026-01-05");
});

test("date functions use serial numbers", () => {
	assert.equal(calc("=DATE(2026,11,23)"), String(S.dateToSerial(2026, 11, 23)));
	assert.equal(calc("=TODAY()"), String(S.dateToSerial(2026, 11, 23)));
	assert.equal(calc("=YEAR(DATE(2024,2,29))"), "2024");
	assert.equal(calc("=MONTH(DATE(2024,2,29))"), "2");
	assert.equal(calc("=DAY(DATE(2024,2,29))"), "29");
	assert.equal(calc("=NOW()-TODAY()"), "0.5");
	assert.equal(S.dateToSerial(1900, 3, 1), 61);
});

test("lookup functions", () => {
	const cells = { A1: "1", B1: "one", A2: "2", B2: "two", A3: "3", B3: "three", D1: "x", E1: "y", D2: "10", E2: "20" };
	assert.equal(calc("=VLOOKUP(2,A1:B3,2,FALSE)", cells), "two");
	assert.equal(calc("=VLOOKUP(2.5,A1:B3,2)", cells), "two");
	assert.equal(calc("=VLOOKUP(9,A1:B3,2,FALSE)", cells), "#N/A");
	assert.equal(calc("=VLOOKUP(2,A1:B3,5,FALSE)", cells), "#REF!");
	assert.equal(calc('=HLOOKUP("y",D1:E2,2,FALSE)', cells), "20");
	assert.equal(calc("=INDEX(A1:B3,3,2)", cells), "three");
	assert.equal(calc("=INDEX(B1:B3,2)", cells), "two");
	assert.equal(calc('=MATCH("three",B1:B3,0)', cells), "3");
	assert.equal(calc("=MATCH(2.7,A1:A3,1)", cells), "2");
	assert.equal(calc("=INDEX(B1:B3,MATCH(3,A1:A3,0))", cells), "three");
});

test("cross-sheet references", () => {
	const content = workbook({ Sheet1: { A1: "=Data!A1*2", A2: "='My Data'!B2+1", A3: "=SUM(Data!A1:A2)" }, Data: { A1: "5", A2: "7" }, "My Data": { B2: "9" } });
	assert.equal(value(content, "A1"), 10);
	assert.equal(value(content, "A2"), 10);
	assert.equal(value(content, "A3"), 12);
});

test("long chains of formulas evaluate without overflowing the stack", () => {
	const cells = { A1: "1" };
	for (let row = 2; row <= 3000; row += 1) cells[`A${row}`] = `=A${row - 1}+1`;
	const content = { sheets: [{ id: "s1", name: "Sheet1", rowCount: 3000, colCount: 26, cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { input: v }])) }] };
	const started = performance.now();
	const book = S.evaluateWorkbook(content);
	assert.equal(book.getValue("s1", 2999, 0), 3000);
	assert.ok(performance.now() - started < 2000);
});

test("shiftFormula moves relative references only", () => {
	assert.equal(S.shiftFormula("=A1+$B$1+C$1+$D1", 2, 1), "=B3+$B$1+D$1+$D3");
	assert.equal(S.shiftFormula("=SUM(A1:B2)", 1, 0), "=SUM(A2:B3)");
	assert.equal(S.shiftFormula("=Data!A1", 1, 1), "=Data!B2");
	assert.equal(S.shiftFormula("=A1", -1, 0), "=#REF!");
	assert.equal(S.shiftFormula('="A1"&A1', 1, 0), '="A1"&A2');
});

test("inserting rows moves cells and rewrites references in every sheet", () => {
	const content = workbook({ Sheet1: { A1: "1", A2: "2", A3: "=SUM(A1:A2)", B1: "=A2" }, Other: { A1: "=Sheet1!A2", B1: "=A2" } });
	const next = S.insertLines(content, "s1", "row", 1, 2);
	const sheet = next.sheets[0];
	assert.equal(sheet.rowCount, 102);
	assert.equal(sheet.cells.A1.input, "1");
	assert.equal(sheet.cells.A4.input, "2");
	assert.equal(sheet.cells.A5.input, "=SUM(A1:A4)");
	assert.equal(sheet.cells.B1.input, "=A4");
	assert.equal(next.sheets[1].cells.A1.input, "=Sheet1!A4");
	// A reference without a sheet on another sheet points there, not here.
	assert.equal(next.sheets[1].cells.B1.input, "=A2");
	assert.equal(value(next, "A5"), 3);
});

test("inserting columns shifts absolute references too", () => {
	const content = workbook({ Sheet1: { A1: "=$B$1+C1", B1: "1", C1: "2" } });
	const next = S.insertLines(content, "s1", "col", 1, 1);
	assert.equal(next.sheets[0].cells.A1.input, "=$C$1+D1");
	assert.equal(next.sheets[0].cells.C1.input, "1");
	assert.equal(next.sheets[0].colCount, 27);
});

test("deleting rows shrinks ranges and turns lost references into #REF!", () => {
	const content = workbook({ Sheet1: { A1: "1", A2: "2", A3: "3", A4: "4", B1: "=SUM(A1:A4)", B2: "=A2", B3: "=A4", B4: "=SUM(A2:A3)" } });
	const next = S.deleteLines(content, "s1", "row", 1, 2);
	const cells = next.sheets[0].cells;
	assert.equal(next.sheets[0].rowCount, 98);
	assert.equal(cells.A2.input, "4");
	assert.equal(cells.B1.input, "=SUM(A1:A2)");
	assert.equal(cells.B2.input, "=SUM(#REF!)");
	assert.equal(cells.A3, undefined);
	assert.equal(value(next, "B1"), 5);
});

test("deleting a column referenced by another sheet", () => {
	const content = workbook({ Sheet1: { A1: "1", B1: "2", C1: "3" }, Other: { A1: "=Sheet1!B1", A2: "=Sheet1!C1", A3: "=SUM(Sheet1!A1:C1)" } });
	const next = S.deleteLines(content, "s1", "col", 1, 1);
	const other = next.sheets[1].cells;
	assert.equal(other.A1.input, "=#REF!");
	assert.equal(other.A2.input, "=Sheet1!B1");
	assert.equal(other.A3.input, "=SUM(Sheet1!A1:B1)");
	assert.equal(value(next, "A3", "s2"), 4);
});

test("renaming and deleting sheets rewrite references", () => {
	const content = workbook({ Sheet1: { A1: "=Data!A1+SUM(Data!A1:A2)", A2: "=data!A1" }, Data: { A1: "1", A2: "2" } });
	const renamed = S.renameSheet(content, "s2", "My Data");
	assert.equal(renamed.sheets[1].name, "My Data");
	assert.equal(renamed.sheets[0].cells.A1.input, "='My Data'!A1+SUM('My Data'!A1:A2)");
	assert.equal(renamed.sheets[0].cells.A2.input, "='My Data'!A1");
	assert.equal(value(renamed, "A1"), 4);
	assert.equal(S.renameSheet(content, "s2", "sheet1"), content, "names must stay unique");
	const deleted = S.deleteSheet(renamed, "s2");
	assert.equal(deleted.sheets.length, 1);
	assert.equal(deleted.sheets[0].cells.A1.input, "=#REF!+SUM(#REF!)");
	assert.equal(S.deleteSheet(deleted, "s1"), deleted, "the last sheet stays");
});

test("sorting a range by computed values keeps blanks last", () => {
	const content = workbook({ Sheet1: { A1: "3", B1: "c", A2: "", B2: "blank", A3: "1", B3: "a", A4: "2", B4: "=A4*10" } });
	const book = S.evaluateWorkbook(content);
	const valueAt = (row, col) => { const v = book.getValue("s1", row, col); return S.isError(v) ? null : v; };
	const range = { start: { row: 0, col: 0 }, end: { row: 3, col: 1 } };
	const sorted = S.sortRange(content, "s1", range, 0, true, valueAt).sheets[0].cells;
	assert.deepEqual([sorted.A1?.input, sorted.A2?.input, sorted.A3?.input, sorted.A4?.input], ["1", "2", "3", ""]);
	assert.equal(sorted.B2.input, "=A2*10");
	assert.equal(sorted.B4.input, "blank");
	const descending = S.sortRange(content, "s1", range, 0, false, valueAt).sheets[0].cells;
	assert.deepEqual([descending.A1?.input, descending.A2?.input, descending.A3?.input], ["3", "2", "1"]);
});

test("display formats", () => {
	assert.equal(S.formatCellValue(1234.5, { format: "number" }).text, "1,234.50");
	assert.equal(S.formatCellValue(0.125, { format: "percent", decimals: 1 }).text, "12.5%");
	assert.equal(S.formatCellValue(9.5, { format: "currency" }).text, "$9.50");
	assert.equal(S.formatCellValue(S.dateToSerial(2026, 3, 4), { format: "date" }).text, "2026-03-04");
	assert.equal(S.formatCellValue(5, undefined).align, "right");
	assert.equal(S.formatCellValue("x", undefined).align, "left");
	assert.equal(S.formatCellValue(5, { align: "center" }).align, "center");
	assert.equal(S.formatCellValue(1.23456, { decimals: 2 }).text, "1.23");
	assert.equal(S.formatCellValue(true, undefined).text, "TRUE");
});

test("CSV and TSV round-trip quotes, commas and newlines", () => {
	const rows = [["a", "b,c", 'say "hi"'], ["line\nbreak", "", " pad "]];
	const csv = S.serializeCsv(rows);
	assert.equal(csv, 'a,"b,c","say ""hi"""\r\n"line\nbreak",," pad "');
	assert.deepEqual(S.parseCsv(csv), rows);
	assert.deepEqual(S.parseTsv("a\tb\r\nc\td\n"), [["a", "b"], ["c", "d"]]);
	assert.deepEqual(S.parseCsv("﻿x,y"), [["x", "y"]]);
	assert.equal(S.detectDelimiter("a\tb\nc"), "\t");
	assert.equal(S.detectDelimiter("a,b"), ",");
});

test("copy and paste shift formulas; a single cell fills a selection", () => {
	const content = workbook({ Sheet1: { A1: "1", A2: "2", B1: "=A1*2" } });
	const block = S.copyBlock(content.sheets[0], { start: { row: 0, col: 1 }, end: { row: 0, col: 1 } });
	const { content: pasted, range } = S.pasteBlock(content, "s1", { start: { row: 1, col: 1 }, end: { row: 3, col: 1 } }, block);
	assert.deepEqual(range, { start: { row: 1, col: 1 }, end: { row: 3, col: 1 } });
	assert.equal(pasted.sheets[0].cells.B2.input, "=A2*2");
	assert.equal(pasted.sheets[0].cells.B4.input, "=A4*2");
	const external = { rows: [[{ input: "=A1" }, { input: "x" }]], origin: null };
	const outside = S.pasteBlock(content, "s1", { start: { row: 5, col: 0 }, end: { row: 5, col: 0 } }, external).content;
	assert.equal(outside.sheets[0].cells.A6.input, "=A1");
	assert.equal(outside.sheets[0].cells.B6.input, "x");
	const filled = S.fillDown(content, "s1", { start: { row: 0, col: 1 }, end: { row: 2, col: 1 } });
	assert.equal(filled.sheets[0].cells.B3.input, "=A3*2");
});

test("sheet management helpers", () => {
	let content = workbook({ Sheet1: { A1: "1" } });
	content = S.addSheet(content);
	assert.equal(content.sheets[1].name, "Sheet2");
	assert.equal(content.activeSheetId, content.sheets[1].id);
	content = S.duplicateSheet(content, "s1");
	assert.equal(content.sheets[1].name, "Sheet1 copy");
	assert.equal(content.sheets[1].cells.A1.input, "1");
	content = S.moveSheet(content, "s1", 2);
	assert.deepEqual(content.sheets.map((sheet) => sheet.name), ["Sheet1 copy", "Sheet2", "Sheet1"]);
	const styled = S.applyStyle(content, "s1", { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } }, { bold: true });
	const sheet1 = styled.sheets.find((sheet) => sheet.id === "s1");
	assert.deepEqual(sheet1.cells.A2, { input: "", style: { bold: true } });
	const cleared = S.clearRange(styled, "s1", { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } });
	assert.deepEqual(cleared.sheets.find((sheet) => sheet.id === "s1").cells.A1, { input: "", style: { bold: true } });
	const imported = S.sheetFromRows([["a", "b"], ["1"]]);
	assert.equal(imported.cells.A1.input, "a");
	assert.equal(imported.cells.A2.input, "1");
	assert.deepEqual(S.usedBounds(imported), { lastRow: 1, lastCol: 1 });
});

/* ---------------- editor features: formats, merges, borders, find, data tools ---------------- */

const range = (text) => S.parseRange(text);

test("time format shows the time of day of a serial", () => {
	assert.equal(S.formatCellValue(0.5, { format: "time" }).text, "12:00:00");
	assert.equal(S.formatCellValue(45000.75, { format: "time" }).text, "18:00:00");
});

test("merging keeps the top-left value, replaces touched merges and unmerges", () => {
	let content = workbook({ Sheet1: { A1: "top", B1: "gone", A2: "gone too" } });
	content = S.mergeCells(content, "s1", range("A1:B2"));
	const sheet = content.sheets[0];
	assert.deepEqual(sheet.merges, ["A1:B2"]);
	assert.equal(sheet.cells.A1.input, "top");
	assert.equal(sheet.cells.B1, undefined);
	assert.equal(sheet.cells.A2, undefined);
	assert.deepEqual(S.mergeAt(S.sheetMerges(sheet), 1, 1), range("A1:B2"));
	assert.deepEqual(S.expandToMerges(S.sheetMerges(sheet), range("B2:C3")), range("A1:C3"));
	const rows = S.mergeCells(content, "s1", range("A1:C2"), "horizontal");
	assert.deepEqual(rows.sheets[0].merges, ["A1:C1", "A2:C2"]);
	assert.equal(S.unmergeCells(content, "s1", range("B2")).sheets[0].merges, undefined);
});

test("invalid or overlapping stored merges are ignored", () => {
	const sheet = { id: "s1", name: "S", rowCount: 10, colCount: 5, cells: {}, merges: ["A1:B2", "B2:C3", "nonsense", "A5", "A1:Z1"] };
	assert.deepEqual(S.sheetMerges(sheet), [range("A1:B2")]);
});

test("inserting and deleting lines moves merges and the filter", () => {
	let content = workbook({ Sheet1: { A1: "h" } });
	content = S.mergeCells(content, "s1", range("B2:C3"));
	content = S.createFilter(content, "s1", range("A1:D10"));
	content = S.setFilterHidden(content, "s1", 3, ["x"]);
	let moved = S.insertLines(content, "s1", "row", 0, 2);
	assert.deepEqual(moved.sheets[0].merges, ["B4:C5"]);
	assert.equal(moved.sheets[0].filter.range, "A3:D12");
	moved = S.insertLines(content, "s1", "col", 0, 1);
	assert.deepEqual(moved.sheets[0].merges, ["C2:D3"]);
	assert.deepEqual(moved.sheets[0].filter.hidden, { 4: ["x"] });
	const deleted = S.deleteLines(content, "s1", "row", 1, 1);
	assert.deepEqual(deleted.sheets[0].merges, ["B2:C2"]);
	assert.equal(deleted.sheets[0].filter.range, "A1:D9");
	assert.equal(S.deleteLines(content, "s1", "row", 1, 2).sheets[0].merges, undefined);
});

test("borders: all, outer and none", () => {
	let content = workbook({ Sheet1: {} });
	content = S.applyBorders(content, "s1", range("A1:B2"), "all");
	const cells = content.sheets[0].cells;
	assert.deepEqual(Object.keys(cells.A1.style.borders).sort(), ["left", "top"]);
	assert.deepEqual(Object.keys(cells.B2.style.borders).sort(), ["bottom", "left", "right", "top"]);
	assert.equal(cells.A1.style.borders.top.color, "#000000");
	const outer = S.applyBorders(workbook({ Sheet1: {} }), "s1", range("A1:C3"), "outer", { color: "#ff0000", style: "dashed" });
	assert.equal(outer.sheets[0].cells.B2, undefined);
	assert.deepEqual(outer.sheets[0].cells.B1.style.borders, { top: { color: "#ff0000", style: "dashed" } });
	const cleared = S.applyBorders(content, "s1", range("A1:B2"), "none");
	assert.deepEqual(cleared.sheets[0].cells, {});
});

test("find matches values, formulas on request, and replace leaves formulas alone", () => {
	const content = workbook({ Sheet1: { A1: "Apple pie", A2: "apple", B1: "=UPPER(A2)" }, Two: { C3: "pineapple" } });
	const shown = (sheetId, row, col) => S.valueToText(S.evaluateWorkbook(content).getValue(sheetId, row, col));
	assert.deepEqual(S.findCells(content, "apple", {}, shown).map((m) => `${m.sheetId}:${m.row}:${m.col}`), ["s1:0:0", "s1:0:1", "s1:1:0", "s2:2:2"]);
	assert.equal(S.findCells(content, "apple", { matchCase: true, sheetId: "s1" }, shown).length, 1);
	assert.equal(S.findCells(content, "apple", { wholeCell: true }, shown).length, 2);
	assert.equal(S.findCells(content, "upper", { formulas: true }, shown).length, 1);
	assert.equal(S.findCells(content, "(", { regex: true }, shown).length, 0);
	const replaced = S.replaceInCells(content, "apple", "pear", {});
	assert.equal(replaced.count, 3);
	assert.equal(replaced.content.sheets[0].cells.A1.input, "pear pie");
	assert.equal(replaced.content.sheets[0].cells.B1.input, "=UPPER(A2)");
	assert.equal(replaced.content.sheets[1].cells.C3.input, "pinepear");
	const one = S.replaceInCells(content, "apple", "x", {}, [{ sheetId: "s1", row: 1, col: 0 }]);
	assert.equal(one.count, 1);
	assert.equal(one.content.sheets[0].cells.A1.input, "Apple pie");
	assert.equal(S.replaceInCells(content, "$", "x", {}).count, 0);
});

test("remove duplicates keeps the first row and moves the rest up", () => {
	const content = workbook({ Sheet1: { A1: "Name", A2: "a", B2: "1", A3: "A", B3: "1", A4: "b", B4: "2", C4: "=B4*2" } });
	const text = (row, col) => content.sheets[0].cells[S.cellAddress(row, col)]?.input ?? "";
	const result = S.removeDuplicateRows(content, "s1", range("A1:C4"), text, { hasHeader: true });
	assert.equal(result.removed, 1);
	const cells = result.content.sheets[0].cells;
	assert.equal(cells.A1.input, "Name");
	assert.equal(cells.A3.input, "b");
	assert.equal(cells.C3.input, "=B3*2");
	assert.equal(cells.A4, undefined);
	assert.equal(S.removeDuplicateRows(content, "s1", range("A1:C4"), text, { hasHeader: true, matchCase: true }).removed, 0);
});

test("trim whitespace", () => {
	const result = S.trimWhitespace(workbook({ Sheet1: { A1: "  a   b ", A2: "=  1", A3: "ok" } }), "s1", range("A1:A3"));
	assert.equal(result.changed, 1);
	assert.equal(result.content.sheets[0].cells.A1.input, "a b");
	assert.equal(result.content.sheets[0].cells.A2.input, "=  1");
});

test("filter hides rows by value and grows with the data", () => {
	let content = workbook({ Sheet1: { A1: "Fruit", A2: "apple", A3: "pear", A4: "apple", A5: "" , A6: "fig" } });
	content = S.createFilter(content, "s1", range("A1:A3"));
	content = S.setFilterHidden(content, "s1", 0, ["apple"]);
	const sheet = content.sheets[0];
	const text = (row, col) => sheet.cells[S.cellAddress(row, col)]?.input ?? "";
	assert.deepEqual(S.filterRange(sheet), range("A1:A6"));
	assert.deepEqual([...S.filterHiddenRows(sheet, text)].sort(), [1, 3]);
	assert.deepEqual(S.filterValues(sheet, 0, text), ["apple", "fig", "pear", ""]);
	assert.equal(S.setFilterHidden(content, "s1", 0, []).sheets[0].filter.hidden, undefined);
	assert.equal(S.removeFilter(content, "s1").sheets[0].filter, undefined);
});

test("links: only http(s) and mailto, kept through clearing styles but not values", () => {
	assert.equal(S.normalizeLinkUrl("example.com/a"), "https://example.com/a");
	assert.equal(S.normalizeLinkUrl("me@example.com"), "mailto:me@example.com");
	assert.equal(S.normalizeLinkUrl("javascript:alert(1)"), null);
	assert.equal(S.normalizeLinkUrl("data:text/html,x"), null);
	assert.equal(S.normalizeLinkUrl("not a url"), null);
	let content = S.setCellLink(workbook({ Sheet1: {} }), "s1", 0, 0, "https://example.com/", "Site");
	assert.deepEqual(content.sheets[0].cells.A1, { input: "Site", link: "https://example.com/" });
	content = S.applyStyle(content, "s1", range("A1"), { bold: true });
	assert.equal(content.sheets[0].cells.A1.link, "https://example.com/");
	const block = S.copyBlock(content.sheets[0], range("A1"));
	assert.equal(S.pasteBlock(content, "s1", range("B1"), block).content.sheets[0].cells.B1.link, "https://example.com/");
	assert.equal(S.clearRange(content, "s1", range("A1")).sheets[0].cells.A1.link, undefined);
});

test("new cell and sheet properties survive a save round trip and the Excel export", () => {
	let content = workbook({ Sheet1: { A1: "Title", A2: "=1/24", B3: "TRUE" } });
	content = S.mergeCells(content, "s1", range("A1:C1"));
	content = S.applyBorders(content, "s1", range("A2:B3"), "outer", { style: "thick", color: "#ff0000" });
	content = S.applyStyle(content, "s1", range("A2"), { format: "time", valign: "top", fontSize: 14, fontFamily: "Georgia", clip: true });
	content = S.applyStyle(content, "s1", range("B3"), { checkbox: true });
	content = S.setCellLink(content, "s1", 3, 0, "https://example.com/", "Site");
	content = S.createFilter(content, "s1", range("A2:B4"));
	content.sheets[0].hideGridlines = true;
	assert.equal(S.validateOfficeContent("spreadsheet", content), null);
	const saved = S.parseEnvelope("spreadsheet", JSON.stringify(S.createEnvelope("spreadsheet", content, 3)));
	assert.deepEqual(saved.content, content);
	const xml = S.toSpreadsheetMl(content);
	assert.match(xml, /ss:MergeAcross="2"/);
	assert.match(xml, /<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#ff0000"\/>/);
	assert.match(xml, /ss:FontName="Georgia" ss:Size="14"/);
	assert.match(xml, /ss:Vertical="Top"/);
	assert.match(xml, /ss:Format="hh:mm:ss"/);
	assert.match(xml, /ss:HRef="https:\/\/example.com\/"/);
	assert.match(xml, /<Data ss:Type="Boolean">1<\/Data>/);
	assert.doesNotMatch(xml, /ss:Index="2"[^>]*><Data ss:Type="String">/);
});

test("documents saved before these features still load and export", () => {
	const old = { sheets: [{ id: "s1", name: "Old", rowCount: 10, colCount: 5, cells: { A1: { input: "1", style: { bold: true, wrap: true, format: "currency" } } }, frozenRows: 1 }], activeSheetId: "s1" };
	assert.equal(S.validateOfficeContent("spreadsheet", old), null);
	assert.deepEqual(S.sheetMerges(old.sheets[0]), []);
	assert.equal(S.filterRange(old.sheets[0]), null);
	assert.match(S.toSpreadsheetMl(old), /<Data ss:Type="Number">1<\/Data>/);
});
