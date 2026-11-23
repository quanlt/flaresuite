"use client";

import type { CSSProperties, ReactNode } from "react";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/office/utils";
import type { Slide, SlideElement } from "@/lib/office/types";
import { sanitizeOfficeHtml } from "../sanitize";
import { elementBoxStyle, elementSurfaceStyle, isHtmlEmpty, safeImageSrc, SLIDE_TEXT_CSS } from "./slides-utils";
import type { SlideTheme } from "./slides-types";

/** The rules rich text inside slides needs; render once per page that shows slides. */
export function SlideTextStyles() {
	return <style>{SLIDE_TEXT_CSS}</style>;
}

/** Placeholder hint shown on an empty text box in edit mode, picked by how big the text is. */
export function placeholderKind(element: SlideElement): "title" | "body" {
	return (element.style?.fontSize ?? 20) >= 32 ? "title" : "body";
}

/**
 * What an element looks like, filling its box: shape, line, image, or rich text. `hint` is shown in an empty text
 * box; `children` replaces the text (the editor puts its contentEditable there).
 */
export function ElementSurface({ element, theme, hint, children }: { element: SlideElement; theme: SlideTheme; hint?: string; children?: ReactNode }) {
	const style = element.style ?? {};
	if (element.type === "image") {
		const src = safeImageSrc(element.src);
		return src
			? <img src={src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} />
			: <div style={{ width: "100%", height: "100%", background: "#e8eaed" }} />;
	}
	if (element.type === "line") {
		return (
			<svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, element.w)} ${Math.max(1, element.h)}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
				<line x1="0" y1={element.h / 2} x2={element.w} y2={element.h / 2} stroke={style.stroke ?? theme.color} strokeWidth={style.strokeWidth ?? 3} vectorEffect="non-scaling-stroke" />
			</svg>
		);
	}
	const surface = elementSurfaceStyle(element, theme) as CSSProperties;
	const empty = isHtmlEmpty(element.html);
	return (
		<div className="fs-slide-text" style={surface}>
			{children ?? (empty && hint
				? <div style={{ opacity: 0.45 }}>{hint}</div>
				// Stored rich text comes from other people too, so it is always sanitized before rendering.
				: <div dangerouslySetInnerHTML={{ __html: sanitizeOfficeHtml(element.html ?? "") }} />)}
		</div>
	);
}

/** One element placed on the slide, not interactive. */
function StaticElement({ element, theme, hint }: { element: SlideElement; theme: SlideTheme; hint?: string }) {
	return <div style={elementBoxStyle(element) as CSSProperties}><ElementSurface element={element} theme={theme} hint={hint} /></div>;
}

/** A slide at its natural 960 x 540 size; wrap it in `ScaledSlide` to show it smaller or larger. */
export function SlideCanvas({ slide, theme, hintFor, children }: { slide: Slide; theme: SlideTheme; hintFor?: (element: SlideElement) => string | undefined; children?: ReactNode }) {
	return (
		<div style={{ position: "relative", width: SLIDE_WIDTH, height: SLIDE_HEIGHT, overflow: "hidden", background: slide.background ?? theme.background, colorScheme: "light", fontFamily: theme.fontFamily }}>
			{children ?? slide.elements.map((element) => <StaticElement key={element.id} element={element} theme={theme} hint={hintFor?.(element)} />)}
		</div>
	);
}

/** Shows children laid out at 960 x 540 scaled by `scale`, taking exactly the scaled space. */
export function ScaledSlide({ scale, children, className, style }: { scale: number; children: ReactNode; className?: string; style?: CSSProperties }) {
	return (
		<div className={className} style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale, overflow: "hidden", position: "relative", flexShrink: 0, ...style }}>
			<div style={{ position: "absolute", left: 0, top: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "0 0" }}>{children}</div>
		</div>
	);
}

/** A non-interactive slide at a given scale: thumbnails, read-only view and present mode. */
export function SlidePreview({ slide, theme, scale, className, style }: { slide: Slide; theme: SlideTheme; scale: number; className?: string; style?: CSSProperties }) {
	return <ScaledSlide scale={scale} className={className} style={style}><SlideCanvas slide={slide} theme={theme} /></ScaledSlide>;
}
