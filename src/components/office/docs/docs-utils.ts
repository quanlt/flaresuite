import type { DocumentContent } from "@/lib/office/types";

/*
 * Pure helpers for the Docs editor: a small HTML tree reader (no DOM, so it runs in node tests and workers),
 * HTML <-> Markdown, plain text, word counts and the standalone files the exports produce.
 */

export type DocPage = NonNullable<DocumentContent["page"]>;

export const DEFAULT_DOC_PAGE: DocPage = { size: "a4", orientation: "portrait" };

/** Page size in CSS pixels (96 dpi) and its printable margin. */
export function pageDimensions(page: DocPage | undefined): { width: number; height: number; margin: number; css: string } {
	const resolved = page ?? DEFAULT_DOC_PAGE;
	const [w, h] = resolved.size === "letter" ? [816, 1056] : [794, 1123];
	const landscape = resolved.orientation === "landscape";
	return {
		width: landscape ? h : w,
		height: landscape ? w : h,
		margin: 96,
		css: `${resolved.size === "letter" ? "letter" : "A4"} ${landscape ? "landscape" : "portrait"}`,
	};
}

/* ---------- Editing helpers ---------- */

/** Font sizes (pt) offered by the size box; the +/- buttons step through them. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72, 96];

export const MIN_FONT_SIZE = 1;
export const MAX_FONT_SIZE = 400;

/** The next size up or down from `current`: the neighbouring preset, or one point past the ends of the list. */
export function stepFontSize(current: number | null, direction: 1 | -1, sizes: number[] = FONT_SIZES): number {
	const value = current && Number.isFinite(current) ? current : 11;
	if (direction > 0) {
		const next = sizes.find((size) => size > value);
		return Math.min(MAX_FONT_SIZE, next ?? value + 1);
	}
	const previous = [...sizes].reverse().find((size) => size < value);
	return Math.max(MIN_FONT_SIZE, previous ?? value - 1);
}

/** A font size typed into the size box, or null when it is not a usable number. */
export function parseFontSize(value: string): number | null {
	const number = Number(value.trim().replace(",", "."));
	if (!Number.isFinite(number) || number < MIN_FONT_SIZE || number > MAX_FONT_SIZE) return null;
	return Math.round(number * 2) / 2;
}

/** Zoom levels (percent) of the page view. */
export const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];

/** Line spacing presets (unitless line-height). */
export const LINE_HEIGHTS: { value: number; key: "single" | "115" | "150" | "double" }[] = [
	{ value: 1, key: "single" },
	{ value: 1.15, key: "115" },
	{ value: 1.5, key: "150" },
	{ value: 2, key: "double" },
];

/** The preset nearest a computed line height (line-height px / font-size px), or null for "normal" and odd values. */
export function nearestLineHeight(ratio: number | null): number | null {
	if (ratio === null || !Number.isFinite(ratio)) return null;
	const match = LINE_HEIGHTS.find((entry) => Math.abs(entry.value - ratio) < 0.04);
	return match ? match.value : null;
}

/** Start and end offsets of each occurrence of `query` in `text`, without overlaps. */
export function findMatches(text: string, query: string, matchCase = false): [number, number][] {
	if (!query) return [];
	const haystack = matchCase ? text : text.toLocaleLowerCase();
	const needle = matchCase ? query : query.toLocaleLowerCase();
	// Lower-casing can change the length of some characters (e.g. "İ"); fall back to exact matching then.
	const exact = haystack.length !== text.length || needle.length !== query.length;
	const source = exact ? text : haystack;
	const target = exact ? query : needle;
	const matches: [number, number][] = [];
	let index = source.indexOf(target);
	while (index !== -1) {
		matches.push([index, index + target.length]);
		index = source.indexOf(target, index + target.length);
	}
	return matches;
}

/**
 * Changes the letter case of a run of text. Title case capitalizes the first letter of each word; `previous` is
 * the character before the run, so a word split across formatting (text nodes) is not capitalized twice.
 */
