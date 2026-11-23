"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/office/utils";
import type { PresentationContent, Slide, SlideElement } from "@/lib/office/types";
import type { OfficeEditorProps } from "../office-types";
import { useOfficeMenus } from "../office-menus";
import { readImageAsDataUrl } from "../office-client-utils";
import { sanitizeOfficeHtml } from "../sanitize";
import { PresentMode } from "./present-mode";
import { SlidesCanvas } from "./slides-canvas";
import { SlidesFilmstrip, SlidesGrid } from "./slides-filmstrip";
import { useSlidesMenus } from "./slides-menus";
import { SlidesToolbar } from "./slides-toolbar";
import { SlidePreview, SlideTextStyles } from "./slide-view";
import { alignElements, applyLayout, applyTheme, clamp, cloneElements, cloneSlide, createElement, createSlide, fitSize, hasTextBody, HISTORY_LIMIT, moveItem, moveZ, resolveTheme, safeImageSrc, themeIdOf } from "./slides-utils";
import type { AlignMode, ColorTarget, InsertKind, SlideLayoutId, SlidesActions, SlidesMenuState, SlideThemeId, SnapGuide, ZoomLevel, ZOrderMove } from "./slides-types";

type History = { past: PresentationContent[]; future: PresentationContent[] };
type Style = NonNullable<SlideElement["style"]>;

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
const COALESCE_MS = 1500;

