import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(root, "node_modules", "flaresuite-office-core-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: { contents: `export * from "./src/lib/office/utils.ts";`, resolveDir: root, sourcefile: "office-core-entry.ts" },
	outfile: join(directory, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
	packages: "external",
	logLevel: "silent",
});
const office = await import(pathToFileURL(join(directory, "entry.mjs")).href);

test("every kind has its own content type and app path, and they map back", () => {
	const types = new Set();
	for (const kind of office.OFFICE_KINDS) {
		const type = office.OFFICE_CONTENT_TYPES[kind];
		assert.match(type, /^application\/vnd\.flaresuite\.[a-z]+\+json$/);
		types.add(type);
		assert.equal(office.officeKindFromContentType(type), kind);
		assert.equal(office.officeEditorPath(kind, "drv_a b"), `${office.OFFICE_APP_PATHS[kind]}/drv_a%20b`);
	}
	assert.equal(types.size, 3);
	assert.equal(office.officeKindFromContentType("application/pdf"), null);
	assert.equal(office.officeKindFromContentType(undefined), null);
	assert.equal(office.isOfficeKind("document"), true);
	assert.equal(office.isOfficeKind("folder"), false);
});

test("Drive files these content types into the Documents category", () => {
	// categories.ts matches application/vnd.% as a document.
	for (const kind of office.OFFICE_KINDS) assert.ok(office.OFFICE_CONTENT_TYPES[kind].startsWith("application/vnd."));
});

test("empty content of every kind passes validation and survives an envelope round trip", () => {
	for (const kind of office.OFFICE_KINDS) {
		const content = office.emptyContent(kind);
		assert.equal(office.validateOfficeContent(kind, content), null, kind);
		const envelope = office.createEnvelope(kind, content, 7);
		const parsed = office.parseEnvelope(kind, JSON.stringify(envelope));
		assert.deepEqual(parsed, envelope);
	}
});

test("a blank spreadsheet has one default-sized sheet that is active", () => {
	const content = office.emptyContent("spreadsheet");
	assert.equal(content.sheets.length, 1);
	assert.equal(content.activeSheetId, content.sheets[0].id);
	assert.equal(content.sheets[0].rowCount, office.SPREADSHEET_DEFAULT_ROWS);
	assert.equal(content.sheets[0].colCount, office.SPREADSHEET_DEFAULT_COLS);
});

test("validation refuses shapes the editors cannot open", () => {
	assert.ok(office.validateOfficeContent("document", null));
	assert.ok(office.validateOfficeContent("document", { html: 1 }));
	assert.ok(office.validateOfficeContent("document", []));
	assert.ok(office.validateOfficeContent("spreadsheet", { sheets: [] }));
	assert.ok(office.validateOfficeContent("spreadsheet", { sheets: [{ id: "a", name: "A", cells: {}, rowCount: 0, colCount: 1 }] }));
	assert.ok(office.validateOfficeContent("spreadsheet", { sheets: [{ id: "a", name: "A", cells: {}, rowCount: office.SPREADSHEET_MAX_ROWS + 1, colCount: 1 }] }));
	assert.ok(office.validateOfficeContent("spreadsheet", { sheets: [{ id: "a", name: "A", cells: [], rowCount: 1, colCount: 1 }] }));
	assert.ok(office.validateOfficeContent("presentation", { slides: [{ id: "s" }] }));
	assert.ok(office.validateOfficeContent("presentation", { slides: "x" }));
	assert.equal(office.validateOfficeContent("presentation", { slides: [] }), null);
});

test("an envelope of another kind, another format or broken JSON does not open", () => {
	const doc = JSON.stringify(office.createEnvelope("document", office.emptyContent("document")));
	assert.equal(office.parseEnvelope("spreadsheet", doc), null);
	assert.equal(office.parseEnvelope("document", "{not json"), null);
	assert.equal(office.parseEnvelope("document", JSON.stringify({ format: "other", kind: "document", content: { html: "" } })), null);
	assert.equal(office.parseEnvelope("document", JSON.stringify({ format: "flaresuite", kind: "document", content: { html: 3 } })), null);
});

test("a stored envelope without a revision opens at revision 1", () => {
	const parsed = office.parseEnvelope("document", JSON.stringify({ format: "flaresuite", kind: "document", content: { html: "<p>x</p>" } }));
	assert.equal(parsed.revision, 1);
});

test("local ids carry their prefix and do not repeat", () => {
	const ids = new Set(Array.from({ length: 500 }, () => office.officeLocalId("el")));
	assert.equal(ids.size, 500);
	for (const id of ids) assert.match(id, /^el_[a-z0-9]{6,}$/);
});
