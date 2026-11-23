import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(root, "node_modules", "flaresuite-share-notify-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: { contents: `export * from "./src/lib/drive/share-notify-utils.ts"; export { createTranslator } from "./src/lib/i18n/utils.ts";`, resolveDir: root, sourcefile: "share-notify-entry.ts" },
	outfile: join(directory, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
	packages: "external",
	loader: { ".json": "json" },
	logLevel: "silent",
});
const { buildShareEmail, sharedItemPath, createTranslator } = await import(pathToFileURL(join(directory, "entry.mjs")).href);
const en = JSON.parse(readFileSync(join(root, "src/lib/i18n/en.json"), "utf8"));
const t = createTranslator("en", en);
const base = { sharerName: "Alex", sharerEmail: "alex@example.com", itemName: "Q3 plan", appName: "FlareSuite" };

test("Docs, Sheets and Slides links open the editor; folders and other files open Drive", () => {
	assert.equal(sharedItemPath({ id: "d1", kind: "file", contentType: "application/vnd.flaresuite.document+json" }), "/docs/d1");
	assert.equal(sharedItemPath({ id: "s1", kind: "file", contentType: "application/vnd.flaresuite.spreadsheet+json" }), "/sheets/s1");
	assert.equal(sharedItemPath({ id: "p1", kind: "file", contentType: "application/vnd.flaresuite.presentation+json" }), "/slides/p1");
	assert.equal(sharedItemPath({ id: "f 1", kind: "folder", contentType: "application/x-directory" }), "/drive?folder=f%201&view=shared");
	assert.equal(sharedItemPath({ id: "x", kind: "file", contentType: "application/pdf" }), "/drive?view=shared");
});

test("the mail names the sharer, the file and the role, and links to it", () => {
	const mail = buildShareEmail(t, { ...base, role: "edit", link: "https://suite.example.com/docs/d1" });
	assert.equal(mail.subject, 'Alex shared "Q3 plan" with you');
	assert.match(mail.text, /invited you to edit "Q3 plan"/);
	assert.match(mail.text, /https:\/\/suite\.example\.com\/docs\/d1/);
	assert.match(mail.html, /href="https:\/\/suite\.example\.com\/docs\/d1"/);
	const view = buildShareEmail(t, { ...base, role: "view", link: null });
	assert.match(view.text, /You can view it/);
	assert.doesNotMatch(view.html, /href=/);
});

test("names, file names and the note are escaped in the HTML part", () => {
	const mail = buildShareEmail(t, { ...base, sharerName: "<b>Eve</b>", itemName: "a\"<script>", role: "view", link: null, message: "<img src=x onerror=alert(1)>\nbye" });
	assert.doesNotMatch(mail.html, /<script>|<img|<b>Eve/);
	assert.match(mail.html, /&lt;img src=x onerror=alert\(1\)&gt;<br>bye/);
	assert.match(mail.text, /"<img src=x onerror=alert\(1\)>\nbye"/);
});

test("a long note is cut and an empty one is left out", () => {
	const long = buildShareEmail(t, { ...base, role: "view", link: null, message: "x".repeat(5000) });
	assert.ok(long.text.length < 1500);
	const empty = buildShareEmail(t, { ...base, role: "view", link: null, message: "   " });
	assert.doesNotMatch(empty.html, /blockquote/);
});
