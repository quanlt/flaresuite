"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "@/components/language-provider";
import type { OfficeEditorProps } from "../office-types";
import { readImageAsDataUrl } from "../office-client-utils";
import { sanitizeOfficeHtml } from "../sanitize";
import { ImageUrlDialog, LinkDialog, PageSetupDialog } from "./docs-dialogs";
import { applyInlineStyle, blockAtSelection, cleanPastedHtml, computedTextStyle, elementAtSelection, exec, moveInTable, openLinksInNewTab, PAGE_BREAK_HTML, queryState, restoreRange, selectionRangeIn, tableHtml, toggleChecklist, toggleChecklistItemAt } from "./docs-dom";
import { DocsToolbar } from "./docs-toolbar";
import type { DocsAction, DocsAlign, DocsBlockStyle, DocsToolbarState } from "./docs-types";
import { countCharacters, countWords, DEFAULT_DOC_PAGE, DOC_CONTENT_CSS, escapeHtml, pageDimensions } from "./docs-utils";
import type { DocPage } from "./docs-utils";

const CHANGE_DELAY_MS = 300;

const INITIAL_TOOLBAR: DocsToolbarState = {
	bold: false, italic: false, underline: false, strike: false, unorderedList: false, orderedList: false, checklist: false,
	align: "left", block: "p", fontSize: 11, fontFamily: null, link: false, canUndo: false, canRedo: false,
};

/** Scoped styles: the content look, the editing affordances and print rules that leave only the page. */
function editorCss(page: DocPage | undefined): string {
	const scoped = DOC_CONTENT_CSS
		.replace(/body, \.fs-docs-content/, ".fs-docs-content")
		.split("}")
		.map((rule) => {
			const [selector, body] = rule.split("{");
			if (!body || selector.trim().startsWith(".fs-docs-content")) return rule;
			return `${selector.split(",").map((part) => `.fs-docs-content ${part.trim()}`).join(", ")} {${body}`;
		})
		.join("}");
	return `${scoped}
.fs-docs-content { outline: none; word-wrap: break-word; overflow-wrap: anywhere; caret-color: #1a73e8; }
.fs-docs-content > :first-child { margin-top: 0; }
.fs-docs-content td:focus-within, .fs-docs-content th:focus-within { outline: 2px solid #c6dafc; outline-offset: -2px; }
.fs-docs-content img { cursor: default; }
.fs-docs-content [data-page-break] { height: 0; margin: 24px -96px; border-top: 1px dashed #bdc1c6; position: relative; user-select: none; }
.fs-docs-content [data-page-break]::after { content: attr(data-label); position: absolute; left: 50%; top: -9px; transform: translateX(-50%); background: #fff; padding: 0 8px; font-size: 11px; color: #80868b; }
.fs-docs-content ul[data-type="checklist"] > li::before { cursor: pointer; }
.fs-docs-readonly ul[data-type="checklist"] > li::before { cursor: default; }
@media print {
	@page { size: ${pageDimensions(page).css}; margin: 0; }
	body * { visibility: hidden !important; }
	.fs-docs-print, .fs-docs-print * { visibility: visible !important; }
	.fs-docs-print { position: absolute !important; left: 0; top: 0; margin: 0 !important; box-shadow: none !important; width: 100% !important; min-height: 0 !important; }
	.fs-docs-content [data-page-break] { border: 0; margin: 0; }
	.fs-docs-content [data-page-break]::after { content: none; }
}`;
}

function blockStyleOf(block: HTMLElement | null): DocsBlockStyle | null {
	if (!block) return null;
	const tag = block.tagName.toLowerCase();
	if (tag === "h1") return block.hasAttribute("data-title") ? "title" : "h1";
	if (tag === "h2" || tag === "h3" || tag === "blockquote" || tag === "pre") return tag;
	if (tag === "p" || tag === "div" || tag === "li") return "p";
	return null;
}

