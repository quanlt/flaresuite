import { officeLocalId, SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/office/utils";
import type { PresentationContent, Slide, SlideElement, SlideElementType } from "@/lib/office/types";
import type { AlignMode, Box, ResizeHandle, SlideLayoutId, SlideTheme, SlideThemeId, SnapGuide, SnapResult, ZOrderMove } from "./slides-types";

export const MIN_ELEMENT_SIZE = 8;
export const SNAP_THRESHOLD = 6;
export const HISTORY_LIMIT = 100;
export const DEFAULT_FONT_FAMILY = "Inter, Arial, sans-serif";

export const SLIDE_THEMES: Record<SlideThemeId, SlideTheme> = {
	light: { fontFamily: DEFAULT_FONT_FAMILY, background: "#ffffff", color: "#202124", accent: "#1a73e8" },
	dark: { fontFamily: DEFAULT_FONT_FAMILY, background: "#202124", color: "#f1f3f4", accent: "#8ab4f8" },
	blue: { fontFamily: DEFAULT_FONT_FAMILY, background: "#0b3d91", color: "#ffffff", accent: "#ffd166" },
	warm: { fontFamily: "Georgia, 'Times New Roman', serif", background: "#fff7ed", color: "#431407", accent: "#ea580c" },
};

export const SLIDE_LAYOUTS: SlideLayoutId[] = ["title", "titleBody", "section", "twoColumns", "imageCaption", "blank"];

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** The theme a deck renders with, filling anything it leaves out. */
export function resolveTheme(content: Pick<PresentationContent, "theme">): SlideTheme {
	return { ...SLIDE_THEMES.light, ...content.theme } as SlideTheme;
}

/** Which built-in theme a deck uses, or null when it was customised. */
export function themeIdOf(content: Pick<PresentationContent, "theme">): SlideThemeId | null {
	const theme = resolveTheme(content);
	for (const [id, preset] of Object.entries(SLIDE_THEMES) as [SlideThemeId, SlideTheme][]) {
		if (preset.background === theme.background && preset.color === theme.color && preset.accent === theme.accent) return id;
	}
	return null;
}

/** True when rich text has nothing visible: no text and no images. */
export function isHtmlEmpty(html: string | undefined): boolean {
	if (!html) return true;
	if (/<img\b/i.test(html)) return false;
	return html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;| /g, " ").trim() === "";
}