export function changeCase(text: string, mode: "lower" | "upper" | "title", previous = ""): string {
	if (mode === "lower") return text.toLocaleLowerCase();
	if (mode === "upper") return text.toLocaleUpperCase();
	let out = "";
	let before = previous;
	for (const char of text) {
		const wordStart = !before || !/[\p{L}\p{N}'’]/u.test(before);
		out += wordStart ? char.toLocaleUpperCase() : char.toLocaleLowerCase();
		before = char;
	}
	return out;
}

/** Figures shown by Tools > Word count. */
export function textStats(text: string): { words: number; characters: number; charactersNoSpaces: number } {
	return {
		words: countWords(text),
		characters: countCharacters(text),
		charactersNoSpaces: [...text.replace(/\s/g, "")].length,
	};
}

/** Today's date as Insert > Date writes it, in the reader's language. */
export function formatInsertDate(date: Date, locale: string): string {
	try { return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date); } catch { return date.toDateString(); }
}

/** Characters offered by Insert > Special characters, by group. */
export const SPECIAL_CHARACTERS: { key: "symbols" | "punctuation" | "arrows" | "math" | "currency" | "greek"; chars: string }[] = [
	{ key: "symbols", chars: "©®™§¶†‡•◦‣°℃℉№℗℠✓✔✗✘★☆♠♣♥♦♪♫☎☐☑☒" },
	{ key: "punctuation", chars: "–—…‘’‚“”„«»‹›¡¿·‐‑′″‰" },
	{ key: "arrows", chars: "←↑→↓↔↕⇐⇑⇒⇓⇔↩↪↺↻➔➜" },
	{ key: "math", chars: "±×÷≈≠≤≥∞√∑∏∫∂∆∇∈∉∩∪⊂⊃∧∨¬∀∃∅½⅓⅔¼¾⅛¹²³" },
	{ key: "currency", chars: "$€£¥₫₹₩₽₺₿¢" },
	{ key: "greek", chars: "αβγδεζηθικλμνξοπρστυφχψωΓΔΘΛΞΠΣΦΨΩ" },
];

/* ---------- HTML tree ---------- */

export type HtmlNode =
	| { type: "text"; text: string }
	| { type: "element"; tag: string; attrs: Record<string, string>; children: HtmlNode[] };

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link", "col", "area", "base", "wbr", "source"]);
const RAW_SKIP_TAGS = new Set(["script", "style", "head", "title", "template"]);
const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "section", "article", "header", "footer", "hr", "figure", "figcaption"]);

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", copy: "©", reg: "®", trade: "™", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", bull: "•" };

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
		if (entity[0] === "#") {
			const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
	});
}

export function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parseAttributes(source: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const pattern = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source))) attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
	return attrs;
}

/** Lenient HTML reader: good enough for editor output and pasted or imported documents. */
export function parseHtml(html: string): HtmlNode[] {
	const root: HtmlNode = { type: "element", tag: "#root", attrs: {}, children: [] };
	const stack: Extract<HtmlNode, { type: "element" }>[] = [root as Extract<HtmlNode, { type: "element" }>];
	const pattern = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=/>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*\/?>/gi;
	let last = 0;
	let match: RegExpExecArray | null;
	let skipUntil: string | null = null;
	const top = () => stack[stack.length - 1];
	while ((match = pattern.exec(html))) {
		const text = html.slice(last, match.index);
		last = pattern.lastIndex;
		if (skipUntil) {
			if (match[0].toLowerCase().startsWith(`</${skipUntil}`)) skipUntil = null;
			continue;
		}
		if (text) top().children.push({ type: "text", text: decodeEntities(text) });
		const tag = match[1]?.toLowerCase();
		if (!tag) continue;
		if (match[0][1] === "/") {
			const index = stack.map((node) => node.tag).lastIndexOf(tag);
			if (index > 0) stack.length = index;
			continue;
		}
		if (RAW_SKIP_TAGS.has(tag)) { if (!match[0].endsWith("/>")) skipUntil = tag; continue; }
		// An implicitly closed paragraph or list item ends when a sibling of the same kind opens.
		if ((tag === "li" || tag === "p") && top().tag === tag) stack.pop();
		const node: Extract<HtmlNode, { type: "element" }> = { type: "element", tag, attrs: parseAttributes(match[2] ?? ""), children: [] };
		top().children.push(node);
		if (!VOID_TAGS.has(tag) && !match[0].endsWith("/>")) stack.push(node);
	}
	if (!skipUntil && last < html.length) top().children.push({ type: "text", text: decodeEntities(html.slice(last)) });
	return root.type === "element" ? root.children : [];
}

