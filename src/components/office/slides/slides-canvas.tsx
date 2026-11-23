"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useLanguage } from "@/components/language-provider";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/office/utils";
import type { PresentationContent, SlideElement } from "@/lib/office/types";
import { sanitizeOfficeHtml } from "../sanitize";
import { ElementSurface, placeholderKind, ScaledSlide, SlideCanvas } from "./slide-view";
import { applyResize, boundsOf, computeSnap, elementBoxStyle, hasTextBody, rotationFromPointer } from "./slides-utils";
import type { Box, ResizeHandle, SlideTheme, SnapGuide } from "./slides-types";

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_POSITION: Record<ResizeHandle, CSSProperties> = {
	nw: { left: 0, top: 0, cursor: "nwse-resize" },
	n: { left: "50%", top: 0, cursor: "ns-resize" },
	ne: { left: "100%", top: 0, cursor: "nesw-resize" },
	e: { left: "100%", top: "50%", cursor: "ew-resize" },
	se: { left: "100%", top: "100%", cursor: "nwse-resize" },
	s: { left: "50%", top: "100%", cursor: "ns-resize" },
	sw: { left: 0, top: "100%", cursor: "nesw-resize" },
	w: { left: 0, top: "50%", cursor: "ew-resize" },
};
const SELECTION_COLOR = "#1a73e8";
const GUIDE_COLOR = "#e8338a";

type Drag =
	| { mode: "move"; base: PresentationContent; ids: string[]; startX: number; startY: number; bounds: Box; others: Box[]; moved: boolean }
	| { mode: "resize"; base: PresentationContent; id: string; handle: ResizeHandle; startX: number; startY: number; element: SlideElement }
	| { mode: "rotate"; base: PresentationContent; id: string; element: SlideElement };

type CanvasProps = {
	doc: PresentationContent;
	slideIndex: number;
	theme: SlideTheme;
	scale: number;
	selected: string[];
	editingId: string | null;
	guides: SnapGuide[];
	onSelect: (ids: string[]) => void;
	onStartEdit: (id: string) => void;
	onStopEdit: () => void;
	onPreview: (next: PresentationContent) => void;
	onCommit: (next: PresentationContent, base: PresentationContent) => void;
	onGuides: (guides: SnapGuide[]) => void;
	onTextInput: (id: string, html: string) => void;
	onEditorBlur: (range: Range | null) => void;
	onFocusCanvas: () => void;
};