function rotate(x: number, y: number, degrees: number): { x: number; y: number } {
	const radians = (degrees * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * New box after dragging a resize handle by (dx, dy) slide units. The drag is measured in the element's own
 * (rotated) frame and the opposite edge stays put, so rotated elements resize the way they look.
 */
export function applyResize(box: Box & { rotation?: number }, handle: ResizeHandle, dx: number, dy: number, options: { keepRatio?: boolean; min?: number } = {}): Box {
	const min = options.min ?? MIN_ELEMENT_SIZE;
	const angle = box.rotation ?? 0;
	const local = rotate(dx, dy, -angle);
	const east = handle.includes("e");
	const west = handle.includes("w");
	const south = handle.includes("s");
	const north = handle.includes("n");
	let w = box.w + (east ? local.x : west ? -local.x : 0);
	let h = box.h + (south ? local.y : north ? -local.y : 0);
	w = Math.max(min, w);
	h = Math.max(min, h);
	if (options.keepRatio && (east || west) && (north || south) && box.w > 0 && box.h > 0) {
		const ratio = box.w / box.h;
		if (w / h > ratio) h = w / ratio;
		else w = h * ratio;
	}
	const dw = w - box.w;
	const dh = h - box.h;
	// The centre moves by half the growth, towards the dragged side.
	const shift = rotate(east ? dw / 2 : west ? -dw / 2 : 0, south ? dh / 2 : north ? -dh / 2 : 0, angle);
	const cx = box.x + box.w / 2 + shift.x;
	const cy = box.y + box.h / 2 + shift.y;
	return { x: round(cx - w / 2), y: round(cy - h / 2), w: round(w), h: round(h) };
}

/** Angle in degrees for a rotation handle dragged to (px, py) around the box centre; Shift snaps to 15°. */
export function rotationFromPointer(box: Box, px: number, py: number, snap = false): number {
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	let angle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
	if (snap) angle = Math.round(angle / 15) * 15;
	angle = ((angle % 360) + 360) % 360;
	return round(angle > 180 ? angle - 360 : angle);
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

/** Bounding box of several boxes (rotation ignored). */
export function boundsOf(boxes: Box[]): Box | null {
	if (!boxes.length) return null;
	const left = Math.min(...boxes.map((box) => box.x));
	const top = Math.min(...boxes.map((box) => box.y));
	const right = Math.max(...boxes.map((box) => box.x + box.w));
	const bottom = Math.max(...boxes.map((box) => box.y + box.h));
	return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Snaps a moving box to the slide's edges and centre lines and to the other elements' edges and centres.
 * Returns the corrected offset and the guide lines to draw.
 */
export function computeSnap(moving: Box, dx: number, dy: number, others: Box[], threshold = SNAP_THRESHOLD): SnapResult {
	const xTargets = [0, SLIDE_WIDTH / 2, SLIDE_WIDTH];
	const yTargets = [0, SLIDE_HEIGHT / 2, SLIDE_HEIGHT];
	for (const box of others) {
		xTargets.push(box.x, box.x + box.w / 2, box.x + box.w);
		yTargets.push(box.y, box.y + box.h / 2, box.y + box.h);
	}
	const x = moving.x + dx;
	const y = moving.y + dy;
	const xEdges = [x, x + moving.w / 2, x + moving.w];
	const yEdges = [y, y + moving.h / 2, y + moving.h];
	const guides: SnapGuide[] = [];
	let bestX: { delta: number; at: number } | null = null;
	for (const edge of xEdges) for (const target of xTargets) {
		const delta = target - edge;
		if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, at: target };
	}
	let bestY: { delta: number; at: number } | null = null;
	for (const edge of yEdges) for (const target of yTargets) {
		const delta = target - edge;
		if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, at: target };
	}
	if (bestX) guides.push({ orientation: "vertical", position: bestX.at });
	if (bestY) guides.push({ orientation: "horizontal", position: bestY.at });
	return { dx: dx + (bestX?.delta ?? 0), dy: dy + (bestY?.delta ?? 0), guides };
}

/** Aligns the chosen elements to an edge or centre line of the slide. */
export function alignElements(elements: SlideElement[], ids: string[], mode: AlignMode): SlideElement[] {
	const chosen = new Set(ids);
	return elements.map((element) => {
		if (!chosen.has(element.id)) return element;
		if (mode === "left") return { ...element, x: 0 };
		if (mode === "center") return { ...element, x: round((SLIDE_WIDTH - element.w) / 2) };
		if (mode === "right") return { ...element, x: round(SLIDE_WIDTH - element.w) };
		if (mode === "top") return { ...element, y: 0 };
		if (mode === "middle") return { ...element, y: round((SLIDE_HEIGHT - element.h) / 2) };
		return { ...element, y: round(SLIDE_HEIGHT - element.h) };
	});
}

/** Moves elements in the stacking order; the array order is the paint order (last on top). */
export function moveZ(elements: SlideElement[], ids: string[], move: ZOrderMove): SlideElement[] {
	const chosen = new Set(ids);
	if (move === "front") return [...elements.filter((element) => !chosen.has(element.id)), ...elements.filter((element) => chosen.has(element.id))];
	if (move === "back") return [...elements.filter((element) => chosen.has(element.id)), ...elements.filter((element) => !chosen.has(element.id))];
	const list = [...elements];
	if (move === "forward") {
		for (let index = list.length - 2; index >= 0; index -= 1) {
			if (chosen.has(list[index].id) && !chosen.has(list[index + 1].id)) [list[index], list[index + 1]] = [list[index + 1], list[index]];
		}
	} else {
		for (let index = 1; index < list.length; index += 1) {
			if (chosen.has(list[index].id) && !chosen.has(list[index - 1].id)) [list[index], list[index - 1]] = [list[index - 1], list[index]];
		}
	}
	return list;
}

/** Moves one item of a list to another position. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || from >= list.length) return list;
	const next = [...list];
	const [item] = next.splice(from, 1);
	next.splice(clamp(to, 0, next.length), 0, item);
	return next;
}

/** Copies of elements with fresh ids, shifted by `offset` units. */
export function cloneElements(elements: SlideElement[], offset = 0): SlideElement[] {
	return elements.map((element) => ({ ...structuredCloneSafe(element), id: officeLocalId("el"), x: element.x + offset, y: element.y + offset }));
}

/** A slide copy with fresh ids for the slide and its elements. */
export function cloneSlide(slide: Slide): Slide {
	return { ...structuredCloneSafe(slide), id: officeLocalId("sl"), elements: cloneElements(slide.elements) };
}

function structuredCloneSafe<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/** A new element of a type, centred on the slide. */
export function createElement(type: SlideElementType, theme: SlideTheme, extra: Partial<SlideElement> = {}): SlideElement {
	const sizes: Record<SlideElementType, [number, number]> = { text: [400, 80], rect: [240, 160], ellipse: [200, 200], line: [300, 4], image: [400, 300] };
	const [w, h] = sizes[type];
	const base: SlideElement = { id: officeLocalId("el"), type, x: round((SLIDE_WIDTH - w) / 2), y: round((SLIDE_HEIGHT - h) / 2), w, h };
	if (type === "text") base.style = { fontSize: 24, align: "left", verticalAlign: "top" };
	if (type === "rect" || type === "ellipse") base.style = { fill: theme.accent, color: "#ffffff", fontSize: 20, align: "center", verticalAlign: "middle" };
	if (type === "line") base.style = { stroke: theme.color, strokeWidth: 3 };
	if (type === "text" || type === "rect" || type === "ellipse") base.html = "";
	return { ...base, ...extra, style: { ...base.style, ...extra.style } };
}

const text = (x: number, y: number, w: number, h: number, html: string, style: SlideElement["style"]): SlideElement =>
	({ id: officeLocalId("el"), type: "text", x, y, w, h, html, style });

/** A slide built from a layout, with empty placeholders (or the given text) in the theme's colours. */
export function createSlide(layout: SlideLayoutId, theme: SlideTheme, fill: { title?: string; body?: string; body2?: string; image?: string } = {}): Slide {
	const paragraph = (value?: string) => (value ? value : "");
	const id = officeLocalId("sl");
	switch (layout) {
		case "title":
			return { id, elements: [
				text(80, 170, 800, 110, paragraph(fill.title), { fontSize: 44, bold: true, align: "center", verticalAlign: "middle" }),
				text(160, 300, 640, 60, paragraph(fill.body), { fontSize: 24, align: "center", verticalAlign: "top", color: mix(theme.color) }),
			] };
		case "titleBody":
			return { id, elements: [
				text(60, 40, 840, 80, paragraph(fill.title), { fontSize: 36, bold: true, verticalAlign: "middle" }),
				text(60, 140, 840, 360, paragraph(fill.body), { fontSize: 22, verticalAlign: "top" }),
			] };
		case "section":
			return { id, elements: [
				{ id: officeLocalId("el"), type: "rect", x: 80, y: 300, w: 120, h: 6, style: { fill: theme.accent } },
				text(80, 180, 800, 110, paragraph(fill.title), { fontSize: 48, bold: true, verticalAlign: "bottom" }),
				text(80, 320, 800, 60, paragraph(fill.body), { fontSize: 22, verticalAlign: "top", color: mix(theme.color) }),
			] };
		case "twoColumns":
			return { id, elements: [
				text(60, 40, 840, 80, paragraph(fill.title), { fontSize: 36, bold: true, verticalAlign: "middle" }),
				text(60, 140, 405, 360, paragraph(fill.body), { fontSize: 20, verticalAlign: "top" }),
				text(495, 140, 405, 360, paragraph(fill.body2), { fontSize: 20, verticalAlign: "top" }),
			] };
		case "imageCaption":
			return { id, elements: [
				fill.image
					? { id: officeLocalId("el"), type: "image", x: 160, y: 40, w: 640, h: 360, src: fill.image }
					: { id: officeLocalId("el"), type: "rect", x: 160, y: 40, w: 640, h: 360, html: "", style: { fill: "#e8eaed", radius: 8 } },
				text(160, 420, 640, 70, paragraph(fill.title), { fontSize: 22, align: "center", verticalAlign: "top" }),
			] };
		default:
			return { id, elements: [] };
	}
}

/** A softened variant of a text colour for subtitles. */
function mix(color: string): string {
	return /^#[0-9a-f]{6}$/i.test(color) ? `${color}b3` : color;
}

/**
 * Switches a deck to another theme. Slide backgrounds go back to the theme's, and colours that came from the
 * old theme (text in its text colour, shapes in its accent) follow the new one; anything customised stays.
 */
export function applyTheme(content: PresentationContent, themeId: SlideThemeId): PresentationContent {
	const previous = resolveTheme(content);
	const next = SLIDE_THEMES[themeId];
	const swap = (value: string | undefined, from: string, to: string) => {
		if (!value) return value;
		if (value.toLowerCase() === from.toLowerCase()) return to;
		if (value.toLowerCase() === `${from}b3`.toLowerCase()) return `${to}b3`;
		return value;
	};
	return {
		...content,
		theme: { ...next },
		slides: content.slides.map((slide) => ({
			...slide,
			background: undefined,
			elements: slide.elements.map((element) => element.style ? {
				...element,
				style: {
					...element.style,
					color: swap(element.style.color, previous.color, next.color),
					fill: swap(element.style.fill, previous.accent, next.accent),
					stroke: swap(element.style.stroke, previous.color, next.color),
				},
			} : element),
		})),
	};
}

/** Only https and inline image data may be used as an image source. */
export function safeImageSrc(src: string | undefined): string | null {
	if (!src) return null;
	if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)) return src;
	try {
		const url = new URL(src);
		return url.protocol === "https:" ? url.href : null;
	} catch {
		return null;
	}
}