/* ---------- Plain text ---------- */

/** Readable plain text: blocks on their own lines, list items with markers, table cells separated by tabs. */
export function htmlToText(html: string): string {
	const out: string[] = [];
	const walk = (nodes: HtmlNode[], listPrefix: string[]) => {
		for (const node of nodes) {
			if (node.type === "text") { out.push(node.text.replace(/\s+/g, " ")); continue; }
			const tag = node.tag;
			if (tag === "br") { out.push("\n"); continue; }
			if (tag === "hr") { out.push("\n----------\n"); continue; }
			if (tag === "img") { if (node.attrs.alt) out.push(`[${node.attrs.alt}]`); continue; }
			if (tag === "ul" || tag === "ol") {
				let index = 0;
				out.push("\n");
				for (const child of node.children) {
					if (child.type !== "element" || child.tag !== "li") continue;
					index += 1;
					const checked = child.attrs["data-checked"];
					const marker = checked !== undefined ? (checked === "true" ? "[x] " : "[ ] ") : tag === "ol" ? `${index}. ` : "- ";
					out.push(`${"  ".repeat(listPrefix.length)}${marker}`);
					walk(child.children, [...listPrefix, marker]);
					out.push("\n");
				}
				continue;
			}
			if (tag === "td" || tag === "th") { walk(node.children, listPrefix); out.push("\t"); continue; }
			const block = BLOCK_TAGS.has(tag);
			if (block) out.push("\n");
			walk(node.children, listPrefix);
			if (block) out.push("\n");
		}
	};
	walk(parseHtml(html), []);
	return out.join("")
		.replace(/ /g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** Words in a text: runs of letters or digits, so CJK punctuation and symbols do not count. */
export function countWords(text: string): number {
	const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
	return words ? words.length : 0;
}

/** Characters excluding line breaks, as editors usually report. */
export function countCharacters(text: string): number {
	return [...text.replace(/\n/g, "")].length;
}

/** Plain text as paragraphs, one per non-empty line group. */
export function textToHtml(text: string): string {
	const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n/);
	const html = paragraphs.map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>")).join("");
	return html || "<p><br></p>";
}

/* ---------- Markdown -> HTML ---------- */

function safeUrl(url: string): string | null {
	const trimmed = url.trim();
	return /^(https?:|mailto:|tel:|#|\/(?!\/))/i.test(trimmed) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed) ? trimmed : null;
}

/** Inline Markdown: code, images, links, bold, italic, strikethrough. Text is escaped first. */
export function markdownInline(source: string): string {
	const codes: string[] = [];
	let text = source.replace(/`([^`]+)`/g, (_, code: string) => { codes.push(code); return `\u0000${codes.length - 1}\u0000`; });
	text = escapeHtml(text);
	text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (match, alt: string, url: string) => {
		const safe = safeUrl(decodeEntities(url));
		return safe ? `<img src="${escapeHtml(safe)}" alt="${alt}">` : match;
	});
	text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (match, label: string, url: string) => {
		const safe = safeUrl(decodeEntities(url));
		return safe ? `<a href="${escapeHtml(safe)}">${label}</a>` : match;
	});
	text = text.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "<strong>$2</strong>");
	text = text.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\*)/g, "$1<em>$2</em>");
	text = text.replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?![\w])/g, "$1<em>$2</em>");
	text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<s>$1</s>");
	// eslint-disable-next-line no-control-regex
	return text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => `<code>${escapeHtml(codes[Number(index)])}</code>`);
}

type ListFrame = { tag: "ul" | "ol"; indent: number; checklist: boolean };

/** Markdown (CommonMark subset plus GFM task lists and tables) to editor HTML. */
export function markdownToHtml(markdown: string): string {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const out: string[] = [];
	const lists: ListFrame[] = [];
	let paragraph: string[] = [];
	let index = 0;

	const flushParagraph = () => {
		if (paragraph.length) out.push(`<p>${paragraph.map(markdownInline).join("<br>")}</p>`);
		paragraph = [];
	};
	const closeLists = (toIndent = -1) => {
		while (lists.length && lists[lists.length - 1].indent > toIndent) out.push(`</li></${lists.pop()!.tag}>`);
	};

	while (index < lines.length) {
		const line = lines[index];
		const fence = line.match(/^\s*(```|~~~)/);
		if (fence) {
			flushParagraph(); closeLists();
			const code: string[] = [];
			index += 1;
			while (index < lines.length && !lines[index].trim().startsWith(fence[1])) code.push(lines[index++]);
			index += 1;
			out.push(`<pre>${escapeHtml(code.join("\n")) || "<br>"}</pre>`);
			continue;
		}
		if (!line.trim()) { flushParagraph(); closeLists(); index += 1; continue; }

		const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
		if (heading) {
			flushParagraph(); closeLists();
			out.push(`<h${heading[1].length}>${markdownInline(heading[2])}</h${heading[1].length}>`);
			index += 1;
			continue;
		}
		if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flushParagraph(); closeLists(); out.push("<hr>"); index += 1; continue; }

		if (/^\s*>/.test(line)) {
			flushParagraph(); closeLists();
			const quoted: string[] = [];
			while (index < lines.length && /^\s*>/.test(lines[index])) quoted.push(lines[index++].replace(/^\s*>\s?/, ""));
			out.push(`<blockquote>${markdownToHtml(quoted.join("\n"))}</blockquote>`);
			continue;
		}

		if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[index + 1])) {
			flushParagraph(); closeLists();
			const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => markdownInline(cell.trim()));
			const head = cells(line);
			index += 2;
			const body: string[][] = [];
			while (index < lines.length && lines[index].includes("|") && lines[index].trim()) body.push(cells(lines[index++]));
			out.push(`<table><thead><tr>${head.map((cell) => `<th>${cell || "<br>"}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${head.map((_, column) => `<td>${row[column] || "<br>"}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
			continue;
		}

		const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
		if (item) {
			flushParagraph();
			const indent = item[1].replace(/\t/g, "    ").length;
			const tag = /\d/.test(item[2]) ? "ol" : "ul";
			const task = tag === "ul" ? item[3].match(/^\[([ xX])\]\s+(.*)$/) : null;
			closeLists(indent);
			const current = lists[lists.length - 1];
			if (current && current.indent === indent && (current.tag !== tag || current.checklist !== !!task)) closeLists(indent - 1);
			const open = lists[lists.length - 1];
			if (!open || open.indent < indent) {
				lists.push({ tag, indent, checklist: !!task });
				out.push(task ? "<ul data-type=\"checklist\">" : `<${tag}>`);
			} else {
				out.push("</li>");
			}
			out.push(task ? `<li data-checked="${task[1] === " " ? "false" : "true"}">${markdownInline(task[2])}` : `<li>${markdownInline(item[3])}`);
			index += 1;
			continue;
		}
		if (lists.length && /^\s+\S/.test(line)) {
			out.push(`<br>${markdownInline(line.trim())}`);
			index += 1;
			continue;
		}
		closeLists();
		paragraph.push(line.trim());
		index += 1;
	}
	flushParagraph();
	closeLists();
	return out.join("") || "<p><br></p>";
}

/* ---------- HTML -> Markdown ---------- */

function markdownEscape(text: string): string {
	return text.replace(/([\\`*_[\]])/g, "\\$1");
}

