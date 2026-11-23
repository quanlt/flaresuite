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

const KEPT_ATTRIBUTES = new Set(["href", "src", "alt", "colspan", "rowspan", "data-checked", "data-type", "data-title", "data-page-break"]);
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