/** Fits an image of natural size (w, h) inside a box, keeping its ratio. */
export function fitSize(w: number, h: number, maxW = 600, maxH = 400): { w: number; h: number } {
	if (w <= 0 || h <= 0) return { w: maxW, h: maxH };
	const scale = Math.min(1, maxW / w, maxH / h);
	return { w: round(w * scale), h: round(h * scale) };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const cssColor = (value: string | undefined, fallback: string) => (value && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent|[a-z]+)$/i.test(value) ? value : fallback);

/** Inline CSS for an element's box, shared by the editor and the HTML export. */
export function elementBoxStyle(element: SlideElement): Record<string, string> {
	const style = element.style ?? {};
	const css: Record<string, string> = {
		position: "absolute",
		left: `${element.x}px`,
		top: `${element.y}px`,
		width: `${element.w}px`,
		height: `${element.h}px`,
		opacity: String(style.opacity ?? 1),
	};
	if (element.rotation) css.transform = `rotate(${element.rotation}deg)`;
	return css;
}

/** Inline CSS for an element's visible surface (fill, border, text), shared by the editor and the export. */
export function elementSurfaceStyle(element: SlideElement, theme: SlideTheme): Record<string, string> {
	const style = element.style ?? {};
	const css: Record<string, string> = {
		width: "100%",
		height: "100%",
		boxSizing: "border-box",
		display: "flex",
		flexDirection: "column",
		justifyContent: style.verticalAlign === "middle" ? "center" : style.verticalAlign === "bottom" ? "flex-end" : "flex-start",
		color: cssColor(style.color, theme.color),
		fontSize: `${style.fontSize ?? 20}px`,
		fontFamily: style.fontFamily ?? theme.fontFamily,
		fontWeight: style.bold ? "700" : "400",
		fontStyle: style.italic ? "italic" : "normal",
		textAlign: style.align ?? "left",
		lineHeight: "1.25",
		overflow: "hidden",
		overflowWrap: "break-word",
		padding: element.type === "text" ? "6px 10px" : "10px 14px",
	};
	if (element.type !== "text" || style.fill) css.background = cssColor(style.fill, element.type === "text" ? "transparent" : theme.accent);
	if (style.fill === "transparent") css.background = "transparent";
	if (style.stroke && (style.strokeWidth ?? 0) > 0) css.border = `${style.strokeWidth}px solid ${cssColor(style.stroke, theme.color)}`;
	if (element.type === "ellipse") css.borderRadius = "50%";
	else if (style.radius) css.borderRadius = `${style.radius}px`;
	return css;
}