function inlineMarkdown(nodes: HtmlNode[]): string {
	let out = "";
	for (const node of nodes) {
		if (node.type === "text") { out += markdownEscape(node.text.replace(/\s+/g, " ").replace(/ /g, " ")); continue; }
		const inner = () => inlineMarkdown(node.children);
		switch (node.tag) {
			case "br": out += "  \n"; break;
			case "strong": case "b": { const text = inner(); out += text.trim() ? `**${text}**` : text; break; }
			case "em": case "i": { const text = inner(); out += text.trim() ? `*${text}*` : text; break; }
			case "s": case "strike": case "del": { const text = inner(); out += text.trim() ? `~~${text}~~` : text; break; }
			case "code": out += `\`${textContent(node.children)}\``; break;
			case "a": out += node.attrs.href ? `[${inner()}](${node.attrs.href})` : inner(); break;
			case "img": out += node.attrs.src ? `![${node.attrs.alt ?? ""}](${node.attrs.src})` : ""; break;
			default: out += BLOCK_TAGS.has(node.tag) ? `${blocksToMarkdown([node], 0).trim()} ` : inner();
		}
	}
	return out;
}

function textContent(nodes: HtmlNode[]): string {
	return nodes.map((node) => (node.type === "text" ? node.text : node.tag === "br" ? "\n" : textContent(node.children))).join("");
}

