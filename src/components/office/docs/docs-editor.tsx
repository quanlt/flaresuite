"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Bold, CalendarDays, Copy, Image as ImageIcon, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Maximize2, Minus, RemoveFormatting, Search, Strikethrough, Underline } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import type { OfficeEditorProps } from "../office-types";
import { readImageAsDataUrl } from "../office-client-utils";
import { shortcutLabel, useOfficeMenus } from "../office-menus";
import type { OfficeMenu, OfficeMenuItem } from "../office-menus";
import { sanitizeOfficeHtml } from "../sanitize";
import { ImageUrlDialog, LinkDialog, PageSetupDialog, SpecialCharactersDialog, TableDialog, WordCountDialog } from "./docs-dialogs";
import { applyInlineStyle, blockAtSelection, cleanPastedHtml, computedTextStyle, editTable, elementAtSelection, exec, moveInTable, openLinksInNewTab, PAGE_BREAK_HTML, queryState, restoreRange, selectionRangeIn, setBlockStyle, setListStyle, tableHtml, toggleChecklist, toggleChecklistItemAt, transformSelectedText } from "./docs-dom";
import { FindReplacePanel } from "./docs-find";
import { AlignCenterGlyph, AlignJustifyGlyph, AlignLeftGlyph, AlignRightGlyph, CutGlyph, IndentGlyph, LineSpacingGlyph, OmegaGlyph, OutdentGlyph, OutlineGlyph, PageBreakGlyph, PageSetupGlyph, PasteGlyph, RedoGlyph, SelectAllGlyph, SubscriptGlyph, SuperscriptGlyph, TableGlyph, UndoGlyph, ZoomGlyph } from "./docs-icons";
import { DocsToolbar } from "./docs-toolbar";
import type { DocsAction, DocsAlign, DocsBlockStyle, DocsListStyle, DocsToolbarState, DocsViewState } from "./docs-types";
import { changeCase, DEFAULT_DOC_PAGE, DOC_CONTENT_CSS, escapeHtml, formatInsertDate, LINE_HEIGHTS, nearestLineHeight, pageDimensions, stepFontSize, textStats, ZOOM_LEVELS } from "./docs-utils";
import type { DocPage } from "./docs-utils";

const CHANGE_DELAY_MS = 300;

const INITIAL_TOOLBAR: DocsToolbarState = {
	bold: false, italic: false, underline: false, strike: false, superscript: false, subscript: false,
	unorderedList: false, orderedList: false, checklist: false, align: "left", block: "p", fontSize: 11, fontFamily: null,
	lineHeight: null, spaceBefore: false, spaceAfter: true, link: false, inTable: false, canUndo: false, canRedo: false,
};