const toCss = (css: Record<string, string>) => Object.entries(css).map(([key, value]) => `${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value}`).join(";");

/** The CSS rules rich text inside slides relies on. */
export const SLIDE_TEXT_CSS = ".fs-slide-text p,.fs-slide-text div{margin:0}.fs-slide-text ul,.fs-slide-text ol{margin:0;padding-left:1.3em}.fs-slide-text a{color:inherit;text-decoration:underline}";

function exportElement(element: SlideElement, theme: SlideTheme, sanitize: (html: string) => string): string {
	const box = toCss(elementBoxStyle(element));
	const style = element.style ?? {};
	if (element.type === "image") {
		const src = safeImageSrc(element.src);
		return src ? `<div style="${box}"><img src="${escapeHtml(src)}" alt="" style="width:100%;height:100%;object-fit:contain"></div>` : "";
	}
	if (element.type === "line") {
		const stroke = cssColor(style.stroke, theme.color);
		const width = style.strokeWidth ?? 3;
		return `<div style="${box}"><svg width="100%" height="100%" viewBox="0 0 ${element.w} ${element.h}" preserveAspectRatio="none"><line x1="0" y1="${element.h / 2}" x2="${element.w}" y2="${element.h / 2}" stroke="${escapeHtml(stroke)}" stroke-width="${width}"/></svg></div>`;
	}
	return `<div style="${box}"><div class="fs-slide-text" style="${escapeHtml(toCss(elementSurfaceStyle(element, theme)))}"><div>${sanitize(element.html ?? "")}</div></div></div>`;
}