function blocksToMarkdown(nodes: HtmlNode[], depth: number): string {
	const blocks: string[] = [];
	let inline: HtmlNode[] = [];
	const flushInline = () => {
		const text = inlineMarkdown(inline).trim();
		if (text) blocks.push(text);
		inline = [];
	};
	for (const node of nodes) {
		if (node.type === "text" || !BLOCK_TAGS.has(node.tag)) { inline.push(node); continue; }
		flushInline();
		const tag = node.tag;
		if (/^h[1-6]$/.test(tag)) blocks.push(`${"#".repeat(Number(tag[1]))} ${inlineMarkdown(node.children).trim()}`);
		else if (tag === "hr") blocks.push("---");
		else if (tag === "pre") blocks.push(`\`\`\`\n${textContent(node.children).replace(/\n$/, "")}\n\`\`\``);
		else if (tag === "blockquote") blocks.push(blocksToMarkdown(node.children, depth).split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n"));
		else if (tag === "ul" || tag === "ol") {
			const checklist = node.attrs["data-type"] === "checklist";
			let number = 0;
			const items: string[] = [];
			for (const child of node.children) {
				if (child.type !== "element" || child.tag !== "li") continue;
				number += 1;
				const checked = child.attrs["data-checked"];
				const marker = tag === "ol" ? `${number}.` : checklist || checked !== undefined ? `- [${checked === "true" ? "x" : " "}]` : "-";
				const nested = child.children.filter((entry) => entry.type === "element" && (entry.tag === "ul" || entry.tag === "ol"));
				const own = child.children.filter((entry) => !nested.includes(entry));
				const text = blocksToMarkdown(own, depth + 1).replace(/\n\n/g, "  \n");
				items.push(`${"  ".repeat(depth)}${marker} ${text}`);
				for (const list of nested) items.push(blocksToMarkdown([list], depth + 1));
			}
			blocks.push(items.join("\n"));
		} else if (tag === "table") {
			const rows: string[][] = [];
			const collect = (entries: HtmlNode[]) => {
				for (const entry of entries) {
					if (entry.type !== "element") continue;
					if (entry.tag === "tr") rows.push(entry.children.filter((cell): cell is Extract<HtmlNode, { type: "element" }> => cell.type === "element" && (cell.tag === "td" || cell.tag === "th")).map((cell) => inlineMarkdown(cell.children).trim().replace(/\|/g, "\\|")));
					else collect(entry.children);
				}
			};
			collect(node.children);
			if (rows.length) {
				const width = Math.max(...rows.map((row) => row.length));
				const pad = (row: string[]) => `| ${Array.from({ length: width }, (_, column) => row[column] ?? "").join(" | ")} |`;
				blocks.push([pad(rows[0]), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1).map(pad)].join("\n"));
			}
		} else if (node.attrs["data-page-break"] !== undefined) {
			blocks.push("---");
		} else {
			const text = blocksToMarkdown(node.children, depth);
			if (text.trim()) blocks.push(text);
		}
	}
	flushInline();
	return blocks.join("\n\n");
}

