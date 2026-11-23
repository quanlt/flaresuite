"use client";

import { useMemo } from "react";
import type { RefObject } from "react";
import { ArrowDown, ArrowUp, Bold, Copy, EyeOff, ImagePlus, Italic, Link2, List, Palette, Play, Plus, Printer, Trash2, Underline, Undo2, Upload } from "@/components/icons";
import type { TranslationKey } from "@/lib/i18n/types";
import type { Translator } from "@/lib/i18n/utils";
import { shortcutLabel } from "../office-menus";
import type { OfficeMenu, OfficeMenuItem } from "../office-menus-types";
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon, ArrangeIcon, ArrowShapeIcon, BackgroundIcon, BorderIcon, EllipseIcon, FillIcon, FilmstripIcon, GridIcon, LayoutIcon, LineIcon, NotesIcon, RectIcon, RedoIcon, RoundRectIcon, ShapesIcon, TextBoxIcon, TextColorIcon, TriangleIcon, VAlignBottomIcon, VAlignMiddleIcon, VAlignTopIcon, ZoomIcon } from "./slides-icons";
import { FONT_FAMILIES, FONT_SIZES, LAYOUT_LABELS, SLIDE_LAYOUTS, SLIDE_THEMES, STROKE_WIDTHS, THEME_LABELS, ZOOM_LEVELS } from "./slides-utils";
import type { AlignMode, SlidesActions, SlidesMenuState, SlideThemeId, ZOrderMove } from "./slides-types";

type T = Translator;

const separator: OfficeMenuItem = { kind: "separator" };

/**
 * The Slides menu bar (Edit, View, Insert, Format, Slide). Items call the latest actions through `actionsRef`, so
 * the menus are rebuilt only when what they show changes. Read-only viewers get View alone.
 */
export function useSlidesMenus(state: SlidesMenuState, actionsRef: RefObject<SlidesActions>, t: T): OfficeMenu[] {
	const key = JSON.stringify(state);
	return useMemo(() => buildSlidesMenus(JSON.parse(key) as SlidesMenuState, actionsRef, t), [key, actionsRef, t]);
}