const INITIAL_VIEW: DocsViewState = { zoom: 100, printLayout: true, outline: false, wordCount: true };

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
.fs-docs-pageless .fs-docs-content [data-page-break] { margin: 24px 0; }
.fs-docs-content [data-page-break]::after { content: attr(data-label); position: absolute; left: 50%; top: -9px; transform: translateX(-50%); background: #fff; padding: 0 8px; font-size: 11px; color: #80868b; }
.fs-docs-content ul[data-type="checklist"] > li::before { cursor: pointer; }
.fs-docs-readonly ul[data-type="checklist"] > li::before { cursor: default; }
::highlight(fs-docs-find) { background-color: #fde293; }
::highlight(fs-docs-find-current) { background-color: #f9ab00; }
@media print {
	@page { size: ${pageDimensions(page).css}; margin: 0; }
	body * { visibility: hidden !important; }
	.fs-docs-print, .fs-docs-print * { visibility: visible !important; }
	.fs-docs-print { position: absolute !important; left: 0; top: 0; margin: 0 !important; box-shadow: none !important; width: 100% !important; min-height: 0 !important; zoom: 1 !important; }
	.fs-docs-content [data-page-break] { border: 0; margin: 0; }
	.fs-docs-content [data-page-break]::after { content: none; }
}`;
}

function blockStyleOf(block: HTMLElement | null): DocsBlockStyle | null {
	if (!block) return null;
	const tag = block.tagName.toLowerCase();
	if (tag === "h1") return block.hasAttribute("data-title") ? "title" : "h1";
	if (tag === "h2" || tag === "h3" || tag === "blockquote" || tag === "pre") return tag;
	if (tag === "p") return block.hasAttribute("data-subtitle") ? "subtitle" : "p";
	if (tag === "div" || tag === "li") return "p";
	return null;
}

function commandEnabled(command: string): boolean {
	try { return document.queryCommandEnabled(command); } catch { return true; }
}

/** Ctrl+H, or ⌘⇧H on Apple devices where ⌘H hides the browser. */
function findReplaceShortcut(): string {
	const label = shortcutLabel("Mod+H");
	return label.startsWith("⌘") ? shortcutLabel("Mod+Shift+H") : label;
}

type OutlineEntry = { level: number; text: string };

export function DocsEditor({ content, contentKey, onChange, readOnly, name }: OfficeEditorProps<"document">) {
	const { t, locale } = useLanguage();
	const containerRef = useRef<HTMLDivElement>(null);
	const pageRef = useRef<HTMLDivElement>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const contentRef = useRef(content);
	const savedRange = useRef<Range | null>(null);
	const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const plainPaste = useRef(false);
	const [toolbar, setToolbar] = useState<DocsToolbarState>(INITIAL_TOOLBAR);
	const [view, setView] = useState<DocsViewState>(INITIAL_VIEW);
	const [counts, setCounts] = useState({ words: 0, characters: 0, version: 0 });
	const [outline, setOutline] = useState<OutlineEntry[]>([]);
	const [fullscreen, setFullscreen] = useState(false);
	const [linkDialog, setLinkDialog] = useState<{ url: string; text: string; needsText: boolean } | null>(null);
	const [imageUrlOpen, setImageUrlOpen] = useState(false);
	const [tableOpen, setTableOpen] = useState(false);
	const [specialOpen, setSpecialOpen] = useState(false);
	const [findMode, setFindMode] = useState<{ replace: boolean; seed: string; nonce: number } | null>(null);
	const [wordCount, setWordCount] = useState<{ document: ReturnType<typeof textStats>; selection: ReturnType<typeof textStats> | null; pages: number } | null>(null);
	const [pageSetup, setPageSetup] = useState<DocPage | null>(null);
	const page = content.page ?? DEFAULT_DOC_PAGE;
	const dimensions = pageDimensions(page);

	useLayoutEffect(() => { contentRef.current = content; }, [content]);

	const updateCounts = useCallback(() => {
		const root = pageRef.current;
		const stats = textStats(root?.innerText ?? "");
		setCounts((previous) => ({ words: stats.words, characters: stats.characters, version: previous.version + 1 }));
		setOutline(root
			? Array.from(root.querySelectorAll("h1,h2,h3")).map((heading) => ({ level: heading.hasAttribute("data-title") ? 0 : Number(heading.tagName[1]), text: (heading.textContent ?? "").trim() })).filter((entry) => entry.text)
			: []);
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

	// Ctrl+P and File > Print print what is on the page; make sure the saved copy matches it.
	useEffect(() => {
		window.addEventListener("beforeprint", flush);
		return () => window.removeEventListener("beforeprint", flush);
	}, [flush]);

	useEffect(() => {
		const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", onFullscreen);
		return () => document.removeEventListener("fullscreenchange", onFullscreen);
	}, []);

	const refreshToolbar = useCallback(() => {
		const root = pageRef.current;
		const range = selectionRangeIn(root);
		if (!range || !root) return;
		savedRange.current = range.cloneRange();
		const block = blockAtSelection(root);
		const element = elementAtSelection(root);
		const style = computedTextStyle(root);
		const blockStyle = block ? window.getComputedStyle(block) : null;
		const alignValue = blockStyle?.textAlign ?? "left";
		const align: DocsAlign = alignValue === "center" || alignValue === "right" || alignValue === "justify" ? alignValue : "left";
		const list = block?.closest("ul,ol");
		const lineHeight = blockStyle ? parseFloat(blockStyle.lineHeight) / parseFloat(blockStyle.fontSize) : null;
		setToolbar({
			bold: queryState("bold"),
			italic: queryState("italic"),
			underline: queryState("underline"),
			strike: queryState("strikeThrough"),
			superscript: queryState("superscript"),
			subscript: queryState("subscript"),
			unorderedList: list?.tagName === "UL",
			orderedList: list?.tagName === "OL",
			checklist: list?.getAttribute("data-type") === "checklist",
			align,
			block: blockStyleOf(block),
			fontSize: style.fontSize,
			fontFamily: style.fontFamily,
			lineHeight: nearestLineHeight(lineHeight),
			spaceBefore: !!blockStyle && parseFloat(blockStyle.marginTop) > 0,
			spaceAfter: !!blockStyle && parseFloat(blockStyle.marginBottom) > 0,
			link: !!element?.closest("a"),
			inTable: !!element?.closest("td,th"),
			canUndo: commandEnabled("undo"),
			canRedo: commandEnabled("redo"),
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

	/** Inserts text where the caret was without focusing the page (a modal dialog keeps focus). */
	const insertTextAtSavedRange = useCallback((text: string) => {
		const root = pageRef.current;
		if (!root) return;
		let range = savedRange.current && root.contains(savedRange.current.startContainer) ? savedRange.current : null;
		if (!range) {
			range = document.createRange();
			range.selectNodeContents(root.lastElementChild ?? root);
			range.collapse(false);
		}
		range.deleteContents();
		const node = document.createTextNode(text);
		range.insertNode(node);
		range.setStartAfter(node);
		range.collapse(true);
		savedRange.current = range;
		changed();
	}, [changed]);

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

	const uploadImage = useCallback((file: File) => {
		void readImageAsDataUrl(file).then(insertImage).catch((error: Error) => toast.error(error.message === "too-large" ? t("docs.image.tooLarge") : t("docs.image.unsupported")));
	}, [insertImage, t]);

	const clipboardBlocked = useCallback((shortcut: string) => {
		toast(t("docs.clipboard.blocked", { shortcut: shortcutLabel(shortcut) }));
	}, [t]);

	const pasteFromClipboard = useCallback(async (plain: boolean) => {
		try {
			let html = "";
			let text = "";
			if (!plain && navigator.clipboard?.read) {
				for (const item of await navigator.clipboard.read()) {
					if (!html && item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
					if (!text && item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
				}
			} else {
				text = await navigator.clipboard.readText();
			}
			focusPage();
			if (html) exec("insertHTML", cleanPastedHtml(html));
			else if (text) exec("insertText", text);
			decorate();
			changed();
		} catch {
			clipboardBlocked(plain ? "Mod+Shift+V" : "Mod+V");
		}
	}, [changed, clipboardBlocked, decorate, focusPage]);

	const openWordCount = useCallback(() => {
		const root = pageRef.current;
		if (!root) return;
		const range = selectionRangeIn(root) ?? savedRange.current;
		const selected = range && !range.collapsed ? range.toString() : "";
		const breaks = root.querySelectorAll("[data-page-break]").length;
		const usable = dimensions.height - dimensions.margin * 2;
		setWordCount({
			document: textStats(root.innerText),
			selection: selected.trim() ? textStats(selected) : null,
			pages: Math.max(breaks + 1, Math.ceil(root.offsetHeight / usable)),
		});
	}, [dimensions.height, dimensions.margin]);

	const openFind = useCallback((replace: boolean) => {
		const range = selectionRangeIn(pageRef.current);
		const selected = range && !range.collapsed ? range.toString() : "";
		setFindMode((previous) => ({ replace: replace && !readOnly, seed: selected.length < 200 && !selected.includes("\n") ? selected : "", nonce: (previous?.nonce ?? 0) + 1 }));
	}, [readOnly]);

	const run = useCallback((action: DocsAction) => {
		const root = pageRef.current;
		if (!root) return;
		// Actions that do not change the document work for viewers too.
		switch (action.type) {
			case "print":
				flush();
				window.print();
				return;
			case "find":
				openFind(action.replace);
				return;
			case "wordCount":
				openWordCount();
				return;
		}
		if (action.type === "command" && (action.command === "copy" || action.command === "selectAll") && readOnly) {
			if (action.command === "selectAll") {
				const range = document.createRange();
				range.selectNodeContents(root);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
			} else if (!exec("copy")) clipboardBlocked("Mod+C");
			return;
		}
		if (readOnly) return;
		switch (action.type) {
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
				uploadImage(action.file);
				return;
			case "tableDialog":
				savedRange.current = selectionRangeIn(root)?.cloneRange() ?? savedRange.current;
				setTableOpen(true);
				return;
			case "specialCharacters":
				savedRange.current = selectionRangeIn(root)?.cloneRange() ?? savedRange.current;
				setSpecialOpen(true);
				return;
			case "paste":
				focusPage();
				void pasteFromClipboard(action.plain);
				return;
		}
		focusPage();
		switch (action.type) {
			case "command":
				if (action.command === "cut" || action.command === "copy") {
					if (!exec(action.command)) clipboardBlocked(action.command === "cut" ? "Mod+X" : "Mod+C");
				} else {
					exec(action.command);
				}
				break;
			case "align":
				exec(action.align === "left" ? "justifyLeft" : action.align === "center" ? "justifyCenter" : action.align === "right" ? "justifyRight" : "justifyFull");
				break;
			case "block": {
				const tag = action.style === "title" ? "h1" : action.style === "subtitle" ? "p" : action.style;
				exec("formatBlock", `<${tag}>`);
				const block = blockAtSelection(root);
				if (block?.tagName === "H1") {
					if (action.style === "title") block.setAttribute("data-title", "true");
					else block.removeAttribute("data-title");
				}
				if (block?.tagName === "P") {
					if (action.style === "subtitle") block.setAttribute("data-subtitle", "true");
					else block.removeAttribute("data-subtitle");
				}
				break;
			}
			case "fontSize":
				if (action.pt > 0) applyInlineStyle(root, "fontSize", `${action.pt}pt`);
				break;
			case "fontSizeStep":
				applyInlineStyle(root, "fontSize", `${stepFontSize(computedTextStyle(root).fontSize, action.direction)}pt`);
				break;
			case "fontFamily":
				if (action.family) applyInlineStyle(root, "fontFamily", action.family);
				break;
			case "color":
				exec("styleWithCSS", "true");
				exec(action.target === "text" ? "foreColor" : "hiliteColor", action.color);
				exec("styleWithCSS", "false");
				break;
			case "lineHeight":
				setBlockStyle(root, "lineHeight", String(action.value));
				break;
			case "paragraphSpacing":
				setBlockStyle(root, action.edge === "before" ? "marginTop" : "marginBottom", action.add ? "12pt" : "0");
				break;
			case "textCase":
				transformSelectedText(root, (text, previous) => changeCase(text, action.mode, previous));
				break;
			case "listStyle":
				setListStyle(root, action.style);
				break;
			case "checklist":
				toggleChecklist(root);
				break;
			case "table":
				exec("insertHTML", tableHtml(action.rows, action.cols));
				break;
			case "tableEdit":
				editTable(root, action.edit);
				break;
			case "horizontalRule":
				exec("insertHorizontalRule");
				break;
			case "pageBreak":
				exec("insertHTML", PAGE_BREAK_HTML);
				decorate();
				break;
			case "insertText":
				exec("insertText", action.text);
				break;
			case "date":
				exec("insertText", formatInsertDate(new Date(), locale));
				break;
		}
		changed();
		refreshToolbar();
	}, [changed, clipboardBlocked, decorate, flush, focusPage, locale, openFind, openLinkDialog, openWordCount, pasteFromClipboard, readOnly, refreshToolbar, uploadImage]);

	/** Menus blur the page: put the last selection back before the action runs. */
	const runFromMenu = useCallback((action: DocsAction) => {
		if (!readOnly && pageRef.current && savedRange.current) restoreRange(pageRef.current, savedRange.current);
		run(action);
	}, [readOnly, run]);

	const setZoom = useCallback((zoom: number) => setView((previous) => ({ ...previous, zoom })), []);

	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
		else void document.documentElement.requestFullscreen?.().catch(() => undefined);
	}, []);

	const jumpToHeading = useCallback((index: number) => {
		const root = pageRef.current;
		const headings = Array.from(root?.querySelectorAll("h1,h2,h3") ?? []).filter((heading) => (heading.textContent ?? "").trim());
		const heading = headings[index];
		if (!root || !heading) return;
		heading.scrollIntoView({ block: "start", behavior: "smooth" });
		if (readOnly) return;
		const range = document.createRange();
		range.selectNodeContents(heading);
		range.collapse(true);
		restoreRange(root, range);
	}, [readOnly]);

	// Shortcuts that also work for viewers and outside the page (find, word count).
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const mod = event.metaKey || event.ctrlKey;
			if (!mod || event.altKey) return;
			const target = event.target as Node | null;
			if (target && target !== document.body && !containerRef.current?.contains(target)) return;
			const key = event.key.toLowerCase();
			if (key === "f" && !event.shiftKey) { event.preventDefault(); openFind(false); }
			else if (key === "h") { event.preventDefault(); openFind(true); }
			else if (key === "c" && event.shiftKey) { event.preventDefault(); openWordCount(); }
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [openFind, openWordCount]);

	const menus = useMemo<OfficeMenu[]>(() => {
		const item = (id: string, label: string, action: DocsAction, extra: Partial<Extract<OfficeMenuItem, { kind: "item" }>> = {}): OfficeMenuItem => ({ kind: "item", id, label, onSelect: () => runFromMenu(action), ...extra });
		const separator: OfficeMenuItem = { kind: "separator" };
		const command = (id: string, label: string, name: Extract<DocsAction, { type: "command" }>["command"], extra: Partial<Extract<OfficeMenuItem, { kind: "item" }>> = {}) => item(id, label, { type: "command", command: name }, extra);
		const zoomMenu: OfficeMenuItem = {
			kind: "submenu", id: "zoom", label: t("docs.menu.zoom"), icon: ZoomGlyph,
			items: ZOOM_LEVELS.map((level) => ({ kind: "item", id: `zoom-${level}`, label: `${level}%`, checked: view.zoom === level, onSelect: () => setZoom(level) })),
		};
		const viewMenu: OfficeMenu = {
			id: "view", label: t("docs.menu.view"), items: [
				{ kind: "item", id: "print-layout", label: t("docs.menu.printLayout"), checked: view.printLayout, onSelect: () => setView((previous) => ({ ...previous, printLayout: !previous.printLayout })) },
				{ kind: "item", id: "outline", label: t("docs.menu.showOutline"), icon: OutlineGlyph, checked: view.outline, onSelect: () => setView((previous) => ({ ...previous, outline: !previous.outline })) },
				{ kind: "item", id: "word-count-bar", label: t("docs.menu.showWordCount"), checked: view.wordCount, onSelect: () => setView((previous) => ({ ...previous, wordCount: !previous.wordCount })) },
				separator,
				zoomMenu,
				separator,
				{ kind: "item", id: "fullscreen", label: t("docs.menu.fullScreen"), icon: Maximize2, checked: fullscreen, onSelect: toggleFullscreen },
			],
		};
		const toolsMenu: OfficeMenu = {
			id: "tools", label: t("docs.menu.tools"), items: [
				item("word-count", t("docs.menu.wordCount"), { type: "wordCount" }, { shortcut: shortcutLabel("Mod+Shift+C") }),
			],
		};
		if (readOnly) {
			return [
				{
					id: "edit", label: t("docs.menu.edit"), items: [
						command("copy", t("docs.menu.copy"), "copy", { icon: Copy, shortcut: shortcutLabel("Mod+C") }),
						command("select-all", t("docs.menu.selectAll"), "selectAll", { icon: SelectAllGlyph, shortcut: shortcutLabel("Mod+A") }),
						separator,
						item("find", t("docs.menu.find"), { type: "find", replace: false }, { icon: Search, shortcut: shortcutLabel("Mod+F") }),
					],
				},
				viewMenu,
				toolsMenu,
			];
		}
		const styleItem = (style: DocsBlockStyle, label: string, shortcut?: string) => item(`style-${style}`, label, { type: "block", style }, { checked: toolbar.block === style, shortcut: shortcut && shortcutLabel(shortcut) });
		const alignItem = (align: DocsAlign, label: string, icon: Extract<OfficeMenuItem, { kind: "item" }>["icon"], shortcut: string) => item(`align-${align}`, label, { type: "align", align }, { icon, checked: toolbar.align === align, shortcut: shortcutLabel(shortcut) });
		const listStyleItem = (style: DocsListStyle, label: string) => item(`list-${style}`, label, { type: "listStyle", style });
		const tableItem = (edit: Extract<DocsAction, { type: "tableEdit" }>["edit"], label: string) => item(`table-${edit}`, label, { type: "tableEdit", edit }, { disabled: !toolbar.inTable, danger: edit.startsWith("delete") });
		return [
			{
				id: "edit", label: t("docs.menu.edit"), items: [
					command("undo", t("docs.menu.undo"), "undo", { icon: UndoGlyph, shortcut: shortcutLabel("Mod+Z"), disabled: !toolbar.canUndo }),
					command("redo", t("docs.menu.redo"), "redo", { icon: RedoGlyph, shortcut: shortcutLabel("Mod+Shift+Z"), disabled: !toolbar.canRedo }),
					separator,
					command("cut", t("docs.menu.cut"), "cut", { icon: CutGlyph, shortcut: shortcutLabel("Mod+X") }),
					command("copy", t("docs.menu.copy"), "copy", { icon: Copy, shortcut: shortcutLabel("Mod+C") }),
					item("paste", t("docs.menu.paste"), { type: "paste", plain: false }, { icon: PasteGlyph, shortcut: shortcutLabel("Mod+V") }),
					item("paste-plain", t("docs.menu.pastePlain"), { type: "paste", plain: true }, { shortcut: shortcutLabel("Mod+Shift+V") }),
					separator,
					command("select-all", t("docs.menu.selectAll"), "selectAll", { icon: SelectAllGlyph, shortcut: shortcutLabel("Mod+A") }),
					separator,
					item("find", t("docs.menu.find"), { type: "find", replace: false }, { icon: Search, shortcut: shortcutLabel("Mod+F") }),
					item("find-replace", t("docs.menu.findReplace"), { type: "find", replace: true }, { shortcut: findReplaceShortcut() }),
				],
			},
			viewMenu,
			{
				id: "insert", label: t("docs.menu.insert"), items: [
					{
						kind: "submenu", id: "image", label: t("docs.menu.image"), icon: ImagePlus, items: [
							{ kind: "item", id: "image-upload", label: t("docs.toolbar.imageUpload"), icon: ImageIcon, onSelect: () => fileInput.current?.click() },
							item("image-url", t("docs.toolbar.imageUrl"), { type: "imageUrl" }, { icon: Link2 }),
						],
					},
					item("table", t("docs.menu.table"), { type: "tableDialog" }, { icon: TableGlyph }),
					item("link", t("docs.menu.link"), { type: "link" }, { icon: Link2, shortcut: shortcutLabel("Mod+K") }),
					separator,
					item("horizontal-rule", t("docs.toolbar.horizontalRule"), { type: "horizontalRule" }, { icon: Minus }),
					item("page-break", t("docs.toolbar.pageBreak"), { type: "pageBreak" }, { icon: PageBreakGlyph, shortcut: shortcutLabel("Mod+Enter") }),
					separator,
					item("special-characters", t("docs.menu.specialCharacters"), { type: "specialCharacters" }, { icon: OmegaGlyph }),
					item("date", t("docs.menu.date"), { type: "date" }, { icon: CalendarDays }),
					item("checklist", t("docs.toolbar.checklist"), { type: "checklist" }, { icon: ListChecks, shortcut: shortcutLabel("Mod+Shift+9") }),
				],
			},
			{
				id: "format", label: t("docs.menu.format"), items: [
					{
						kind: "submenu", id: "text", label: t("docs.menu.text"), icon: Bold, items: [
							command("bold", t("docs.menu.bold"), "bold", { icon: Bold, checked: toolbar.bold, shortcut: shortcutLabel("Mod+B") }),
							command("italic", t("docs.menu.italic"), "italic", { icon: Italic, checked: toolbar.italic, shortcut: shortcutLabel("Mod+I") }),
							command("underline", t("docs.menu.underline"), "underline", { icon: Underline, checked: toolbar.underline, shortcut: shortcutLabel("Mod+U") }),
							command("strike", t("docs.menu.strikethrough"), "strikeThrough", { icon: Strikethrough, checked: toolbar.strike, shortcut: shortcutLabel("Mod+Shift+X") }),
							command("superscript", t("docs.menu.superscript"), "superscript", { icon: SuperscriptGlyph, checked: toolbar.superscript, shortcut: shortcutLabel("Mod+.") }),
							command("subscript", t("docs.menu.subscript"), "subscript", { icon: SubscriptGlyph, checked: toolbar.subscript, shortcut: shortcutLabel("Mod+,") }),
							separator,
							item("size-up", t("docs.menu.increaseFontSize"), { type: "fontSizeStep", direction: 1 }, { shortcut: shortcutLabel("Mod+Shift+.") }),
							item("size-down", t("docs.menu.decreaseFontSize"), { type: "fontSizeStep", direction: -1 }, { shortcut: shortcutLabel("Mod+Shift+,") }),
							separator,
							{
								kind: "submenu", id: "case", label: t("docs.menu.capitalization"), items: [
									item("case-lower", t("docs.menu.lowercase"), { type: "textCase", mode: "lower" }),
									item("case-upper", t("docs.menu.uppercase"), { type: "textCase", mode: "upper" }),
									item("case-title", t("docs.menu.titleCase"), { type: "textCase", mode: "title" }),
								],
							},
						],
					},
					{
						kind: "submenu", id: "styles", label: t("docs.menu.paragraphStyles"), items: [
							styleItem("p", t("docs.style.normal"), "Mod+Alt+0"),
							styleItem("title", t("docs.style.title")),
							styleItem("subtitle", t("docs.style.subtitle")),
							styleItem("h1", t("docs.style.heading1"), "Mod+Alt+1"),
							styleItem("h2", t("docs.style.heading2"), "Mod+Alt+2"),
							styleItem("h3", t("docs.style.heading3"), "Mod+Alt+3"),
							styleItem("blockquote", t("docs.style.quote")),
							styleItem("pre", t("docs.style.code")),
						],
					},
					{
						kind: "submenu", id: "align", label: t("docs.menu.alignIndent"), icon: AlignLeftGlyph, items: [
							alignItem("left", t("docs.toolbar.alignLeft"), AlignLeftGlyph, "Mod+Shift+L"),
							alignItem("center", t("docs.toolbar.alignCenter"), AlignCenterGlyph, "Mod+Shift+E"),
							alignItem("right", t("docs.toolbar.alignRight"), AlignRightGlyph, "Mod+Shift+R"),
							alignItem("justify", t("docs.toolbar.alignJustify"), AlignJustifyGlyph, "Mod+Shift+J"),
							separator,
							command("indent", t("docs.toolbar.indent"), "indent", { icon: IndentGlyph, shortcut: shortcutLabel("Mod+]") }),
							command("outdent", t("docs.toolbar.outdent"), "outdent", { icon: OutdentGlyph, shortcut: shortcutLabel("Mod+[") }),
						],
					},
					{
						kind: "submenu", id: "spacing", label: t("docs.menu.lineSpacing"), icon: LineSpacingGlyph, items: [
							...LINE_HEIGHTS.map((entry) => item(`line-${entry.key}`, t(`docs.spacing.${entry.key}`), { type: "lineHeight", value: entry.value }, { checked: toolbar.lineHeight === entry.value })),
							separator,
							item("space-before", toolbar.spaceBefore ? t("docs.spacing.removeBefore") : t("docs.spacing.addBefore"), { type: "paragraphSpacing", edge: "before", add: !toolbar.spaceBefore }),
							item("space-after", toolbar.spaceAfter ? t("docs.spacing.removeAfter") : t("docs.spacing.addAfter"), { type: "paragraphSpacing", edge: "after", add: !toolbar.spaceAfter }),
						],
					},
					{
						kind: "submenu", id: "lists", label: t("docs.menu.bulletsNumbering"), icon: List, items: [
							command("bulleted", t("docs.menu.bulletedList"), "insertUnorderedList", { icon: List, checked: toolbar.unorderedList && !toolbar.checklist, shortcut: shortcutLabel("Mod+Shift+8") }),
							command("numbered", t("docs.menu.numberedList"), "insertOrderedList", { icon: ListOrdered, checked: toolbar.orderedList, shortcut: shortcutLabel("Mod+Shift+7") }),
							item("checklist", t("docs.toolbar.checklist"), { type: "checklist" }, { icon: ListChecks, checked: toolbar.checklist, shortcut: shortcutLabel("Mod+Shift+9") }),
							separator,
							{
								kind: "submenu", id: "bullet-style", label: t("docs.menu.bulletStyle"), items: [
									listStyleItem("disc", `●  ${t("docs.list.disc")}`),
									listStyleItem("circle", `○  ${t("docs.list.circle")}`),
									listStyleItem("square", `■  ${t("docs.list.square")}`),
								],
							},
							{
								kind: "submenu", id: "number-style", label: t("docs.menu.numberStyle"), items: [
									listStyleItem("decimal", "1. 2. 3."),
									listStyleItem("lower-alpha", "a. b. c."),
									listStyleItem("upper-alpha", "A. B. C."),
									listStyleItem("lower-roman", "i. ii. iii."),
									listStyleItem("upper-roman", "I. II. III."),
								],
							},
						],
					},
					{
						kind: "submenu", id: "table", label: t("docs.menu.table"), icon: TableGlyph, items: [
							tableItem("rowAbove", t("docs.table.rowAbove")),
							tableItem("rowBelow", t("docs.table.rowBelow")),
							tableItem("columnLeft", t("docs.table.columnLeft")),
							tableItem("columnRight", t("docs.table.columnRight")),
							separator,
							tableItem("deleteRow", t("docs.table.deleteRow")),
							tableItem("deleteColumn", t("docs.table.deleteColumn")),
							tableItem("deleteTable", t("docs.table.deleteTable")),
						],
					},
					separator,
					item("page-setup", t("docs.menu.pageSetup"), { type: "pageSetup" }, { icon: PageSetupGlyph }),
					separator,
					command("clear-formatting", t("docs.toolbar.clearFormatting"), "removeFormat", { icon: RemoveFormatting, shortcut: shortcutLabel("Mod+\\") }),
				],
			},
			toolsMenu,
		];
	}, [fullscreen, readOnly, runFromMenu, setZoom, t, toggleFullscreen, toolbar, view]);

	useOfficeMenus(menus);

	function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		if (readOnly) return;
		const mod = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();
		const code = event.code;
		const handle = (action: DocsAction) => { event.preventDefault(); run(action); };
		if (mod && event.shiftKey && key === "v") { plainPaste.current = true; return; }
		if (mod && !event.altKey && key === "k") return handle({ type: "link" });
		if (mod && event.altKey && ["Digit0", "Digit1", "Digit2", "Digit3"].includes(code)) return handle({ type: "block", style: code === "Digit0" ? "p" : `h${code.slice(-1)}` as DocsBlockStyle });
		if (mod && event.shiftKey && (code === "Digit7" || code === "Digit8")) return handle({ type: "command", command: code === "Digit7" ? "insertOrderedList" : "insertUnorderedList" });
		if (mod && event.shiftKey && code === "Digit9") return handle({ type: "checklist" });
		if (mod && event.shiftKey && key === "x") return handle({ type: "command", command: "strikeThrough" });
		if (mod && (key === "y" || (key === "z" && event.shiftKey))) return handle({ type: "command", command: "redo" });
		if (mod && !event.altKey && (code === "Period" || code === "Comma")) {
			if (event.shiftKey) return handle({ type: "fontSizeStep", direction: code === "Period" ? 1 : -1 });
			return handle({ type: "command", command: code === "Period" ? "superscript" : "subscript" });
		}
		if (mod && !event.shiftKey && code === "Backslash") return handle({ type: "command", command: "removeFormat" });
		if (mod && !event.shiftKey && !event.altKey && (code === "BracketLeft" || code === "BracketRight")) return handle({ type: "command", command: code === "BracketRight" ? "indent" : "outdent" });
		if (mod && event.shiftKey && !event.altKey && ["l", "e", "r", "j"].includes(key)) {
			return handle({ type: "align", align: key === "l" ? "left" : key === "e" ? "center" : key === "r" ? "right" : "justify" });
		}
		if (mod && !event.shiftKey && key === "enter") return handle({ type: "pageBreak" });
		if (event.key === "Tab" && !mod && !event.altKey) {
			const root = pageRef.current!;
			event.preventDefault();
			if (moveInTable(root, event.shiftKey)) return;
			if (blockAtSelection(root)?.closest("li")) run({ type: "command", command: event.shiftKey ? "outdent" : "indent" });
			else if (!event.shiftKey) { exec("insertText", "    "); changed(); }
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
			uploadImage(image);
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

	const pageStyle: React.CSSProperties = view.printLayout
		? { width: dimensions.width, maxWidth: "100%", minHeight: dimensions.height, padding: `${dimensions.margin}px min(${dimensions.margin}px, 8vw)` }
		: { width: "100%", maxWidth: 960, minHeight: "100%", padding: "32px min(64px, 6vw)" };

	return (
		<div ref={containerRef} className="flex h-full min-h-0 flex-col">
			<style>{editorCss(page)}</style>
			<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) run({ type: "imageUpload", file }); }} />
			{!readOnly && <div className="shrink-0 px-3 pb-2 pt-1 print:hidden"><DocsToolbar state={toolbar} zoom={view.zoom} onZoom={setZoom} onAction={run} /></div>}
			<div className="relative flex min-h-0 flex-1">
				{view.outline && (
					<nav aria-label={t("docs.outline.title")} className="hidden w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white px-3 py-4 text-sm md:block print:hidden">
						<p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{t("docs.outline.title")}</p>
						{outline.length === 0 && <p className="px-2 text-xs text-neutral-500">{t("docs.outline.empty")}</p>}
						<ul className="space-y-0.5">
							{outline.map((entry, index) => (
								<li key={index}>
									<button type="button" onClick={() => jumpToHeading(index)} className="w-full truncate rounded-md px-2 py-1 text-left text-neutral-700 hover:bg-neutral-100" style={{ paddingLeft: 8 + Math.max(0, entry.level - 1) * 12, fontWeight: entry.level <= 1 ? 500 : 400 }} title={entry.text}>
										{entry.text}
									</button>
								</li>
							))}
						</ul>
					</nav>
				)}
				<div className={view.printLayout ? "min-h-0 flex-1 overflow-auto bg-neutral-100 px-4 py-6 print:overflow-visible print:bg-transparent print:p-0" : "fs-docs-pageless min-h-0 flex-1 overflow-auto bg-white print:overflow-visible print:p-0"} onMouseDown={(event) => {
					// A click on the grey canvas below a short document puts the caret at its end.
					if (readOnly || event.target !== event.currentTarget || !pageRef.current) return;
					event.preventDefault();
					const range = document.createRange();
					range.selectNodeContents(pageRef.current);
					range.collapse(false);
					restoreRange(pageRef.current, range);
				}}>
					<div
						className={view.printLayout ? "fs-docs-print mx-auto shadow-[0_1px_3px_rgb(60_64_67/0.3),0_4px_8px_3px_rgb(60_64_67/0.15)]" : "fs-docs-print mx-auto"}
						style={{ ...pageStyle, background: "#fff", color: "#202124", colorScheme: "light", zoom: view.zoom === 100 ? undefined : view.zoom / 100 }}
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
							style={{ minHeight: view.printLayout ? dimensions.height - dimensions.margin * 2 : 320 }}
							onInput={changed}
							onBlur={() => { flush(); updateCounts(); }}
							onKeyDown={onKeyDown}
							onPaste={onPaste}
							onClick={onClick}
						/>
					</div>
				</div>
				<FindReplacePanel pageRef={pageRef} mode={findMode} readOnly={readOnly} version={counts.version} onReplaced={changed} onClose={() => { setFindMode(null); if (!readOnly) requestAnimationFrame(() => restoreRange(pageRef.current, savedRange.current)); }} />
			</div>
			{view.wordCount && (
				<div className="flex shrink-0 items-center justify-end gap-4 border-t border-neutral-200 px-4 py-1.5 text-xs text-neutral-500 print:hidden" aria-live="polite">
					<button type="button" onClick={openWordCount} className="flex gap-4 rounded px-1 hover:bg-neutral-100" title={t("docs.menu.wordCount")}>
						<span>{t("docs.status.words", { count: counts.words })}</span>
						<span>{t("docs.status.characters", { count: counts.characters })}</span>
					</button>
				</div>
			)}
			<LinkDialog initial={linkDialog} onSubmit={applyLink} onClose={() => { setLinkDialog(null); requestAnimationFrame(() => restoreRange(pageRef.current, savedRange.current)); }} />
			<ImageUrlDialog open={imageUrlOpen} onClose={() => setImageUrlOpen(false)} onSubmit={(url) => { setImageUrlOpen(false); requestAnimationFrame(() => insertImage(url)); }} />
			<TableDialog open={tableOpen} onClose={() => setTableOpen(false)} onSubmit={(rows, cols) => { setTableOpen(false); requestAnimationFrame(() => insertHtml(tableHtml(rows, cols))); }} />
			<SpecialCharactersDialog open={specialOpen} onPick={insertTextAtSavedRange} onClose={() => { setSpecialOpen(false); requestAnimationFrame(() => restoreRange(pageRef.current, savedRange.current)); }} />
			<WordCountDialog stats={wordCount} onClose={() => setWordCount(null)} />
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