/** The current slide with selection, drag to move, resize and rotate handles, snapping and in-place text editing. */
export function SlidesCanvas(props: CanvasProps) {
	const { doc, slideIndex, theme, scale, selected, editingId, guides } = props;
	const { t } = useLanguage();
	const surfaceRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<Drag | null>(null);
	const propsRef = useRef(props);
	useEffect(() => { propsRef.current = props; });
	const slide = doc.slides[slideIndex];

	/** Pointer position in slide units. */
	function toSlide(clientX: number, clientY: number) {
		const rect = surfaceRef.current?.getBoundingClientRect();
		if (!rect) return { x: 0, y: 0 };
		return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
	}

	function replaceElements(base: PresentationContent, map: (element: SlideElement) => SlideElement): PresentationContent {
		return { ...base, slides: base.slides.map((entry, index) => (index === slideIndex ? { ...entry, elements: entry.elements.map(map) } : entry)) };
	}

	function startDrag(drag: Drag, event: ReactPointerEvent) {
		dragRef.current = drag;
		const onMove = (moveEvent: PointerEvent) => {
			const current = dragRef.current;
			if (!current) return;
			const { onPreview, onGuides } = propsRef.current;
			if (current.mode === "move") {
				let dx = (moveEvent.clientX - current.startX) / scale;
				let dy = (moveEvent.clientY - current.startY) / scale;
				if (!current.moved && Math.hypot(dx * scale, dy * scale) < 3) return;
				current.moved = true;
				if (!moveEvent.altKey) {
					const snapped = computeSnap(current.bounds, dx, dy, current.others, 6 / Math.max(scale, 0.25));
					dx = snapped.dx;
					dy = snapped.dy;
					onGuides(snapped.guides);
				} else onGuides([]);
				const ids = new Set(current.ids);
				onPreview(replaceElements(current.base, (element) => (ids.has(element.id) ? { ...element, x: Math.round(element.x + dx), y: Math.round(element.y + dy) } : element)));
			} else if (current.mode === "resize") {
				const dx = (moveEvent.clientX - current.startX) / scale;
				const dy = (moveEvent.clientY - current.startY) / scale;
				const keepRatio = moveEvent.shiftKey || current.element.type === "image";
				const box = applyResize(current.element, current.handle, dx, current.element.type === "line" ? 0 : dy, { keepRatio: keepRatio && current.element.type !== "line", min: current.element.type === "line" ? 2 : undefined });
				onPreview(replaceElements(current.base, (element) => (element.id === current.id ? { ...element, ...box } : element)));
			} else {
				const point = toSlide(moveEvent.clientX, moveEvent.clientY);
				const rotation = rotationFromPointer(current.element, point.x, point.y, moveEvent.shiftKey);
				onPreview(replaceElements(current.base, (element) => (element.id === current.id ? { ...element, rotation } : element)));
			}
		};
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
			const current = dragRef.current;
			dragRef.current = null;
			if (!current) return;
			const { onCommit, onGuides } = propsRef.current;
			onGuides([]);
			const latest = propsRef.current.doc;
			if (current.mode === "move" && !current.moved) return;
			if (latest !== current.base) onCommit(latest, current.base);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
		event.preventDefault();
	}

	function onElementPointerDown(event: ReactPointerEvent, element: SlideElement) {
		if (event.button !== 0 || editingId === element.id) return;
		event.stopPropagation();
		props.onFocusCanvas();
		if (editingId) props.onStopEdit();
		let ids = selected;
		if (event.shiftKey || event.metaKey || event.ctrlKey) {
			ids = selected.includes(element.id) ? selected.filter((id) => id !== element.id) : [...selected, element.id];
			props.onSelect(ids);
			if (!ids.includes(element.id)) return;
		} else if (!selected.includes(element.id)) {
			ids = [element.id];
			props.onSelect(ids);
		}
		const moving = slide.elements.filter((entry) => ids.includes(entry.id));
		const bounds = boundsOf(moving);
		if (!bounds) return;
		startDrag({ mode: "move", base: doc, ids, startX: event.clientX, startY: event.clientY, bounds, others: slide.elements.filter((entry) => !ids.includes(entry.id)), moved: false }, event);
	}

	function onHandlePointerDown(event: ReactPointerEvent, element: SlideElement, handle: ResizeHandle | "rotate") {
		if (event.button !== 0) return;
		event.stopPropagation();
		if (handle === "rotate") startDrag({ mode: "rotate", base: doc, id: element.id, element }, event);
		else startDrag({ mode: "resize", base: doc, id: element.id, handle, startX: event.clientX, startY: event.clientY, element }, event);
	}

	function onBackgroundPointerDown(event: ReactPointerEvent) {
		if (event.button !== 0) return;
		props.onFocusCanvas();
		if (editingId) props.onStopEdit();
		if (selected.length) props.onSelect([]);
	}

	if (!slide) return null;
	const single = selected.length === 1 && !editingId ? slide.elements.find((element) => element.id === selected[0]) : undefined;
	const hint = (element: SlideElement) => (element.type === "text" ? (placeholderKind(element) === "title" ? t("slides.clickToAddTitle") : t("slides.clickToAddText")) : undefined);

	return (
		<div onPointerDown={onBackgroundPointerDown} className="relative" style={{ boxShadow: "0 1px 3px rgb(60 64 67 / 0.3), 0 4px 8px rgb(60 64 67 / 0.15)" }}>
			<ScaledSlide scale={scale}>
				<div ref={surfaceRef} style={{ position: "absolute", inset: 0 }}>
					<SlideCanvas slide={slide} theme={theme}>
						{slide.elements.map((element) => {
							const editing = editingId === element.id;
							const isSelected = selected.includes(element.id);
							return (
								<div
									key={element.id}
									data-element-id={element.id}
									onPointerDown={(event) => onElementPointerDown(event, element)}
									onDoubleClick={(event) => { if (hasTextBody(element.type)) { event.stopPropagation(); props.onStartEdit(element.id); } }}
									style={{ ...(elementBoxStyle(element) as CSSProperties), cursor: editing ? "text" : "move", outline: isSelected || editing ? `${2 / scale}px solid ${SELECTION_COLOR}` : undefined, outlineOffset: 0 }}
								>
									<ElementSurface element={element} theme={theme} hint={editing ? undefined : hint(element)}>
										{editing ? <EditableHtml id={element.id} html={element.html ?? ""} onInput={props.onTextInput} onBlurRange={props.onEditorBlur} onDone={props.onStopEdit} /> : undefined}
									</ElementSurface>
								</div>
							);
						})}
					</SlideCanvas>
					{single && <Handles element={single} scale={scale} onPointerDown={onHandlePointerDown} />}
					{guides.map((guide, index) => (
						<div key={index} style={guide.orientation === "vertical"
							? { position: "absolute", left: guide.position, top: 0, width: 0, height: SLIDE_HEIGHT, borderLeft: `${1 / scale}px dashed ${GUIDE_COLOR}`, pointerEvents: "none" }
							: { position: "absolute", top: guide.position, left: 0, height: 0, width: SLIDE_WIDTH, borderTop: `${1 / scale}px dashed ${GUIDE_COLOR}`, pointerEvents: "none" }} />
					))}
				</div>
			</ScaledSlide>
		</div>
	);
}

