"use client";

import { sanitizeOfficeHtml } from "../sanitize";

/*
 * Browser-only helpers for the contentEditable page. Formatting goes through document.execCommand where it can,
 * so the browser keeps its own undo history; the few changes it cannot express are small DOM edits.
 */

export const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,blockquote,pre,li,div";

export function selectionRangeIn(root: HTMLElement | null): Range | null {
	if (!root) return null;
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	return root.contains(range.commonAncestorContainer) ? range : null;
}

export function restoreRange(root: HTMLElement | null, range: Range | null): void {
	if (!root) return;
	root.focus({ preventScroll: true });
	if (!range) return;
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

export function elementAtSelection(root: HTMLElement | null): HTMLElement | null {
	const range = selectionRangeIn(root);
	if (!range) return null;
	const node = range.startContainer;
	return node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
}

/** The block (paragraph, heading, list item …) holding the caret, never the page itself. */
export function blockAtSelection(root: HTMLElement | null): HTMLElement | null {
	const element = elementAtSelection(root);
	const block = element?.closest(BLOCK_SELECTOR) as HTMLElement | null;
	return block && root?.contains(block) && block !== root ? block : null;
}

export function exec(command: string, value?: string): boolean {
	try { return document.execCommand(command, false, value); } catch { return false; }
}

export function queryState(command: string): boolean {
	try { return document.queryCommandState(command); } catch { return false; }
}

/** Applies an inline style to the selection (font size, font family) as a span instead of <font>. */
export function applyInlineStyle(root: HTMLElement, property: "fontSize" | "fontFamily", value: string): void {
	exec("styleWithCSS", "false");
	exec("fontSize", "7");
	for (const font of Array.from(root.querySelectorAll("font[size=\"7\"]"))) {
		const span = document.createElement("span");
		span.style[property] = value;
		const face = font.getAttribute("face");
		if (face && property !== "fontFamily") span.style.fontFamily = face;
		for (const child of Array.from(font.childNodes)) span.appendChild(child);
		// Nested sizes inside the new span would override it.
		for (const inner of Array.from(span.querySelectorAll<HTMLElement>("span"))) inner.style[property] = "";
		font.replaceWith(span);
	}
}

/** Font size (pt, rounded) and family at the caret, for the toolbar. */
export function computedTextStyle(root: HTMLElement | null): { fontSize: number | null; fontFamily: string | null } {
	const element = elementAtSelection(root);
	if (!element) return { fontSize: null, fontFamily: null };
	const style = window.getComputedStyle(element);
	const px = parseFloat(style.fontSize);
	return { fontSize: Number.isFinite(px) ? Math.round(px * 0.75) : null, fontFamily: style.fontFamily };
}

/** Turns a list into a checklist or back. */
export function toggleChecklist(root: HTMLElement): void {
	const block = blockAtSelection(root);
	const list = block?.closest("ul,ol") as HTMLElement | null;
	if (list && list.getAttribute("data-type") === "checklist") {
		list.removeAttribute("data-type");
		for (const item of Array.from(list.children)) item.removeAttribute("data-checked");
		exec("insertUnorderedList");
		return;
	}
	if (!list || list.tagName !== "UL") exec("insertUnorderedList");
	const current = blockAtSelection(root)?.closest("ul") as HTMLElement | null;
	if (!current) return;
	current.setAttribute("data-type", "checklist");
	for (const item of Array.from(current.children)) if (!item.hasAttribute("data-checked")) item.setAttribute("data-checked", "false");
}

/** Toggles a checklist item when its box (the left gutter) is clicked. Returns true when it handled the click. */
export function toggleChecklistItemAt(event: MouseEvent, root: HTMLElement): boolean {
	const target = event.target as HTMLElement | null;
	const item = target?.closest("li") as HTMLElement | null;
	if (!item || !root.contains(item) || item.parentElement?.getAttribute("data-type") !== "checklist") return false;
	const rect = item.getBoundingClientRect();
	if (event.clientX - rect.left > 22) return false;
	item.setAttribute("data-checked", item.getAttribute("data-checked") === "true" ? "false" : "true");
	return true;
}

/** Moves the caret to the next or previous table cell, adding a row after the last cell. */
export function moveInTable(root: HTMLElement, backwards: boolean): boolean {
	const cell = elementAtSelection(root)?.closest("td,th") as HTMLTableCellElement | null;
	if (!cell || !root.contains(cell)) return false;
	const table = cell.closest("table");
	if (!table) return false;
	const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>("td,th"));
	let index = cells.indexOf(cell) + (backwards ? -1 : 1);
	if (index < 0) return true;
	if (index >= cells.length) {
		const row = cell.parentElement as HTMLTableRowElement;
		const added = row.cloneNode(true) as HTMLTableRowElement;
		for (const entry of Array.from(added.cells)) entry.innerHTML = "<br>";
		row.parentNode?.insertBefore(added, row.nextSibling);
		cells.push(...Array.from(added.cells));
		index = cells.length - added.cells.length;
	}
	const range = document.createRange();
	range.selectNodeContents(cells[index]);
	range.collapse(true);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
	return true;
}