export function DocsEditor({ content, contentKey, onChange, readOnly, name }: OfficeEditorProps<"document">) {
	const { t } = useLanguage();
	const pageRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef(content);
	const savedRange = useRef<Range | null>(null);
	const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const plainPaste = useRef(false);
	const [toolbar, setToolbar] = useState<DocsToolbarState>(INITIAL_TOOLBAR);
	const [counts, setCounts] = useState({ words: 0, characters: 0 });
	const [linkDialog, setLinkDialog] = useState<{ url: string; text: string; needsText: boolean } | null>(null);
	const [imageUrlOpen, setImageUrlOpen] = useState(false);
	const [pageSetup, setPageSetup] = useState<DocPage | null>(null);
	const page = content.page ?? DEFAULT_DOC_PAGE;
	const dimensions = pageDimensions(page);

	useLayoutEffect(() => { contentRef.current = content; }, [content]);

	const updateCounts = useCallback(() => {
		const text = pageRef.current?.innerText ?? "";
		setCounts({ words: countWords(text), characters: countCharacters(text) });
	}, []);

	/** Labels and attributes the stored HTML does not carry (sanitizing drops contenteditable). */
	const decorate = useCallback(() => {
		const root = pageRef.current;
		if (!root) return;
		for (const marker of Array.from(root.querySelectorAll("[data-page-break]"))) {
			marker.setAttribute("contenteditable", "false");
			marker.setAttribute("data-label", t("docs.pageBreakLabel"));
		}
		if (readOnly) openLinksInNewTab(root);
	}, [readOnly, t]);

	// The DOM is uncontrolled: it is filled from the stored HTML on mount and when the document is replaced from
	// outside, never on ordinary re-renders, so typing is not interrupted.
	useLayoutEffect(() => {
		const root = pageRef.current;
		if (!root) return;
		root.innerHTML = sanitizeOfficeHtml(contentRef.current.html) || "<p><br></p>";
		decorate();
		updateCounts();
		savedRange.current = null;
		// Only an outside replacement (contentKey) or a mode switch refills the page.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [contentKey, readOnly]);

	useEffect(() => { decorate(); }, [decorate]);

	const flush = useCallback(() => {
		if (changeTimer.current) { clearTimeout(changeTimer.current); changeTimer.current = null; }
		const root = pageRef.current;
		if (!root || readOnly) return;
		const clone = root.cloneNode(true) as HTMLElement;
		for (const marker of Array.from(clone.querySelectorAll("[data-page-break]"))) marker.removeAttribute("data-label");
		const html = clone.innerHTML;
		if (html === contentRef.current.html) return;
		const next = { ...contentRef.current, html };
		contentRef.current = next;
		onChange(next);
	}, [onChange, readOnly]);

	const changed = useCallback(() => {
		if (readOnly) return;
		if (changeTimer.current) clearTimeout(changeTimer.current);
		changeTimer.current = setTimeout(() => { changeTimer.current = null; flush(); updateCounts(); }, CHANGE_DELAY_MS);
	}, [flush, readOnly, updateCounts]);

	useEffect(() => () => { if (changeTimer.current) { clearTimeout(changeTimer.current); flush(); } }, [flush]);

	const refreshToolbar = useCallback(() => {
		const root = pageRef.current;
		const range = selectionRangeIn(root);
		if (!range || !root) return;
		savedRange.current = range.cloneRange();
		const block = blockAtSelection(root);
		const element = elementAtSelection(root);
		const style = computedTextStyle(root);
		const alignValue = block ? window.getComputedStyle(block).textAlign : "left";
		const align: DocsAlign = alignValue === "center" || alignValue === "right" || alignValue === "justify" ? alignValue : "left";
		const list = block?.closest("ul,ol");
		setToolbar({
			bold: queryState("bold"),
			italic: queryState("italic"),
			underline: queryState("underline"),
			strike: queryState("strikeThrough"),
			unorderedList: list?.tagName === "UL",
			orderedList: list?.tagName === "OL",
			checklist: list?.getAttribute("data-type") === "checklist",
			align,
			block: blockStyleOf(block),
			fontSize: style.fontSize,
			fontFamily: style.fontFamily,
			link: !!element?.closest("a"),
			canUndo: (() => { try { return document.queryCommandEnabled("undo"); } catch { return true; } })(),
			canRedo: (() => { try { return document.queryCommandEnabled("redo"); } catch { return true; } })(),
		});
	}, []);

	useEffect(() => {
		if (readOnly) return;
		const onSelection = () => refreshToolbar();
		document.addEventListener("selectionchange", onSelection);
		return () => document.removeEventListener("selectionchange", onSelection);
	}, [readOnly, refreshToolbar]);

	const focusPage = useCallback(() => {
		restoreRange(pageRef.current, selectionRangeIn(pageRef.current) ?? savedRange.current);
		// Semantic tags (<b>, <i>) survive exports; only colours need inline styles.
		exec("styleWithCSS", "false");
	}, []);

	const insertHtml = useCallback((html: string) => {
		focusPage();
		exec("insertHTML", html);
		decorate();
		changed();
	}, [changed, decorate, focusPage]);

	const openLinkDialog = useCallback(() => {
		const root = pageRef.current;
		focusPage();
		const range = selectionRangeIn(root);
		savedRange.current = range?.cloneRange() ?? null;
		const anchor = elementAtSelection(root)?.closest("a");
		if (anchor && range) {
			const whole = document.createRange();
			whole.selectNodeContents(anchor);
			savedRange.current = whole;
		}
		setLinkDialog({ url: anchor?.getAttribute("href") ?? "", text: anchor?.textContent ?? range?.toString() ?? "", needsText: !anchor && (!range || range.collapsed) });
	}, [focusPage]);

	const applyLink = useCallback((url: string, text: string) => {
		const needsText = linkDialog?.needsText;
		setLinkDialog(null);
		requestAnimationFrame(() => {
			restoreRange(pageRef.current, savedRange.current);
			if (needsText) exec("insertHTML", `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>&nbsp;`);
			else exec("createLink", url);
			changed();
		});
	}, [changed, linkDialog]);

	const insertImage = useCallback((src: string) => {
		insertHtml(`<img src="${escapeHtml(src)}" alt="">`);
	}, [insertHtml]);

	const run = useCallback((action: DocsAction) => {
		const root = pageRef.current;
		if (!root || readOnly) return;
		switch (action.type) {
			case "print":
				flush();
				window.print();
				return;
			case "pageSetup":
				setPageSetup(contentRef.current.page ?? DEFAULT_DOC_PAGE);
				return;
			case "link":
				openLinkDialog();
				return;
			case "imageUrl":
				savedRange.current = selectionRangeIn(root)?.cloneRange() ?? savedRange.current;
				setImageUrlOpen(true);
				return;
			case "imageUpload":
				void readImageAsDataUrl(action.file).then(insertImage).catch((error: Error) => toast.error(error.message === "too-large" ? t("docs.image.tooLarge") : t("docs.image.unsupported")));
				return;
		}
		focusPage();
		switch (action.type) {
			case "command":
				exec(action.command);
				break;
			case "align":
				exec(action.align === "left" ? "justifyLeft" : action.align === "center" ? "justifyCenter" : action.align === "right" ? "justifyRight" : "justifyFull");
				break;
			case "block": {
				const tag = action.style === "title" ? "h1" : action.style;
				exec("formatBlock", `<${tag}>`);
				const block = blockAtSelection(root);
				if (block?.tagName === "H1") {
					if (action.style === "title") block.setAttribute("data-title", "true");
					else block.removeAttribute("data-title");
				}
				break;
			}
			case "fontSize":
				if (action.pt > 0) applyInlineStyle(root, "fontSize", `${action.pt}pt`);
				break;
			case "fontFamily":
				if (action.family) applyInlineStyle(root, "fontFamily", action.family);
				break;
			case "color":
				exec("styleWithCSS", "true");
				exec(action.target === "text" ? "foreColor" : "hiliteColor", action.color);
				exec("styleWithCSS", "false");
				break;
			case "checklist":
				toggleChecklist(root);
				break;
			case "table":
				exec("insertHTML", tableHtml(action.rows, action.cols));
				break;
			case "horizontalRule":
				exec("insertHorizontalRule");
				break;
			case "pageBreak":
				exec("insertHTML", PAGE_BREAK_HTML);
				decorate();
				break;
		}
		changed();
		refreshToolbar();
	}, [changed, decorate, flush, focusPage, insertImage, openLinkDialog, readOnly, refreshToolbar, t]);

	function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		if (readOnly) return;
		const mod = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();
		if (mod && event.shiftKey && key === "v") { plainPaste.current = true; return; }
		if (mod && !event.altKey && key === "k") { event.preventDefault(); run({ type: "link" }); return; }
		if (mod && event.altKey && ["1", "2", "3"].includes(event.key)) { event.preventDefault(); run({ type: "block", style: `h${event.key}` as DocsBlockStyle }); return; }
		if (mod && event.altKey && event.key === "0") { event.preventDefault(); run({ type: "block", style: "p" }); return; }
		if (mod && event.shiftKey && (key === "7" || key === "8")) { event.preventDefault(); run({ type: "command", command: key === "7" ? "insertOrderedList" : "insertUnorderedList" }); return; }
		if (mod && event.shiftKey && key === "x") { event.preventDefault(); run({ type: "command", command: "strikeThrough" }); return; }
		if (mod && (key === "y" || (key === "z" && event.shiftKey))) { event.preventDefault(); run({ type: "command", command: "redo" }); return; }
		if (event.key === "Tab" && !mod && !event.altKey) {
			const root = pageRef.current!;
			event.preventDefault();
			if (moveInTable(root, event.shiftKey)) return;
			if (blockAtSelection(root)?.closest("li")) run({ type: "command", command: event.shiftKey ? "outdent" : "indent" });
			else if (!event.shiftKey) { exec("insertText", "    "); changed(); }
		}
	}

	function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
		if (readOnly) return;
		const plain = plainPaste.current;
		plainPaste.current = false;
		const data = event.clipboardData;
		const image = Array.from(data.files).find((file) => file.type.startsWith("image/"));
		if (image && !data.getData("text/html")) {
			event.preventDefault();
			void readImageAsDataUrl(image).then(insertImage).catch((error: Error) => toast.error(error.message === "too-large" ? t("docs.image.tooLarge") : t("docs.image.unsupported")));
			return;
		}
		const html = data.getData("text/html");
		event.preventDefault();
		if (!plain && html) exec("insertHTML", cleanPastedHtml(html));
		else exec("insertText", data.getData("text/plain"));
		decorate();
		changed();
	}

	function onClick(event: React.MouseEvent<HTMLDivElement>) {
		const root = pageRef.current;
		if (!root) return;
		if (!readOnly && toggleChecklistItemAt(event.nativeEvent, root)) { event.preventDefault(); changed(); return; }
		// While editing, a plain click places the caret; Ctrl/Cmd-click follows a link.
		const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
		if (anchor && !readOnly && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			window.open(anchor.href, "_blank", "noopener,noreferrer");
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<style>{editorCss(page)}</style>
			{!readOnly && <div className="shrink-0 px-3 pb-2 pt-1 print:hidden"><DocsToolbar state={toolbar} onAction={run} /></div>}
			<div className="min-h-0 flex-1 overflow-auto bg-neutral-100 px-4 py-6 print:overflow-visible print:bg-transparent print:p-0" onMouseDown={(event) => {
				// A click on the grey canvas below a short document puts the caret at its end.
				if (readOnly || event.target !== event.currentTarget || !pageRef.current) return;
				event.preventDefault();
				const range = document.createRange();
				range.selectNodeContents(pageRef.current);
				range.collapse(false);
				restoreRange(pageRef.current, range);
			}}>
				<div
					className="fs-docs-print mx-auto shadow-[0_1px_3px_rgb(60_64_67/0.3),0_4px_8px_3px_rgb(60_64_67/0.15)]"
					style={{ width: dimensions.width, maxWidth: "100%", minHeight: dimensions.height, padding: `${dimensions.margin}px min(${dimensions.margin}px, 8vw)`, background: "#fff", color: "#202124", colorScheme: "light" }}
				>
					<div
						ref={pageRef}
						role="textbox"
						aria-multiline="true"
						aria-label={name}
						aria-readonly={readOnly || undefined}
						contentEditable={!readOnly}
						suppressContentEditableWarning
						spellCheck={!readOnly}
						className={readOnly ? "fs-docs-content fs-docs-readonly" : "fs-docs-content"}
						style={{ minHeight: dimensions.height - dimensions.margin * 2 }}
						onInput={changed}
						onBlur={() => { flush(); updateCounts(); }}
						onKeyDown={onKeyDown}
						onPaste={onPaste}
						onClick={onClick}
					/>
				</div>
			</div>
			<div className="flex shrink-0 items-center justify-end gap-4 border-t border-neutral-200 px-4 py-1.5 text-xs text-neutral-500 print:hidden" aria-live="polite">
				<span>{t("docs.status.words", { count: counts.words })}</span>
				<span>{t("docs.status.characters", { count: counts.characters })}</span>
			</div>
			<LinkDialog initial={linkDialog} onSubmit={applyLink} onClose={() => { setLinkDialog(null); requestAnimationFrame(() => restoreRange(pageRef.current, savedRange.current)); }} />
			<ImageUrlDialog open={imageUrlOpen} onClose={() => setImageUrlOpen(false)} onSubmit={(url) => { setImageUrlOpen(false); requestAnimationFrame(() => insertImage(url)); }} />
			<PageSetupDialog page={pageSetup} onClose={() => setPageSetup(null)} onSubmit={(next) => {
				setPageSetup(null);
				flush();
				const updated = { ...contentRef.current, page: next };
				contentRef.current = updated;
				onChange(updated);
			}} />
		</div>
	);
}