function Handles({ element, scale, onPointerDown }: { element: SlideElement; scale: number; onPointerDown: (event: ReactPointerEvent, element: SlideElement, handle: ResizeHandle | "rotate") => void }) {
	const { t } = useLanguage();
	const size = 9 / scale;
	const handles = element.type === "line" ? (["e", "w"] as ResizeHandle[]) : HANDLES;
	return (
		<div style={{ ...(elementBoxStyle(element) as CSSProperties), opacity: 1, pointerEvents: "none" }}>
			{handles.map((handle) => (
				<div
					key={handle}
					role="presentation"
					onPointerDown={(event) => onPointerDown(event, element, handle)}
					style={{ position: "absolute", width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: "#fff", border: `${1.5 / scale}px solid ${SELECTION_COLOR}`, borderRadius: 2 / scale, pointerEvents: "auto", ...HANDLE_POSITION[handle] }}
				/>
			))}
			<div style={{ position: "absolute", left: "50%", top: -24 / scale, width: 0, height: 24 / scale, borderLeft: `${1 / scale}px solid ${SELECTION_COLOR}` }} />
			<div
				role="presentation"
				title={t("slides.rotate")}
				onPointerDown={(event) => onPointerDown(event, element, "rotate")}
				style={{ position: "absolute", left: "50%", top: -24 / scale, width: size * 1.3, height: size * 1.3, marginLeft: -size * 0.65, marginTop: -size * 0.65, borderRadius: "50%", background: "#fff", border: `${1.5 / scale}px solid ${SELECTION_COLOR}`, cursor: "grab", pointerEvents: "auto" }}
			/>
		</div>
	);
}

/**
 * Rich text editing inside an element. The DOM is the source of truth while editing: the stored HTML is written
 * once when editing starts and every input is reported up, so re-renders never move the caret.
 */
function EditableHtml({ id, html, onInput, onBlurRange, onDone }: { id: string; html: string; onInput: (id: string, html: string) => void; onBlurRange: (range: Range | null) => void; onDone: () => void }) {
	const ref = useRef<HTMLDivElement>(null);
	const initial = useRef(html);
	// A layout effect, so the box has focus before the next key event: typing right after inserting is not lost.
	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		node.innerHTML = sanitizeOfficeHtml(initial.current);
		node.focus();
		// Caret at the end, like clicking into a text box.
		const range = document.createRange();
		range.selectNodeContents(node);
		range.collapse(false);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}, []);

	return (
		<div
			ref={ref}
			data-editing-id={id}
			contentEditable
			suppressContentEditableWarning
			role="textbox"
			aria-multiline="true"
			onPointerDown={(event) => event.stopPropagation()}
			onInput={(event) => onInput(id, event.currentTarget.innerHTML)}
			onBlur={() => {
				const selection = window.getSelection();
				const range = selection && selection.rangeCount && ref.current?.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
				onBlurRange(range);
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onDone(); }
				event.stopPropagation();
			}}
			style={{ outline: "none", minHeight: "1.25em", cursor: "text", userSelect: "text" }}
		/>
	);
}