export function htmlToMarkdown(html: string): string {
	return `${blocksToMarkdown(parseHtml(html), 0).replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/* ---------- Exports ---------- */

/** Styles shared by the editor page and the exported files. */
export const DOC_CONTENT_CSS = `
body, .fs-docs-content { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.5; color: #202124; }
h1 { font-size: 20pt; font-weight: 400; margin: 20pt 0 6pt; }
h1[data-title] { font-size: 26pt; margin: 0 0 3pt; }
p[data-subtitle] { font-size: 15pt; color: #666666; margin: 0 0 16pt; }
h2 { font-size: 16pt; font-weight: 400; margin: 18pt 0 6pt; }
h3 { font-size: 14pt; font-weight: 400; color: #434343; margin: 16pt 0 4pt; }
p { margin: 0 0 6pt; }
blockquote { margin: 6pt 0; padding-left: 12pt; border-left: 3px solid #dadce0; color: #5f6368; }
pre { font-family: "Courier New", monospace; font-size: 10pt; background: #f1f3f4; padding: 8pt; border-radius: 4px; white-space: pre-wrap; }
code { font-family: "Courier New", monospace; background: #f1f3f4; padding: 0 2px; border-radius: 2px; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
td, th { border: 1px solid #c0c0c0; padding: 4pt 6pt; vertical-align: top; min-width: 2em; }
th { background: #f8f9fa; font-weight: 600; }
ul, ol { margin: 0 0 6pt; padding-left: 24pt; }
ul[data-type="checklist"] { list-style: none; padding-left: 4pt; }
ul[data-type="checklist"] > li { position: relative; padding-left: 22pt; }
ul[data-type="checklist"] > li::before { content: ""; position: absolute; left: 0; top: 0.25em; width: 12px; height: 12px; border: 1.5px solid #5f6368; border-radius: 2px; }
ul[data-type="checklist"] > li[data-checked="true"] { color: #80868b; text-decoration: line-through; }
ul[data-type="checklist"] > li[data-checked="true"]::before { background: #1a73e8; border-color: #1a73e8; }
img { max-width: 100%; height: auto; }
a { color: #1a73e8; }
hr { border: 0; border-top: 1px solid #dadce0; margin: 12pt 0; }
[data-page-break] { break-after: page; page-break-after: always; }
`;

/** A standalone HTML file of the document. `html` must already be sanitized. */
export function buildHtmlFile(title: string, html: string, page?: DocPage): string {
	const { css } = pageDimensions(page);
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${css}; margin: 2.54cm; }
body { max-width: 816px; margin: 40px auto; padding: 0 24px; }
${DOC_CONTENT_CSS}
</style>
</head>
<body>
${html}
</body>
</html>
`;
}

/** An HTML file Word opens as a document (.doc). `html` must already be sanitized. */
export function buildWordFile(title: string, html: string, page?: DocPage): string {
	const { css } = pageDimensions(page);
	return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: ${css}; margin: 1in; }
div.WordSection1 { page: WordSection1; }
${DOC_CONTENT_CSS}
</style>
</head>
<body>
<div class="WordSection1">
${html.replace(/<div data-page-break[^>]*>[\s\S]*?<\/div>/g, "<br clear=\"all\" style=\"page-break-before:always\">")}
</div>
</body>
</html>
`;
}

/** The body of an imported HTML file (the part inside <body>, or all of it). */
export function extractHtmlBody(html: string): string {
	const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	return (body ? body[1] : html).trim();
}

/** Picks the importer by file name or type. */
export function importKind(name: string, type: string): "markdown" | "html" | "text" {
	const lower = name.toLowerCase();
	if (lower.endsWith(".md") || lower.endsWith(".markdown") || type === "text/markdown") return "markdown";
	if (lower.endsWith(".html") || lower.endsWith(".htm") || type === "text/html") return "html";
	return "text";
}