/**
 * A self-contained HTML file that plays the deck: arrow keys, space, click or swipe to move, F for full screen.
 * `sanitize` cleans every piece of rich text (the export may be opened by someone other than its author).
 */
export function buildPresentationHtml(content: PresentationContent, name: string, sanitize: (html: string) => string): string {
	const theme = resolveTheme(content);
	const slides = content.slides.map((slide) => {
		const background = cssColor(slide.background, theme.background);
		return `<section class="slide" style="background:${escapeHtml(background)}">${slide.elements.map((element) => exportElement(element, theme, sanitize)).join("")}</section>`;
	}).join("\n");
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)}</title>
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden}
#stage{position:absolute;left:50%;top:50%;width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;transform-origin:center center}
.slide{position:absolute;inset:0;display:none;overflow:hidden}
.slide.active{display:block}
#counter{position:fixed;right:16px;bottom:12px;color:#9aa0a6;font:13px system-ui,sans-serif}
@media print{html,body{background:#fff;overflow:visible;height:auto}#stage{position:static;transform:none!important}.slide{display:block;position:relative;page-break-after:always}#counter{display:none}@page{size:10in 5.625in;margin:0}}
${SLIDE_TEXT_CSS}
</style>
</head>
<body>
<div id="stage">
${slides}
</div>
<div id="counter"></div>
<script>
(function(){
var slides=document.querySelectorAll(".slide"),stage=document.getElementById("stage"),counter=document.getElementById("counter"),index=0;
function show(i){if(!slides.length)return;index=Math.max(0,Math.min(slides.length-1,i));for(var n=0;n<slides.length;n++)slides[n].classList.toggle("active",n===index);counter.textContent=(index+1)+" / "+slides.length;}
function fit(){var s=Math.min(innerWidth/${SLIDE_WIDTH},innerHeight/${SLIDE_HEIGHT});stage.style.transform="translate(-50%,-50%) scale("+s+")";}
addEventListener("resize",fit);
addEventListener("keydown",function(e){if(["ArrowRight","ArrowDown","PageDown"," ","Enter"].indexOf(e.key)>=0){e.preventDefault();show(index+1);}else if(["ArrowLeft","ArrowUp","PageUp","Backspace"].indexOf(e.key)>=0){e.preventDefault();show(index-1);}else if(e.key==="Home")show(0);else if(e.key==="End")show(slides.length-1);else if(e.key==="f"||e.key==="F"){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen();}});
addEventListener("click",function(e){show(e.clientX<innerWidth/3?index-1:index+1);});
var startX=null;addEventListener("touchstart",function(e){startX=e.touches[0].clientX;});addEventListener("touchend",function(e){if(startX===null)return;var d=e.changedTouches[0].clientX-startX;if(Math.abs(d)>40)show(d<0?index+1:index-1);startX=null;});
fit();show(0);
})();
</script>
</body>
</html>
`;
}