/** Google Slides–style presentation editor: filmstrip, canvas, speaker notes and a slideshow. */
export function SlidesEditor({ content, contentKey, onChange, readOnly, name }: OfficeEditorProps<"presentation">) {
	const { t } = useLanguage();
	const [doc, setDoc] = useState<PresentationContent>(content);
	const [history, setHistory] = useState<History>({ past: [], future: [] });
	const [index, setIndex] = useState(0);
	const [selected, setSelected] = useState<string[]>([]);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [guides, setGuides] = useState<SnapGuide[]>([]);
	const [presenting, setPresenting] = useState<number | null>(null);
	const [imageUrlOpen, setImageUrlOpen] = useState(false);
	const [imageUrl, setImageUrl] = useState("");
	const [fitScale, setFitScale] = useState(0.6);
	const [zoom, setZoom] = useState<ZoomLevel>("fit");
	const [gridView, setGridView] = useState(false);
	const [showFilmstrip, setShowFilmstrip] = useState(true);
	const [showNotes, setShowNotes] = useState(true);
	const [clipboardSize, setClipboardSize] = useState(0);
	const scale = zoom === "fit" ? fitScale : zoom / 100;

	// A document replaced from outside (load, reload, someone else's save) resets everything local.
	const [syncedKey, setSyncedKey] = useState(contentKey);
	if (syncedKey !== contentKey) {
		setSyncedKey(contentKey);
		setDoc(content);
		setHistory({ past: [], future: [] });
		setSelected([]);
		setEditingId(null);
		setIndex((current) => clamp(current, 0, Math.max(0, content.slides.length - 1)));
	}

	const rootRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const colorRef = useRef<HTMLInputElement>(null);
	const colorTargetRef = useRef<ColorTarget>("text");
	const docRef = useRef(doc);
	useEffect(() => { docRef.current = doc; }, [doc]);
	const lastCommitRef = useRef<{ key: string | null; time: number }>({ key: null, time: 0 });
	const clipboardRef = useRef<SlideElement[]>([]);
	const focusAreaRef = useRef<"canvas" | "filmstrip">("canvas");
	const savedRangeRef = useRef<Range | null>(null);

	const theme = resolveTheme(doc);
	const slideCount = doc.slides.length;
	const current = clamp(index, 0, Math.max(0, slideCount - 1));
	const slide: Slide | undefined = doc.slides[current];
	const selection = slide ? slide.elements.filter((element) => selected.includes(element.id)) : [];
	const firstStyle: Style = selection[0]?.style ?? {};
	const hasText = selection.some((element) => hasTextBody(element.type));

	// Fit the slide into the space between the toolbar and the notes.
	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			setFitScale(Math.max(0.1, Math.min((width - 48) / SLIDE_WIDTH, (height - 48) / SLIDE_HEIGHT)));
		});
		observer.observe(stage);
		return () => observer.disconnect();
	}, [gridView]);

	/** Records a change: one undo step (or merged into the previous one with the same `coalesce` key) and a save. */
	const commit = useCallback((next: PresentationContent, options: { base?: PresentationContent; coalesce?: string } = {}) => {
		if (readOnly) return;
		const base = options.base ?? docRef.current;
		const now = Date.now();
		const last = lastCommitRef.current;
		const merge = !!options.coalesce && last.key === options.coalesce && now - last.time < COALESCE_MS;
		lastCommitRef.current = { key: options.coalesce ?? null, time: now };
		setHistory((value) => (merge ? { past: value.past, future: [] } : { past: [...value.past.slice(-(HISTORY_LIMIT - 1)), base], future: [] }));
		docRef.current = next;
		setDoc(next);
		onChange(next);
	}, [onChange, readOnly]);

	/** Live preview while dragging: shown at once, recorded only when the drag ends. */
	const preview = useCallback((next: PresentationContent) => { docRef.current = next; setDoc(next); }, []);

	const updateSlide = useCallback((map: (slide: Slide) => Slide, coalesce?: string) => {
		const base = docRef.current;
		commit({ ...base, slides: base.slides.map((entry, position) => (position === current ? map(entry) : entry)) }, { coalesce });
	}, [commit, current]);

	const updateElements = useCallback((ids: string[], map: (element: SlideElement) => SlideElement, coalesce?: string) => {
		const chosen = new Set(ids);
		updateSlide((entry) => ({ ...entry, elements: entry.elements.map((element) => (chosen.has(element.id) ? map(element) : element)) }), coalesce);
	}, [updateSlide]);

	function undo() {
		if (!history.past.length) return;
		const previous = history.past[history.past.length - 1];
		setHistory({ past: history.past.slice(0, -1), future: [docRef.current, ...history.future] });
		lastCommitRef.current = { key: null, time: 0 };
		setEditingId(null);
		docRef.current = previous;
		setDoc(previous);
		onChange(previous);
	}

	function redo() {
		if (!history.future.length) return;
		const [next, ...rest] = history.future;
		setHistory({ past: [...history.past, docRef.current], future: rest });
		lastCommitRef.current = { key: null, time: 0 };
		setEditingId(null);
		docRef.current = next;
		setDoc(next);
		onChange(next);
	}

	/** `total` is the slide count after the change that leads here (adding a slide makes one more). */
	function goTo(position: number, total = slideCount) {
		setIndex(clamp(position, 0, Math.max(0, total - 1)));
		setSelected([]);
		setEditingId(null);
	}

	/* ---------- slides ---------- */

	function addSlide(layout: SlideLayoutId) {
		const next = createSlide(layout, theme);
		const slides = [...doc.slides];
		slides.splice(current + 1, 0, next);
		commit({ ...doc, slides });
		goTo(current + 1, slides.length);
	}

	function duplicateSlide(position: number) {
		const source = doc.slides[position];
		if (!source) return;
		const slides = [...doc.slides];
		slides.splice(position + 1, 0, cloneSlide(source));
		commit({ ...doc, slides });
		goTo(position + 1, slides.length);
	}

	function deleteSlide(position: number) {
		if (!doc.slides[position]) return;
		const slides = doc.slides.filter((_, entry) => entry !== position);
		commit({ ...doc, slides });
		setIndex(clamp(position >= slides.length ? slides.length - 1 : position, 0, Math.max(0, slides.length - 1)));
		setSelected([]);
		setEditingId(null);
	}

	function moveSlide(from: number, to: number) {
		if (to < 0 || to >= slideCount) return;
		commit({ ...doc, slides: moveItem(doc.slides, from, to) });
		if (from === current) setIndex(to);
		else if (from < current && to >= current) setIndex(current - 1);
		else if (from > current && to <= current) setIndex(current + 1);
	}

	function toggleSkip(position: number) {
		const target = doc.slides[position];
		if (!target) return;
		commit({ ...doc, slides: doc.slides.map((entry, at) => (at === position ? { ...entry, skipped: entry.skipped ? undefined : true } : entry)) });
	}

	function relayout(layout: SlideLayoutId) {
		if (!slide) return;
		updateSlide((entry) => applyLayout(entry, layout, theme));
		setSelected([]);
		setEditingId(null);
	}

	/* ---------- elements ---------- */

	function insertElement(element: SlideElement, edit = false) {
		if (!slide) { // A deck with no slides gets one first.
			const first = { ...createSlide("blank", theme), elements: [element] };
			commit({ ...doc, slides: [first] });
			setIndex(0);
		} else updateSlide((entry) => ({ ...entry, elements: [...entry.elements, element] }));
		setSelected([element.id]);
		setEditingId(edit ? element.id : null);
		focusAreaRef.current = "canvas";
	}

	function insert(kind: InsertKind) {
		if (kind === "roundRect") insertElement(createElement("rect", theme, { style: { radius: 16 } }));
		else insertElement(createElement(kind, theme), kind === "text");
	}

	function copySelection(cut: boolean) {
		if (!selection.length) return;
		clipboardRef.current = selection;
		setClipboardSize(selection.length);
		if (cut) deleteSelected();
	}

	async function insertImageSrc(src: string) {
		const safe = safeImageSrc(src);
		if (!safe) { toast.error(t("slides.imageInvalid")); return; }
		const size = await new Promise<{ w: number; h: number }>((resolve) => {
			const image = new Image();
			image.onload = () => resolve(fitSize(image.naturalWidth, image.naturalHeight));
			image.onerror = () => resolve(fitSize(0, 0));
			image.src = safe;
		});
		insertElement(createElement("image", theme, { src: safe, w: size.w, h: size.h, x: Math.round((SLIDE_WIDTH - size.w) / 2), y: Math.round((SLIDE_HEIGHT - size.h) / 2) }));
	}

	async function insertImageFile(file: File) {
		try {
			await insertImageSrc(await readImageAsDataUrl(file));
		} catch (error) {
			toast.error(error instanceof Error && error.message === "too-large" ? t("slides.imageTooLarge") : t("slides.imageUnsupported"));
		}
	}

	function deleteSelected() {
		if (!selected.length) return;
		const chosen = new Set(selected);
		updateSlide((entry) => ({ ...entry, elements: entry.elements.filter((element) => !chosen.has(element.id)) }));
		setSelected([]);
		setEditingId(null);
	}

	function duplicateSelected() {
		if (!selection.length) return;
		const copies = cloneElements(selection, 20);
		updateSlide((entry) => ({ ...entry, elements: [...entry.elements, ...copies] }));
		setSelected(copies.map((element) => element.id));
	}

	function paste() {
		if (!clipboardRef.current.length || !slide) return;
		const copies = cloneElements(clipboardRef.current, 20);
		clipboardRef.current = copies;
		setClipboardSize(copies.length);
		updateSlide((entry) => ({ ...entry, elements: [...entry.elements, ...copies] }));
		setSelected(copies.map((element) => element.id));
	}

	function setStyle(patch: Partial<Style>, coalesce?: string) {
		updateElements(selected, (element) => ({ ...element, style: { ...element.style, ...patch } }), coalesce ? `${coalesce}:${selected.join(",")}` : undefined);
	}

	function arrange(move: ZOrderMove) {
		updateSlide((entry) => ({ ...entry, elements: moveZ(entry.elements, selected, move) }));
	}

	function align(mode: AlignMode) {
		updateSlide((entry) => ({ ...entry, elements: alignElements(entry.elements, selected, mode) }));
	}

	function nudge(dx: number, dy: number) {
		updateElements(selected, (element) => ({ ...element, x: element.x + dx, y: element.y + dy }), `nudge:${selected.join(",")}`);
	}

	function toggleTextStyle(key: "bold" | "italic" | "underline") {
		if (!hasText && !editingId) return;
		if (editingId) exec(key);
		else setStyle({ [key]: !firstStyle[key] });
	}

	/** Opens the native colour picker for a menu command; the change lands in `applyColor`. */
	function pickColor(target: ColorTarget) {
		const input = colorRef.current;
		if (!input) return;
		colorTargetRef.current = target;
		const current = target === "text" ? firstStyle.color ?? theme.color : target === "fill" ? firstStyle.fill ?? theme.accent : target === "stroke" ? firstStyle.stroke ?? theme.color : slide?.background ?? theme.background;
		input.value = /^#[0-9a-f]{6}/i.test(current) ? current.slice(0, 7) : "#000000";
		try { input.showPicker(); } catch { input.click(); }
	}

	function applyColor(color: string) {
		const target = colorTargetRef.current;
		if (target === "background") updateSlide((entry) => ({ ...entry, background: color }), `background:${slide?.id}`);
		else if (target === "text") { if (editingId) exec("foreColor", color); else setStyle({ color }, "color"); }
		else if (target === "fill") setStyle({ fill: color }, "fill");
		else setStyle({ stroke: color, strokeWidth: firstStyle.strokeWidth || 2 }, "stroke");
	}

	function print() {
		setEditingId(null);
		setTimeout(() => window.print(), 50);
	}

	/* ---------- rich text ---------- */

	function onTextInput(id: string, html: string) {
		updateElements([id], (element) => ({ ...element, html: sanitizeOfficeHtml(html) }), `text:${id}`);
	}

	/** Runs a formatting command on the text being edited, restoring its selection if a picker took focus. */
	function exec(command: string, value?: string) {
		if (!editingId) return;
		const node = rootRef.current?.querySelector<HTMLElement>(`[data-editing-id="${CSS.escape(editingId)}"]`);
		if (!node) return;
		if (document.activeElement !== node) {
			node.focus();
			const range = savedRangeRef.current;
			if (range && node.contains(range.startContainer)) {
				const selectionObject = window.getSelection();
				selectionObject?.removeAllRanges();
				selectionObject?.addRange(range);
			}
		}
		document.execCommand("styleWithCSS", false, "true");
		document.execCommand(command, false, value);
		onTextInput(editingId, node.innerHTML);
	}

	function stopEditing() {
		setEditingId(null);
		savedRangeRef.current = null;
		rootRef.current?.focus({ preventScroll: true });
	}

	/* ---------- keyboard and clipboard ---------- */

	const handlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
	useEffect(() => {
		handlerRef.current = (event: KeyboardEvent) => {
			if (presenting !== null || isTyping(event.target)) return;
			const root = rootRef.current;
			const active = document.activeElement;
			if (!root || (active && active !== document.body && !root.contains(active))) return;
			const mod = event.ctrlKey || event.metaKey;
			const key = event.key;
			if (mod && key.toLowerCase() === "enter") { event.preventDefault(); if (slideCount) setPresenting(event.shiftKey ? 0 : current); return; }
			if (!mod && !selected.length && (key === "Home" || key === "End")) { event.preventDefault(); goTo(key === "Home" ? 0 : slideCount - 1); return; }
			if (readOnly) {
				if (["ArrowDown", "ArrowRight", "PageDown"].includes(key)) { event.preventDefault(); goTo(current + 1); }
				else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(key)) { event.preventDefault(); goTo(current - 1); }
				return;
			}
			// Ctrl+M on every platform, as in Google Slides (Cmd+M minimises the window on a Mac).
			if (event.ctrlKey && !event.metaKey && key.toLowerCase() === "m") { event.preventDefault(); addSlide("titleBody"); return; }
			if (mod && ["b", "i", "u"].includes(key.toLowerCase()) && hasText) {
				event.preventDefault();
				toggleTextStyle(key.toLowerCase() === "b" ? "bold" : key.toLowerCase() === "i" ? "italic" : "underline");
				return;
			}
			if (mod && (key === "ArrowUp" || key === "ArrowDown")) {
				event.preventDefault();
				const up = key === "ArrowUp";
				if (selected.length) arrange(event.shiftKey ? (up ? "front" : "back") : (up ? "forward" : "backward"));
				else moveSlide(current, current + (up ? -1 : 1));
				return;
			}
			if (mod && key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
			if (mod && key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
			const inFilmstrip = focusAreaRef.current === "filmstrip" && !selected.length;
			if (mod && key.toLowerCase() === "d") { event.preventDefault(); if (inFilmstrip) duplicateSlide(current); else duplicateSelected(); return; }
			if (mod && key.toLowerCase() === "a" && slide) { event.preventDefault(); setSelected(slide.elements.map((element) => element.id)); return; }
			if (mod && (key.toLowerCase() === "c" || key.toLowerCase() === "x") && selection.length) {
				event.preventDefault();
				copySelection(key.toLowerCase() === "x");
				return;
			}
			if (mod && key.toLowerCase() === "v" && clipboardRef.current.length) { event.preventDefault(); paste(); return; }
			if (key === "Delete" || key === "Backspace") {
				if (selected.length) { event.preventDefault(); deleteSelected(); }
				else if (inFilmstrip) { event.preventDefault(); deleteSlide(current); }
				return;
			}
			if (key === "Escape") { setSelected([]); return; }
			if (key === "Enter" && selection.length === 1 && hasTextBody(selection[0].type)) { event.preventDefault(); setEditingId(selection[0].id); return; }
			const step = event.shiftKey ? 10 : 1;
			const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
			if (arrows[key]) {
				event.preventDefault();
				if (selected.length) nudge(...arrows[key]);
				else goTo(current + (key === "ArrowDown" || key === "ArrowRight" ? 1 : -1));
			}
		};
	});
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => handlerRef.current(event);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Pasting an image from the system clipboard drops it on the slide.
	const pasteRef = useRef<(event: ClipboardEvent) => void>(() => {});
	useEffect(() => {
		pasteRef.current = (event: ClipboardEvent) => {
			if (readOnly || editingId || isTyping(event.target)) return;
			const root = rootRef.current;
			const active = document.activeElement;
			if (!root || (active && active !== document.body && !root.contains(active))) return;
			const file = [...(event.clipboardData?.files ?? [])].find((entry) => entry.type.startsWith("image/"));
			if (file) { event.preventDefault(); void insertImageFile(file); }
		};
	});
	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => pasteRef.current(event);
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, []);

	const focusRoot = (area: "canvas" | "filmstrip") => {
		focusAreaRef.current = area;
		if (!rootRef.current?.contains(document.activeElement)) rootRef.current?.focus({ preventScroll: true });
	};

	/* ---------- menu bar ---------- */

	const actions: SlidesActions = {
		undo,
		redo,
		cut: () => copySelection(true),
		copy: () => copySelection(false),
		paste,
		duplicate: duplicateSelected,
		deleteSelection: deleteSelected,
		selectAll: () => { if (slide) { setEditingId(null); setSelected(slide.elements.map((element) => element.id)); } },
		present: (fromStart) => { if (slideCount) setPresenting(fromStart ? 0 : current); },
		toggleGrid: () => setGridView((value) => !value),
		toggleFilmstrip: () => setShowFilmstrip((value) => !value),
		toggleNotes: () => setShowNotes((value) => !value),
		setZoom: (level) => { setZoom(level); setGridView(false); },
		insert: (kind) => { setGridView(false); insert(kind); },
		uploadImage: () => { setGridView(false); fileRef.current?.click(); },
		imageUrl: () => { setGridView(false); setImageUrl(""); setImageUrlOpen(true); },
		addSlide,
		duplicateSlide: () => duplicateSlide(current),
		deleteSlide: () => deleteSlide(current),
		moveSlide: (delta) => moveSlide(current, current + delta),
		toggleSkip: () => toggleSkip(current),
		applyLayout: relayout,
		setTheme: (id) => commit(applyTheme(doc, id)),
		resetBackground: () => updateSlide((entry) => ({ ...entry, background: undefined })),
		pickColor,
		toggleBold: () => toggleTextStyle("bold"),
		toggleItalic: () => toggleTextStyle("italic"),
		toggleUnderline: () => toggleTextStyle("underline"),
		setFontSize: (size) => setStyle({ fontSize: size }),
		setFontFamily: (family) => setStyle({ fontFamily: family }),
		setAlign: (value) => setStyle({ align: value }),
		setVerticalAlign: (value) => setStyle({ verticalAlign: value }),
		toggleBullets: () => exec("insertUnorderedList"),
		noFill: () => setStyle({ fill: "transparent" }),
		setStrokeWidth: (width) => setStyle(width > 0 && !firstStyle.stroke ? { strokeWidth: width, stroke: theme.color } : { strokeWidth: width }),
		arrange,
		alignToSlide: align,
		print,
	};
	const actionsRef = useRef<SlidesActions>(actions);
	useEffect(() => { actionsRef.current = actions; });
	const menuState: SlidesMenuState = {
		readOnly,
		canUndo: history.past.length > 0,
		canRedo: history.future.length > 0,
		canPaste: clipboardSize > 0,
		selectionCount: selection.length,
		hasText,
		hasFill: selection.some((element) => element.type !== "line" && element.type !== "image"),
		hasStroke: selection.some((element) => element.type !== "image"),
		editing: !!editingId,
		bold: !!firstStyle.bold,
		italic: !!firstStyle.italic,
		underline: !!firstStyle.underline,
		fontSize: firstStyle.fontSize ?? 20,
		fontFamily: firstStyle.fontFamily ?? theme.fontFamily,
		align: firstStyle.align ?? "left",
		verticalAlign: firstStyle.verticalAlign ?? "top",
		strokeWidth: firstStyle.stroke ? firstStyle.strokeWidth ?? 0 : 0,
		gridView,
		showFilmstrip,
		showNotes,
		zoom,
		current,
		slideCount,
		skipped: !!slide?.skipped,
		themeId: themeIdOf(doc),
	};
	useOfficeMenus(useSlidesMenus(menuState, actionsRef, t));

	return (
		<div ref={rootRef} tabIndex={-1} className="flex h-full min-h-0 flex-col bg-white outline-none" aria-label={name}>
			<SlideTextStyles />
			<style>{"@media print { @page { size: 10in 5.625in; margin: 0; } }"}</style>
			<SlidesToolbar
				readOnly={readOnly}
				canUndo={history.past.length > 0}
				canRedo={history.future.length > 0}
				onUndo={undo}
				onRedo={redo}
				onAddSlide={addSlide}
				onInsert={insert}
				onUploadImage={() => fileRef.current?.click()}
				onImageUrl={() => { setImageUrl(""); setImageUrlOpen(true); }}
				selection={selection}
				editing={!!editingId}
				onStyle={setStyle}
				onExec={exec}
				onArrange={arrange}
				onAlign={align}
				onDuplicate={duplicateSelected}
				onDelete={deleteSelected}
				themeId={themeIdOf(doc)}
				onTheme={(id: SlideThemeId) => commit(applyTheme(doc, id))}
				background={slide?.background ?? theme.background}
				onBackground={(color, coalesce) => updateSlide((entry) => ({ ...entry, background: color }), coalesce ? `${coalesce}:${slide?.id}` : undefined)}
				onPresent={actions.present}
				onApplyLayout={relayout}
				onSelectTool={() => { if (editingId) stopEditing(); else setSelected([]); }}
				onPrint={print}
				zoom={zoom}
				onZoom={actions.setZoom}
				hasSlide={!!slide}
				themeFont={theme.fontFamily}
			/>
			<div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row print:hidden">
				{showFilmstrip && !gridView && <SlidesFilmstrip
					slides={doc.slides}
					theme={theme}
					current={current}
					readOnly={readOnly}
					onSelect={(position) => { focusAreaRef.current = "filmstrip"; goTo(position); }}
					onMove={moveSlide}
					onDuplicate={duplicateSlide}
					onDelete={deleteSlide}
					onToggleSkip={toggleSkip}
					onFocus={() => focusRoot("filmstrip")}
				/>}
				{gridView ? (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ background: "#f1f3f4" }}>
						<SlidesGrid slides={doc.slides} theme={theme} current={current} onOpen={(position) => { goTo(position); setGridView(false); }} />
					</div>
				) : (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ background: "#f1f3f4" }}>
						<div ref={stageRef} data-stage="" className="flex min-h-0 min-w-0 flex-1 overflow-auto" onPointerDown={(event) => { if ((event.target as HTMLElement).dataset.stage !== undefined && !readOnly) { focusRoot("canvas"); if (editingId) stopEditing(); setSelected([]); } }}>
							<div data-stage="" className="m-auto shrink-0 p-6">
								{!slide ? (
									<div className="flex flex-col items-center gap-3 text-sm text-neutral-600">
										<p>{t("slides.noSlides")}</p>
										{!readOnly && <Button type="button" onClick={() => addSlide("title")}>{t("slides.addFirstSlide")}</Button>}
									</div>
								) : readOnly ? (
									<SlidePreview slide={slide} theme={theme} scale={scale} style={{ boxShadow: "0 1px 3px rgb(60 64 67 / 0.3), 0 4px 8px rgb(60 64 67 / 0.15)" }} />
								) : (
									<SlidesCanvas
										doc={doc}
										slideIndex={current}
										theme={theme}
										scale={scale}
										selected={selected}
										editingId={editingId}
										guides={guides}
										onSelect={setSelected}
										onStartEdit={(id) => { setSelected([id]); setEditingId(id); }}
										onStopEdit={stopEditing}
										onPreview={preview}
										onCommit={(next, base) => commit(next, { base })}
										onGuides={setGuides}
										onTextInput={onTextInput}
										onEditorBlur={(range) => { savedRangeRef.current = range; }}
										onFocusCanvas={() => focusRoot("canvas")}
									/>
								)}
							</div>
						</div>
						{slide && showNotes && (readOnly ? (
							slide.notes?.trim() ? <div className="max-h-32 shrink-0 overflow-y-auto border-t border-neutral-200 bg-white px-4 py-2 text-sm whitespace-pre-wrap text-neutral-700">{slide.notes}</div> : null
						) : (
							<textarea
								value={slide.notes ?? ""}
								onChange={(event) => updateSlide((entry) => ({ ...entry, notes: event.target.value }), `notes:${slide.id}`)}
								placeholder={t("slides.notesPlaceholder")}
								aria-label={t("slides.notes")}
								className="h-24 shrink-0 resize-none border-t border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-500"
							/>
						))}
					</div>
				)}
			</div>

			{/* One slide per landscape page when printing or saving as PDF. */}
			<div className="hidden print:block">
				{doc.slides.map((entry) => <div key={entry.id} style={{ breakAfter: "page", pageBreakAfter: "always" }}><SlidePreview slide={entry} theme={theme} scale={1} /></div>)}
			</div>

			{/* Colour picker the Format and Slide menus open (the toolbar has its own swatches). */}
			<input ref={colorRef} type="color" tabIndex={-1} aria-hidden="true" className="pointer-events-none fixed left-1/2 top-24 h-0 w-0 opacity-0" onChange={(event) => applyColor(event.target.value)} />
			<input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void insertImageFile(file); }} />

			<Dialog open={imageUrlOpen} onOpenChange={setImageUrlOpen}>
				<DialogContent>
					<DialogHeader><DialogTitle>{t("slides.imageUrlTitle")}</DialogTitle></DialogHeader>
					<form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!imageUrl.trim()) return; setImageUrlOpen(false); void insertImageSrc(imageUrl.trim()); }}>
						<Input autoFocus type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://" aria-label={t("slides.imageUrl")} />
						<p className="text-xs text-neutral-500">{t("slides.imageUrlHint")}</p>
						<div className="flex justify-end gap-2">
							<Button type="button" variant="ghost" onClick={() => setImageUrlOpen(false)}>{t("slides.cancel")}</Button>
							<Button type="submit" disabled={!imageUrl.trim()}>{t("slides.insert")}</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>

			{presenting !== null && <PresentMode content={doc} startIndex={presenting} onExit={(last) => { setPresenting(null); goTo(last); rootRef.current?.focus({ preventScroll: true }); }} />}
		</div>
	);
}
