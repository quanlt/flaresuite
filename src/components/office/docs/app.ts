import type { OfficeAppClient } from "../office-types";
import { downloadBlob, readFileText, safeFileName, stripExtension } from "../office-client-utils";
import { sanitizeOfficeHtml } from "../sanitize";
import { DOC_TEMPLATES } from "./docs-templates";
import { buildHtmlFile, buildWordFile, DEFAULT_DOC_PAGE, extractHtmlBody, htmlToMarkdown, htmlToText, importKind, markdownToHtml, textToHtml } from "./docs-utils";

/** Docs: templates, import and export. */
export const docsApp: OfficeAppClient<"document"> = {
	kind: "document",
	templates: DOC_TEMPLATES,
	exports: [
		{
			id: "html",
			labelKey: "docs.export.html",
			run: (content, name) => downloadBlob(new Blob([buildHtmlFile(name, sanitizeOfficeHtml(content.html), content.page)], { type: "text/html;charset=utf-8" }), safeFileName(name, "html")),
		},
		{
			id: "doc",
			labelKey: "docs.export.word",
			// The BOM makes Word read the file as UTF-8.
			run: (content, name) => downloadBlob(new Blob(["﻿", buildWordFile(name, sanitizeOfficeHtml(content.html), content.page)], { type: "application/msword" }), safeFileName(name, "doc")),
		},
		{
			id: "md",
			labelKey: "docs.export.markdown",
			run: (content, name) => downloadBlob(new Blob([htmlToMarkdown(sanitizeOfficeHtml(content.html))], { type: "text/markdown;charset=utf-8" }), safeFileName(name, "md")),
		},
		{
			id: "txt",
			labelKey: "docs.export.text",
			run: (content, name) => downloadBlob(new Blob([`${htmlToText(sanitizeOfficeHtml(content.html))}\n`], { type: "text/plain;charset=utf-8" }), safeFileName(name, "txt")),
		},
	],
	importAccept: ".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html",
	async importFile(file) {
		const text = await readFileText(file);
		const kind = importKind(file.name, file.type);
		const html = kind === "markdown" ? markdownToHtml(text) : kind === "html" ? sanitizeOfficeHtml(extractHtmlBody(text)) : textToHtml(text);
		return { name: stripExtension(file.name), content: { html: html.trim() || "<p><br></p>", page: { ...DEFAULT_DOC_PAGE } } };
	},
};
