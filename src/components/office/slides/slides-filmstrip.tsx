"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Copy, EyeOff, MoreVertical, Trash2 } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import type { Slide } from "@/lib/office/types";
import { SlidePreview } from "./slide-view";
import type { SlideTheme } from "./slides-types";

const THUMB_SCALE = 156 / 960;
const GRID_SCALE = 200 / 960;
const menuItemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[disabled]:opacity-40";

type FilmstripProps = {
	slides: Slide[];
	theme: SlideTheme;
	current: number;
	readOnly: boolean;
	onSelect: (index: number) => void;
	onMove: (from: number, to: number) => void;
	onDuplicate: (index: number) => void;
	onDelete: (index: number) => void;
	onToggleSkip: (index: number) => void;
	onFocus: () => void;
};

/** Slide thumbnails: click to open, drag (or the menu) to reorder, duplicate or delete. */
export function SlidesFilmstrip({ slides, theme, current, readOnly, onSelect, onMove, onDuplicate, onDelete, onToggleSkip, onFocus }: FilmstripProps) {
	const { t } = useLanguage();
	const [dragFrom, setDragFrom] = useState<number | null>(null);
	const [dropAt, setDropAt] = useState<number | null>(null);

	return (
		<ol
			aria-label={t("slides.slides")}
			onPointerDown={onFocus}
			className="flex shrink-0 gap-2 overflow-x-auto border-neutral-200 p-3 max-md:border-t md:w-[208px] md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-r print:hidden"
		>
			{slides.map((slide, index) => (
				<li
					key={slide.id}
					draggable={!readOnly}
					onDragStart={(event) => { setDragFrom(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }}
					onDragOver={(event) => { if (dragFrom === null) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const vertical = rect.height > rect.width * 0.4 && window.matchMedia("(min-width: 768px)").matches; const after = vertical ? event.clientY > rect.top + rect.height / 2 : event.clientX > rect.left + rect.width / 2; setDropAt(after ? index + 1 : index); }}
					onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
					onDrop={(event) => { event.preventDefault(); if (dragFrom !== null && dropAt !== null) onMove(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt); setDragFrom(null); setDropAt(null); }}
					className={clsx("group relative flex shrink-0 items-start gap-1.5", dropAt === index && "before:absolute before:-top-1.5 before:left-5 before:right-0 before:h-0.5 before:bg-blue-500", dropAt === index + 1 && index === slides.length - 1 && "after:absolute after:-bottom-1.5 after:left-5 after:right-0 after:h-0.5 after:bg-blue-500")}
				>
					<span className="w-4 pt-1 text-right text-xs tabular-nums text-neutral-500">{index + 1}</span>
					<button
						type="button"
						onClick={() => onSelect(index)}
						aria-current={index === current ? "true" : undefined}
						aria-label={t("slides.slideNumber", { index: index + 1 })}
						className={clsx("overflow-hidden rounded-md border-2 transition-colors", index === current ? "border-blue-500" : "border-transparent hover:border-neutral-300", dragFrom === index && "opacity-50")}
					>
						<SlidePreview slide={slide} theme={theme} scale={THUMB_SCALE} style={{ boxShadow: "0 0 0 1px rgb(60 64 67 / 0.15)", pointerEvents: "none", opacity: slide.skipped ? 0.45 : 1 }} />
					</button>
					{slide.skipped && <span title={t("slides.skipped")} className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800/80 text-white"><EyeOff size={12} aria-label={t("slides.skipped")} /></span>}
					{!readOnly && (
						<DropdownMenu.Root>
							<DropdownMenu.Trigger asChild>
								<button type="button" aria-label={t("slides.slideActions")} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-neutral-700 opacity-0 shadow transition-opacity focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"><MoreVertical size={14} /></button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Portal>
								<DropdownMenu.Content align="start" sideOffset={4} className="z-[200] min-w-48 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
									<DropdownMenu.Item className={menuItemClass} onSelect={() => onDuplicate(index)}><Copy size={16} />{t("slides.duplicateSlide")}</DropdownMenu.Item>
									<DropdownMenu.Item className={menuItemClass} onSelect={() => onToggleSkip(index)}><EyeOff size={16} />{slide.skipped ? t("slides.unskipSlide") : t("slides.skipSlide")}</DropdownMenu.Item>
									<DropdownMenu.Item className={menuItemClass} disabled={index === 0} onSelect={() => onMove(index, index - 1)}><ArrowUp size={16} />{t("slides.moveUp")}</DropdownMenu.Item>
									<DropdownMenu.Item className={menuItemClass} disabled={index === slides.length - 1} onSelect={() => onMove(index, index + 1)}><ArrowDown size={16} />{t("slides.moveDown")}</DropdownMenu.Item>
									<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
									<DropdownMenu.Item className={clsx(menuItemClass, "text-red-600")} onSelect={() => onDelete(index)}><Trash2 size={16} />{t("slides.deleteSlide")}</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Portal>
						</DropdownMenu.Root>
					)}
				</li>
			))}
		</ol>
	);
}

/** Every slide as a large thumbnail (View → Grid view); clicking one opens it in the editor. */
export function SlidesGrid({ slides, theme, current, onOpen }: { slides: Slide[]; theme: SlideTheme; current: number; onOpen: (index: number) => void }) {
	const { t } = useLanguage();
	return (
		<ol aria-label={t("slides.gridView")} className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5 overflow-y-auto p-6 print:hidden">
			{slides.map((slide, index) => (
				<li key={slide.id} className="flex flex-col items-center gap-1.5">
					<button
						type="button"
						onClick={() => onOpen(index)}
						aria-current={index === current ? "true" : undefined}
						aria-label={t("slides.slideNumber", { index: index + 1 })}
						className={clsx("relative overflow-hidden rounded-md border-2 transition-colors", index === current ? "border-blue-500" : "border-transparent hover:border-neutral-300")}
					>
						<SlidePreview slide={slide} theme={theme} scale={GRID_SCALE} style={{ boxShadow: "0 0 0 1px rgb(60 64 67 / 0.15)", pointerEvents: "none", opacity: slide.skipped ? 0.45 : 1 }} />
						{slide.skipped && <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800/80 text-white"><EyeOff size={12} aria-label={t("slides.skipped")} /></span>}
					</button>
					<span className="text-xs tabular-nums text-neutral-600">{index + 1}</span>
				</li>
			))}
		</ol>
	);
}