const KEPT_ATTRIBUTES = new Set(["href", "src", "alt", "colspan", "rowspan", "data-checked", "data-type", "data-title", "data-subtitle", "data-page-break"]);
const UNWRAPPED_TAGS = new Set(["SPAN", "FONT", "O:P", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER"]);

/**
 * Pasted HTML keeps its structure (headings, lists, tables, links, emphasis) but loses the source page's look:
 * classes, ids and inline styles go, except alignment and bold/italic that some editors express as styles.
 */
export function cleanPastedHtml(html: string): string {
	const template = document.createElement("template");
	template.innerHTML = sanitizeOfficeHtml(html.replace(/<!--[\s\S]*?-->/g, ""));
	const walk = (parent: Node) => {
		for (const node of Array.from(parent.childNodes)) {
			if (node.nodeType !== Node.ELEMENT_NODE) continue;
			const element = node as HTMLElement;
			walk(element);
			const style = element.style;
			const align = style?.textAlign;
			const bold = style && (style.fontWeight === "bold" || Number(style.fontWeight) >= 600);
			const italic = style?.fontStyle === "italic";
			for (const attribute of Array.from(element.attributes)) if (!KEPT_ATTRIBUTES.has(attribute.name)) element.removeAttribute(attribute.name);
			if (align && /^(center|right|justify)$/.test(align) && /^(P|H[1-6]|DIV|LI|TD|TH)$/.test(element.tagName)) element.style.textAlign = align;
			if (UNWRAPPED_TAGS.has(element.tagName)) {
				let replacement: Node[] = Array.from(element.childNodes);
				if (bold || italic) {
					const wrapper = document.createElement(bold ? "strong" : "em");
					for (const child of replacement) wrapper.appendChild(child);
					replacement = [wrapper];
				}
				for (const child of replacement) element.parentNode?.insertBefore(child, element);
				element.remove();
			}
		}
	};
	walk(template.content);
	const container = document.createElement("div");
	container.appendChild(template.content);
	return container.innerHTML;
}

/** Marks links in a read-only page so they open in a new tab without access to this window. */
export function openLinksInNewTab(root: HTMLElement): void {
	for (const link of Array.from(root.querySelectorAll("a[href]"))) {
		link.setAttribute("target", "_blank");
		link.setAttribute("rel", "noopener noreferrer");
	}
}

export function tableHtml(rows: number, cols: number): string {
	const header = `<tr>${"<th><br></th>".repeat(cols)}</tr>`;
	const body = Array.from({ length: Math.max(0, rows - 1) }, () => `<tr>${"<td><br></td>".repeat(cols)}</tr>`).join("");
	return `<table><thead>${header}</thead><tbody>${body}</tbody></table><p><br></p>`;
}

export const PAGE_BREAK_HTML = "<div data-page-break=\"true\" contenteditable=\"false\"></div><p><br></p>";

const LEAF_BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,blockquote,pre,li";

/** The paragraphs (and headings, list items …) the selection touches, for paragraph-level formatting. */
export function selectedBlocks(root: HTMLElement): HTMLElement[] {
	const range = selectionRangeIn(root);
	if (!range) return [];
	const start = blockAtSelection(root);
	if (range.collapsed) return start ? [start] : [];
	const blocks = Array.from(root.querySelectorAll<HTMLElement>(LEAF_BLOCK_SELECTOR)).filter((block) => {
		if (!range.intersectsNode(block)) return false;
		// A list item that holds a nested list is formatted through its own text, not as a whole.
		return !block.querySelector(LEAF_BLOCK_SELECTOR) || block.tagName === "LI";
	});
	if (blocks.length) return blocks;
	return start ? [start] : [];
}

/** Sets one style property on every selected block; an empty value removes it. */
export function setBlockStyle(root: HTMLElement, property: "lineHeight" | "marginTop" | "marginBottom", value: string): void {
	for (const block of selectedBlocks(root)) {
		block.style[property] = value;
		if (!block.getAttribute("style")) block.removeAttribute("style");
	}
}

/** Gives the list at the caret a marker style, turning the selection into the right kind of list first. */
export function setListStyle(root: HTMLElement, style: string): void {
	const ordered = !["disc", "circle", "square"].includes(style);
	let list = blockAtSelection(root)?.closest("ul,ol") as HTMLElement | null;
	if (!list || list.tagName !== (ordered ? "OL" : "UL") || list.getAttribute("data-type") === "checklist") {
		if (list?.getAttribute("data-type") === "checklist") toggleChecklist(root);
		exec(ordered ? "insertOrderedList" : "insertUnorderedList");
		list = blockAtSelection(root)?.closest("ul,ol") as HTMLElement | null;
	}
	if (list && root.contains(list)) list.style.listStyleType = style;
}

/** Rewrites the selected text in place, keeping its formatting. `transform` gets each piece and the character before it. */
export function transformSelectedText(root: HTMLElement, transform: (text: string, previous: string) => string): boolean {
	const range = selectionRangeIn(root);
	if (!range || range.collapsed) return false;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	while (walker.nextNode()) if (range.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode as Text);
	const { startContainer, startOffset, endContainer, endOffset } = range;
	let previous = "";
	let lastBlock: Element | null = null;
	for (const node of nodes) {
		const from = node === startContainer ? startOffset : 0;
		const to = node === endContainer ? endOffset : node.data.length;
		const block = node.parentElement?.closest(LEAF_BLOCK_SELECTOR) ?? null;
		if (block !== lastBlock) previous = "";
		lastBlock = block;
		if (from > 0) previous = node.data[from - 1];
		const piece = node.data.slice(from, to);
		const next = transform(piece, previous);
		// Case changes can alter length; only rewrite pieces that keep it so the selection stays valid.
		if (next.length === piece.length) node.data = node.data.slice(0, from) + next + node.data.slice(to);
		previous = piece.slice(-1) || previous;
	}
	const selection = window.getSelection();
	const restored = document.createRange();
	restored.setStart(startContainer, startOffset);
	restored.setEnd(endContainer, endOffset);
	selection?.removeAllRanges();
	selection?.addRange(restored);
	return true;
}

/* ---------- Find ---------- */

export type TextIndex = { text: string; segments: { node: Text; start: number }[] };

/** The page's text as one string (blocks separated by newlines) plus where each text node sits in it. */
export function buildTextIndex(root: HTMLElement): TextIndex {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const segments: TextIndex["segments"] = [];
	let text = "";
	let lastBlock: Element | null = null;
	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		const block = node.parentElement?.closest(`${LEAF_BLOCK_SELECTOR},td,th,div`) ?? null;
		if (segments.length && block !== lastBlock) text += "\n";
		lastBlock = block;
		segments.push({ node, start: text.length });
		text += node.data;
	}
	return { text, segments };
}

function locate(index: TextIndex, position: number, end: boolean): { node: Text; offset: number } | null {
	for (const segment of index.segments) {
		const length = segment.node.data.length;
		if (end ? position > segment.start && position <= segment.start + length : position >= segment.start && position < segment.start + length) {
			return { node: segment.node, offset: position - segment.start };
		}
	}
	return null;
}

/** A DOM range for a span of the indexed text. */
export function rangeForMatch(index: TextIndex, start: number, end: number): Range | null {
	const from = locate(index, start, false);
	const to = locate(index, end, true);
	if (!from || !to) return null;
	const range = document.createRange();
	range.setStart(from.node, from.offset);
	range.setEnd(to.node, to.offset);
	return range;
}

type HighlightRegistry = { set: (name: string, value: unknown) => void; delete: (name: string) => void };

function highlightRegistry(): { registry: HighlightRegistry; create: (ranges: Range[]) => unknown } | null {
	const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights;
	const HighlightClass = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
	if (!registry || !HighlightClass) return null;
	return { registry, create: (ranges) => new HighlightClass(...ranges) };
}

/** Paints find matches with the CSS Custom Highlight API (no DOM changes, so nothing reaches the saved HTML). */
export function paintFindHighlights(ranges: Range[], current: Range | null): void {
	const api = highlightRegistry();
	if (!api) return;
	api.registry.set("fs-docs-find", api.create(ranges));
	if (current) api.registry.set("fs-docs-find-current", api.create([current]));
	else api.registry.delete("fs-docs-find-current");
}

export function clearFindHighlights(): void {
	const api = highlightRegistry();
	api?.registry.delete("fs-docs-find");
	api?.registry.delete("fs-docs-find-current");
}

/** Scrolls a range into the middle of its scrolling container. */
export function scrollRangeIntoView(range: Range): void {
	const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
	element?.scrollIntoView({ block: "center", inline: "nearest" });
}

/* ---------- Tables ---------- */

/** Adds or removes a row or column of the table at the caret. Returns false outside a table. */
export function editTable(root: HTMLElement, edit: "rowAbove" | "rowBelow" | "columnLeft" | "columnRight" | "deleteRow" | "deleteColumn" | "deleteTable"): boolean {
	const cell = elementAtSelection(root)?.closest("td,th") as HTMLTableCellElement | null;
	const table = cell?.closest("table") as HTMLTableElement | null;
	if (!cell || !table || !root.contains(table)) return false;
	const row = cell.parentElement as HTMLTableRowElement;
	const column = cell.cellIndex;
	const focusCell = (target: HTMLTableCellElement | null | undefined) => {
		if (!target) return;
		const range = document.createRange();
		range.selectNodeContents(target);
		range.collapse(true);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	};
	const removeTable = () => {
		const after = table.nextElementSibling;
		table.remove();
		if (after) focusCell(after as HTMLTableCellElement);
	};
	switch (edit) {
		case "rowAbove":
		case "rowBelow": {
			const added = row.cloneNode(true) as HTMLTableRowElement;
			// A row added above the header row stays a body row.
			for (const entry of Array.from(added.cells)) {
				const replacement = document.createElement(row.parentElement?.tagName === "THEAD" && edit === "rowBelow" ? "td" : entry.tagName.toLowerCase());
				replacement.innerHTML = "<br>";
				entry.replaceWith(replacement);
			}
			if (row.parentElement?.tagName === "THEAD" && edit === "rowBelow") {
				const body = table.tBodies[0] ?? table.appendChild(document.createElement("tbody"));
				body.insertBefore(added, body.firstChild);
			} else {
				row.parentNode?.insertBefore(added, edit === "rowAbove" ? row : row.nextSibling);
			}
			focusCell(added.cells[Math.min(column, added.cells.length - 1)]);
			return true;
		}
		case "columnLeft":
		case "columnRight":
			for (const entry of Array.from(table.rows)) {
				const reference = entry.cells[Math.min(column, entry.cells.length - 1)];
				const added = document.createElement(reference?.tagName.toLowerCase() === "th" ? "th" : "td");
				added.innerHTML = "<br>";
				if (!reference) entry.appendChild(added);
				else entry.insertBefore(added, edit === "columnLeft" ? reference : reference.nextSibling);
			}
			focusCell(row.cells[edit === "columnLeft" ? column : column + 1]);
			return true;
		case "deleteRow": {
			if (table.rows.length <= 1) { removeTable(); return true; }
			const next = (row.nextElementSibling ?? row.previousElementSibling) as HTMLTableRowElement | null;
			row.remove();
			focusCell(next?.cells[Math.min(column, next.cells.length - 1)] ?? table.rows[0]?.cells[0]);
			return true;
		}
		case "deleteColumn": {
			if (row.cells.length <= 1) { removeTable(); return true; }
			for (const entry of Array.from(table.rows)) entry.cells[column]?.remove();
			focusCell(row.cells[Math.min(column, row.cells.length - 1)]);
			return true;
		}
		case "deleteTable":
			removeTable();
			return true;
	}
}
