"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/office/utils";
import type { PresentationContent } from "@/lib/office/types";
import { SlidePreview } from "./slide-view";
import { clamp, resolveTheme } from "./slides-utils";

/**
 * Full-screen slideshow. Arrow keys, Space, Page Up/Down and clicks move between slides, N shows the speaker
 * notes, Escape (or leaving full screen) ends it.
 */
export function PresentMode({ content, startIndex, onExit }: { content: PresentationContent; startIndex: number; onExit: (lastIndex: number) => void }) {
	const { t } = useLanguage();
	const rootRef = useRef<HTMLDivElement>(null);
	const [index, setIndex] = useState(() => clamp(startIndex, 0, Math.max(0, content.slides.length - 1)));
	const [showNotes, setShowNotes] = useState(false);
	const [viewport, setViewport] = useState(() => ({ w: typeof window === "undefined" ? SLIDE_WIDTH : window.innerWidth, h: typeof window === "undefined" ? SLIDE_HEIGHT : window.innerHeight }));
	const indexRef = useRef(index);
	useEffect(() => { indexRef.current = index; }, [index]);
	const exitRef = useRef(onExit);
	useEffect(() => { exitRef.current = onExit; }, [onExit]);
	const count = content.slides.length;
	const theme = resolveTheme(content);

	useEffect(() => {
		const root = rootRef.current;
		root?.focus();
		// Full screen is best effort: browsers may refuse it (iframes, iOS), and the overlay still covers the page.
		if (root?.requestFullscreen && !document.fullscreenElement) void root.requestFullscreen().catch(() => undefined);
		let wasFullscreen = false;
		const onFullscreen = () => {
			if (document.fullscreenElement) wasFullscreen = true;
			else if (wasFullscreen) exitRef.current(indexRef.current);
		};
		const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
		document.addEventListener("fullscreenchange", onFullscreen);
		window.addEventListener("resize", onResize);
		return () => {
			document.removeEventListener("fullscreenchange", onFullscreen);
			window.removeEventListener("resize", onResize);
			if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
		};
	}, []);

	const go = (delta: number) => setIndex((current) => clamp(current + delta, 0, Math.max(0, count - 1)));

	function onKeyDown(event: React.KeyboardEvent) {
		const key = event.key;
		if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(key)) { event.preventDefault(); go(1); }
		else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(key)) { event.preventDefault(); go(-1); }
		else if (key === "Home") setIndex(0);
		else if (key === "End") setIndex(Math.max(0, count - 1));
		else if (key === "n" || key === "N") setShowNotes((value) => !value);
		else if (key === "Escape") { event.preventDefault(); onExit(index); }
	}

	const notesHeight = showNotes ? Math.min(160, viewport.h * 0.25) : 0;
	const scale = Math.min(viewport.w / SLIDE_WIDTH, (viewport.h - notesHeight) / SLIDE_HEIGHT);
	const slide = content.slides[index];
	const notes = slide?.notes?.trim();

	return (
		<div
			ref={rootRef}
			tabIndex={-1}
			role="dialog"
			aria-modal="true"
			aria-label={t("slides.presenting")}
			onKeyDown={onKeyDown}
			className="group fixed inset-0 z-[1000] flex flex-col items-center justify-center outline-none print:hidden"
			style={{ background: "#000", colorScheme: "dark" }}
		>
			<div className="flex min-h-0 flex-1 items-center justify-center" onClick={(event) => go(event.clientX < window.innerWidth / 3 ? -1 : 1)}>
				{slide ? <SlidePreview slide={slide} theme={theme} scale={scale} /> : <p style={{ color: "#9aa0a6" }}>{t("slides.noSlides")}</p>}
			</div>
			{showNotes && (
				<div className="w-full overflow-y-auto px-8 py-3 text-base whitespace-pre-wrap" style={{ height: notesHeight, color: "#e8eaed", background: "#202124" }}>
					{notes || <span style={{ color: "#9aa0a6" }}>{t("slides.noNotes")}</span>}
				</div>
			)}
			<div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full px-2 py-1 text-sm opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100" style={{ background: "rgb(32 33 36 / 0.85)", color: "#e8eaed" }}>
				<button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label={t("slides.previousSlide")} className="rounded-full p-1.5 disabled:opacity-40" style={{ color: "#e8eaed" }}><ChevronLeft size={18} /></button>
				<span className="px-1 tabular-nums">{t("slides.slideOf", { index: count ? index + 1 : 0, count })}</span>
				<button type="button" onClick={() => go(1)} disabled={index >= count - 1} aria-label={t("slides.nextSlide")} className="rounded-full p-1.5 disabled:opacity-40" style={{ color: "#e8eaed" }}><ChevronRight size={18} /></button>
				<button type="button" onClick={() => setShowNotes((value) => !value)} aria-pressed={showNotes} className="rounded-full px-2 py-1 text-xs" style={{ color: "#e8eaed" }}>{t("slides.notes")}</button>
				<button type="button" onClick={() => onExit(index)} aria-label={t("slides.exitPresentation")} className="rounded-full p-1.5" style={{ color: "#e8eaed" }}><X size={18} /></button>
			</div>
		</div>
	);
}