function buildSlidesMenus(state: SlidesMenuState, actionsRef: RefObject<SlidesActions>, t: T): OfficeMenu[] {
	const run = <K extends keyof SlidesActions>(name: K, ...args: Parameters<SlidesActions[K]>) => () => (actionsRef.current[name] as (...values: Parameters<SlidesActions[K]>) => void)(...args);
	const item = (id: string, label: string, onSelect: () => void, extra: Partial<Extract<OfficeMenuItem, { kind: "item" }>> = {}): OfficeMenuItem => ({ kind: "item", id, label, onSelect, ...extra });
	const noSelection = state.selectionCount === 0;
	const noSlide = state.slideCount === 0;

	const view: OfficeMenu = {
		id: "view",
		label: t("slides.menu.view"),
		items: [
			item("present-current", t("slides.presentFromCurrent"), run("present", false), { icon: Play, shortcut: shortcutLabel("Mod+Enter"), disabled: noSlide }),
			item("present-start", t("slides.presentFromStart"), run("present", true), { shortcut: shortcutLabel("Mod+Shift+Enter"), disabled: noSlide }),
			separator,
			item("grid", t("slides.gridView"), run("toggleGrid"), { icon: GridIcon, checked: state.gridView }),
			item("filmstrip", t("slides.showFilmstrip"), run("toggleFilmstrip"), { icon: FilmstripIcon, checked: state.showFilmstrip }),
			item("notes", t("slides.showNotes"), run("toggleNotes"), { icon: NotesIcon, checked: state.showNotes }),
			separator,
			{
				kind: "submenu",
				id: "zoom",
				label: t("slides.zoom"),
				icon: ZoomIcon,
				items: [
					item("zoom-fit", t("slides.zoomFit"), run("setZoom", "fit"), { checked: state.zoom === "fit" }),
					separator,
					...ZOOM_LEVELS.map((level) => item(`zoom-${level}`, `${level}%`, run("setZoom", level), { checked: state.zoom === level })),
				],
			},
		],
	};
	if (state.readOnly) return [view];

	const edit: OfficeMenu = {
		id: "edit",
		label: t("slides.menu.edit"),
		items: [
			item("undo", t("slides.undo"), run("undo"), { icon: Undo2, shortcut: shortcutLabel("Mod+Z"), disabled: !state.canUndo }),
			item("redo", t("slides.redo"), run("redo"), { icon: RedoIcon, shortcut: shortcutLabel("Mod+Shift+Z"), disabled: !state.canRedo }),
			separator,
			item("cut", t("slides.cut"), run("cut"), { shortcut: shortcutLabel("Mod+X"), disabled: noSelection }),
			item("copy", t("slides.copy"), run("copy"), { shortcut: shortcutLabel("Mod+C"), disabled: noSelection }),
			item("paste", t("slides.paste"), run("paste"), { shortcut: shortcutLabel("Mod+V"), disabled: !state.canPaste || noSlide }),
			separator,
			item("duplicate", t("slides.duplicate"), run("duplicate"), { icon: Copy, shortcut: shortcutLabel("Mod+D"), disabled: noSelection }),
			item("delete", t("slides.delete"), run("deleteSelection"), { icon: Trash2, shortcut: "Delete", disabled: noSelection }),
			separator,
			item("select-all", t("slides.selectAll"), run("selectAll"), { shortcut: shortcutLabel("Mod+A"), disabled: noSlide }),
		],
	};

	const shapes: OfficeMenuItem[] = [
		item("rect", t("slides.shape.rect"), run("insert", "rect"), { icon: RectIcon }),
		item("roundRect", t("slides.shape.roundRect"), run("insert", "roundRect"), { icon: RoundRectIcon }),
		item("ellipse", t("slides.shape.ellipse"), run("insert", "ellipse"), { icon: EllipseIcon }),
		item("triangle", t("slides.shape.triangle"), run("insert", "triangle"), { icon: TriangleIcon }),
		item("arrow", t("slides.shape.arrow"), run("insert", "arrow"), { icon: ArrowShapeIcon }),
	];
	const insert: OfficeMenu = {
		id: "insert",
		label: t("slides.insert"),
		items: [
			item("text", t("slides.textBox"), run("insert", "text"), { icon: TextBoxIcon }),
			{ kind: "submenu", id: "image", label: t("slides.image"), icon: ImagePlus, items: [
				item("upload", t("slides.imageUpload"), run("uploadImage"), { icon: Upload }),
				item("url", t("slides.imageUrl"), run("imageUrl"), { icon: Link2 }),
			] },
			{ kind: "submenu", id: "shape", label: t("slides.shape"), icon: ShapesIcon, items: shapes },
			item("line", t("slides.shape.line"), run("insert", "line"), { icon: LineIcon }),
			separator,
			item("new-slide", t("slides.newSlide"), run("addSlide", "titleBody"), { icon: Plus, shortcut: "Ctrl+M" }),
			item("duplicate-slide", t("slides.duplicateSlide"), run("duplicateSlide"), { icon: Copy, disabled: noSlide }),
		],
	};

	const textItems: OfficeMenuItem[] = [
		item("bold", t("slides.bold"), run("toggleBold"), { icon: Bold, shortcut: shortcutLabel("Mod+B"), checked: !state.editing && state.bold, disabled: !state.hasText }),
		item("italic", t("slides.italic"), run("toggleItalic"), { icon: Italic, shortcut: shortcutLabel("Mod+I"), checked: !state.editing && state.italic, disabled: !state.hasText }),
		item("underline", t("slides.underline"), run("toggleUnderline"), { icon: Underline, shortcut: shortcutLabel("Mod+U"), checked: !state.editing && state.underline, disabled: !state.hasText }),
		item("bullets", t("slides.bullets"), run("toggleBullets"), { icon: List, disabled: !state.editing }),
		separator,
		{ kind: "submenu", id: "font", label: t("slides.fontFamily"), disabled: !state.hasText, items: FONT_FAMILIES.map((font) => item(`font-${font.label}`, font.label, run("setFontFamily", font.value), { checked: state.fontFamily === font.value })) },
		{ kind: "submenu", id: "size", label: t("slides.fontSize"), disabled: !state.hasText, items: FONT_SIZES.map((size) => item(`size-${size}`, String(size), run("setFontSize", size), { checked: state.fontSize === size })) },
		item("text-color", t("slides.textColor"), run("pickColor", "text"), { icon: TextColorIcon, disabled: !state.hasText }),
	];
	const alignItems: OfficeMenuItem[] = [
		item("align-left", t("slides.alignLeft"), run("setAlign", "left"), { icon: AlignLeftIcon, checked: state.align === "left" }),
		item("align-center", t("slides.alignCenter"), run("setAlign", "center"), { icon: AlignCenterIcon, checked: state.align === "center" }),
		item("align-right", t("slides.alignRight"), run("setAlign", "right"), { icon: AlignRightIcon, checked: state.align === "right" }),
		separator,
		item("align-top", t("slides.alignTop"), run("setVerticalAlign", "top"), { icon: VAlignTopIcon, checked: state.verticalAlign === "top" }),
		item("align-middle", t("slides.alignMiddle"), run("setVerticalAlign", "middle"), { icon: VAlignMiddleIcon, checked: state.verticalAlign === "middle" }),
		item("align-bottom", t("slides.alignBottom"), run("setVerticalAlign", "bottom"), { icon: VAlignBottomIcon, checked: state.verticalAlign === "bottom" }),
	];
	const order: [ZOrderMove, TranslationKey, string][] = [["front", "slides.bringToFront", "Mod+Shift+↑"], ["forward", "slides.bringForward", "Mod+↑"], ["backward", "slides.sendBackward", "Mod+↓"], ["back", "slides.sendToBack", "Mod+Shift+↓"]];
	const arrangeItems: OfficeMenuItem[] = [
		...order.map(([move, label, shortcut]) => item(`z-${move}`, t(label), run("arrange", move), { shortcut: shortcutLabel(shortcut) })),
		separator,
		{ kind: "submenu", id: "align-slide", label: t("slides.alignToSlide"), items: (["left", "center", "right", "top", "middle", "bottom"] as AlignMode[]).map((mode) => item(`slide-${mode}`, t(`slides.alignSlide.${mode}` as TranslationKey), run("alignToSlide", mode))) },
	];
	const format: OfficeMenu = {
		id: "format",
		label: t("slides.menu.format"),
		items: [
			{ kind: "submenu", id: "text", label: t("slides.text"), icon: Bold, disabled: !state.hasText, items: textItems },
			{ kind: "submenu", id: "alignment", label: t("slides.alignment"), icon: AlignLeftIcon, disabled: !state.hasText, items: alignItems },
			separator,
			item("fill", t("slides.fillColor"), run("pickColor", "fill"), { icon: FillIcon, disabled: !state.hasFill }),
			item("no-fill", t("slides.noFill"), run("noFill"), { disabled: !state.hasFill }),
			item("border", t("slides.borderColor"), run("pickColor", "stroke"), { icon: BorderIcon, disabled: !state.hasStroke }),
			{ kind: "submenu", id: "border-width", label: t("slides.borderWidth"), disabled: !state.hasStroke, items: STROKE_WIDTHS.map((width) => item(`border-${width}`, `${width} px`, run("setStrokeWidth", width), { checked: state.strokeWidth === width })) },
			separator,
			{ kind: "submenu", id: "arrange", label: t("slides.arrange"), icon: ArrangeIcon, disabled: noSelection, items: arrangeItems },
		],
	};

	const slide: OfficeMenu = {
		id: "slide",
		label: t("slides.menu.slide"),
		items: [
			item("new", t("slides.newSlide"), run("addSlide", "titleBody"), { icon: Plus, shortcut: "Ctrl+M" }),
			item("duplicate", t("slides.duplicateSlide"), run("duplicateSlide"), { icon: Copy, disabled: noSlide }),
			item("delete", t("slides.deleteSlide"), run("deleteSlide"), { icon: Trash2, disabled: noSlide, danger: true }),
			item("skip", t("slides.skipSlide"), run("toggleSkip"), { icon: EyeOff, checked: state.skipped, disabled: noSlide }),
			separator,
			item("up", t("slides.moveUp"), run("moveSlide", -1), { icon: ArrowUp, shortcut: shortcutLabel("Mod+↑"), disabled: state.current <= 0 }),
			item("down", t("slides.moveDown"), run("moveSlide", 1), { icon: ArrowDown, shortcut: shortcutLabel("Mod+↓"), disabled: state.current >= state.slideCount - 1 }),
			separator,
			item("background", t("slides.changeBackground"), run("pickColor", "background"), { icon: BackgroundIcon, disabled: noSlide }),
			item("reset-background", t("slides.resetBackground"), run("resetBackground"), { disabled: noSlide }),
			{ kind: "submenu", id: "layout", label: t("slides.applyLayout"), icon: LayoutIcon, disabled: noSlide, items: SLIDE_LAYOUTS.map((layout) => item(`layout-${layout}`, t(LAYOUT_LABELS[layout]), run("applyLayout", layout))) },
			{ kind: "submenu", id: "theme", label: t("slides.themeLabel"), icon: Palette, items: (Object.keys(SLIDE_THEMES) as SlideThemeId[]).map((id) => item(`theme-${id}`, t(THEME_LABELS[id]), run("setTheme", id), { checked: state.themeId === id })) },
			separator,
			item("print", t("office.print"), run("print"), { icon: Printer, shortcut: shortcutLabel("Mod+P") }),
		],
	};

	return [edit, view, insert, format, slide];
}
