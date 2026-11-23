import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(root, "node_modules", "flaresuite-office-docs-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `export * from "./src/components/office/docs/docs-utils.ts"; export { DOC_TEMPLATES } from "./src/components/office/docs/docs-templates.ts";`,
		resolveDir: root,
		sourcefile: "office-docs-entry.ts",
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
const docs = await import(pathToFileURL(join(directory, "entry.mjs")).href);

test("markdown headings, emphasis, links and code become editor HTML", () => {
	const html = docs.markdownToHtml("# Title\n\nSome **bold** and *italic* with [a link](https://example.com) and `x < y`.");
	assert.equal(html, '<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em> with <a href="https://example.com">a link</a> and <code>x &lt; y</code>.</p>');
});

test("markdown never lets raw HTML or unsafe links through", () => {
	const html = docs.markdownToHtml("<script>alert(1)</script> [x](javascript:alert(1))");
	assert.ok(!html.includes("<script>"));
	assert.ok(!html.includes('href="javascript'));
});

test("markdown lists, nested lists and task lists", () => {
	assert.equal(docs.markdownToHtml("- a\n- b\n  - c\n- d"), "<ul><li>a</li><li>b<ul><li>c</li></ul></li><li>d</li></ul>");
	assert.equal(docs.markdownToHtml("1. one\n2. two"), "<ol><li>one</li><li>two</li></ol>");
	assert.equal(docs.markdownToHtml("- [ ] todo\n- [x] done"), '<ul data-type="checklist"><li data-checked="false">todo</li><li data-checked="true">done</li></ul>');
});

test("markdown fences, quotes, rules and tables", () => {
	assert.equal(docs.markdownToHtml("```\nconst a = 1;\n```"), "<pre>const a = 1;</pre>");
	assert.equal(docs.markdownToHtml("> quoted"), "<blockquote><p>quoted</p></blockquote>");
	assert.equal(docs.markdownToHtml("---"), "<hr>");
	assert.equal(docs.markdownToHtml("| a | b |\n| --- | --- |\n| 1 | 2 |"), "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>");
});

test("HTML converts back to Markdown", () => {
	const md = docs.htmlToMarkdown('<h1 data-title="true">Plan</h1><p>Hello <strong>world</strong> <a href="https://x.test">link</a></p><ul><li>a</li><li>b<ul><li>c</li></ul></li></ul><ul data-type="checklist"><li data-checked="true">done</li></ul><ol><li>x</li></ol><pre>code</pre><blockquote><p>q</p></blockquote>');
	assert.equal(md, "# Plan\n\nHello **world** [link](https://x.test)\n\n- a\n- b\n  - c\n\n- [x] done\n\n1. x\n\n```\ncode\n```\n\n> q\n");
});

test("Markdown round trip keeps the structure", () => {
	const source = "# Notes\n\n- one\n- two\n\n**Bold** text\n";
	assert.equal(docs.htmlToMarkdown(docs.markdownToHtml(source)), source);
});

test("tables convert to GFM tables", () => {
	assert.equal(docs.htmlToMarkdown("<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2|3</td></tr></table>"), "| a | b |\n| --- | --- |\n| 1 | 2\\|3 |\n");
});

test("plain text keeps blocks, lists and cells readable", () => {
	assert.equal(docs.htmlToText("<h1>T</h1><p>A&nbsp;b<br>c</p><ul><li>x</li><li>y</li></ul><ol><li>z</li></ol><table><tr><td>1</td><td>2</td></tr></table>"), "T\n\nA b\nc\n\n- x\n- y\n\n1. z\n\n1\t2");
	assert.equal(docs.htmlToText("<script>bad()</script><style>p{}</style><p>ok</p>"), "ok");
});

test("word and character counts", () => {
	assert.equal(docs.countWords("Hello, world! It's 2026 — xin chào."), 6);
	assert.equal(docs.countWords("   "), 0);
	assert.equal(docs.countCharacters("ab\ncd"), 4);
});

test("text import escapes HTML and keeps empty lines", () => {
	assert.equal(docs.textToHtml("a <b>\n\nc"), "<p>a &lt;b&gt;</p><p><br></p><p>c</p>");
});

test("entities decode", () => {
	assert.equal(docs.decodeEntities("&amp;&lt;&#65;&#x42;&nbsp;&unknown;"), "&<AB &unknown;");
});

test("page dimensions follow size and orientation", () => {
	assert.deepEqual(docs.pageDimensions({ size: "a4", orientation: "portrait" }), { width: 794, height: 1123, margin: 96, css: "A4 portrait" });
	assert.equal(docs.pageDimensions({ size: "letter", orientation: "landscape" }).width, 1056);
	assert.equal(docs.pageDimensions(undefined).css, "A4 portrait");
});

test("export files embed the title safely and convert page breaks for Word", () => {
	const html = docs.buildHtmlFile("<Report>", "<p>x</p>", { size: "letter", orientation: "portrait" });
	assert.ok(html.includes("<title>&lt;Report&gt;</title>"));
	assert.ok(html.includes("size: letter portrait"));
	const word = docs.buildWordFile("R", '<p>a</p><div data-page-break="true" contenteditable="false"></div><p>b</p>');
	assert.ok(word.includes("urn:schemas-microsoft-com:office:word"));
	assert.ok(word.includes("page-break-before:always"));
	assert.ok(!word.includes("<div data-page-break"));
});

test("imports pick the right converter and extract HTML bodies", () => {
	assert.equal(docs.importKind("notes.MD", ""), "markdown");
	assert.equal(docs.importKind("page.htm", ""), "html");
	assert.equal(docs.importKind("a.txt", "text/plain"), "text");
	assert.equal(docs.extractHtmlBody("<html><head><title>t</title></head><body class='x'><p>hi</p></body></html>"), "<p>hi</p>");
});

test("templates produce non-empty HTML", () => {
	assert.ok(docs.DOC_TEMPLATES.length >= 3);
	for (const template of docs.DOC_TEMPLATES) {
		assert.ok(template.id && template.labelKey.startsWith("docs."));
		const content = template.create();
		assert.ok(content.html.length > 50);
	}
});
