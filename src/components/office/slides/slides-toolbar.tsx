"use client";

import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { Bold, ChevronDown, Copy, ImagePlus, Italic, Link2, List, Palette, Play, Plus, Printer, Trash2, Underline, Undo2, Upload } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { Select } from "@/components/ui/select";
import type { TranslationKey } from "@/lib/i18n/types";
import type { SlideElement } from "@/lib/office/types";
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon, ArrangeIcon, ArrowShapeIcon, BackgroundIcon, BorderIcon, CursorIcon, EllipseIcon, FillIcon, LayoutIcon, LineIcon, RectIcon, RedoIcon, RoundRectIcon, ShapesIcon, TextBoxIcon, TextColorIcon, TriangleIcon, VAlignBottomIcon, VAlignMiddleIcon, VAlignTopIcon } from "./slides-icons";
import { FONT_FAMILIES, FONT_SIZES, hasTextBody, LAYOUT_LABELS, SLIDE_LAYOUTS, SLIDE_THEMES, STROKE_WIDTHS, THEME_LABELS, ZOOM_LEVELS } from "./slides-utils";
import type { AlignMode, InsertKind, SlideLayoutId, SlideThemeId, ZoomLevel, ZOrderMove } from "./slides-types";
type Style = NonNullable<SlideElement["style"]>;

export type SlidesToolbarProps = {
	readOnly: boolean;
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	onAddSlide: (layout: SlideLayoutId) => void;
	onInsert: (kind: InsertKind) => void;
	onUploadImage: () => void;
	onImageUrl: () => void;
	selection: SlideElement[];
	editing: boolean;
	onStyle: (patch: Partial<Style>, coalesce?: string) => void;
	onExec: (command: string, value?: string) => void;
	onArrange: (move: ZOrderMove) => void;
	onAlign: (mode: AlignMode) => void;
	onDuplicate: () => void;
	onDelete: () => void;
	themeId: SlideThemeId | null;
	onTheme: (id: SlideThemeId) => void;
	background: string;
	onBackground: (color: string | undefined, coalesce?: string) => void;
	onPresent: (fromStart: boolean) => void;
	onApplyLayout: (layout: SlideLayoutId) => void;
	onSelectTool: () => void;
	onPrint: () => void;
	zoom: ZoomLevel;
	onZoom: (zoom: ZoomLevel) => void;
	hasSlide: boolean;
	themeFont: string;
};

const menuClass = "z-[200] min-w-52 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl";
const menuItemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100";
const OPACITIES = [100, 90, 75, 50, 25, 10];
const RADII = [0, 4, 8, 16, 24, 48];


/** A color input as a toolbar button: the native picker opens on click. */
function hex(value: string | undefined, fallback: string): string {
	return value && /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : fallback;
}

function ToolButton({ label, onClick, active, disabled, children }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			aria-pressed={active === undefined ? undefined : active}
			disabled={disabled}
			// Keeps the caret and selection inside a text box being edited.
			onMouseDown={(event) => event.preventDefault()}
			onClick={onClick}
			className={clsx("flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent", active && "bg-blue-100 text-blue-800 hover:bg-blue-100")}
		>
			{children}
		</button>
	);
}

function ColorButton({ label, value, onChange, children }: { label: string; value: string; onChange: (color: string) => void; children: ReactNode }) {
	return (
		<label title={label} className="relative flex h-8 w-9 shrink-0 cursor-pointer flex-col items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100" onMouseDown={(event) => { if ((event.target as HTMLElement).tagName !== "INPUT") event.preventDefault(); }}>
			{children}
			<span className="mt-0.5 h-1 w-5 rounded-sm" style={{ background: value, boxShadow: "0 0 0 1px rgb(0 0 0 / 0.15)" }} />
			<input type="color" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
		</label>
	);
}

function Divider() {
	return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-neutral-200" />;
}

function Menu({ trigger, label, children, compact }: { trigger: ReactNode; label: string; children: ReactNode; compact?: boolean }) {
	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<button type="button" aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} className={clsx("flex h-8 shrink-0 items-center gap-1 rounded-md text-sm text-neutral-700 hover:bg-neutral-100 data-[state=open]:bg-neutral-100", compact ? "px-0.5" : "px-1.5")}>{trigger}<ChevronDown size={12} /></button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content align="start" sideOffset={4} className={menuClass} onCloseAutoFocus={(event) => event.preventDefault()}>{children}</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

/** Commands above the canvas. In read-only mode only presenting is offered. */
export function SlidesToolbar(props: SlidesToolbarProps) {
	const { t } = useLanguage();
	const { selection, editing } = props;
	const first = selection[0];
	const style: Style = first?.style ?? {};
	const hasText = selection.some((element) => hasTextBody(element.type));
	const hasFill = selection.some((element) => element.type !== "line" && element.type !== "image");
	const hasStroke = selection.some((element) => element.type !== "image");
	const isRect = selection.length > 0 && selection.every((element) => element.type === "rect");

	const present = (
		<DropdownMenu.Root>
			<div className="ml-auto flex shrink-0 items-center rounded-full bg-blue-600 text-white">
				<button type="button" onClick={() => props.onPresent(false)} className="flex h-8 items-center gap-1.5 rounded-l-full pl-3 pr-2 text-sm font-medium hover:bg-blue-700"><Play size={14} />{t("slides.present")}</button>
				<DropdownMenu.Trigger asChild>
					<button type="button" aria-label={t("slides.presentOptions")} className="flex h-8 items-center rounded-r-full border-l border-blue-500 px-2 hover:bg-blue-700"><ChevronDown size={14} /></button>
				</DropdownMenu.Trigger>
			</div>
			<DropdownMenu.Portal>
				<DropdownMenu.Content align="end" sideOffset={4} className={menuClass}>
					<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onPresent(false)}>{t("slides.presentFromCurrent")}</DropdownMenu.Item>
					<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onPresent(true)}>{t("slides.presentFromStart")}</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);

	const zoomSelect = (
		<Select value={String(props.zoom)} onChange={(event) => props.onZoom(event.target.value === "fit" ? "fit" : Number(event.target.value))} aria-label={t("slides.zoom")} className="h-8 w-[5rem] text-xs" containerClassName="shrink-0">
			<option value="fit">{t("slides.zoomFit")}</option>
			{ZOOM_LEVELS.map((level) => <option key={level} value={String(level)}>{level}%</option>)}
		</Select>
	);

	if (props.readOnly) {
		return (
			<div role="toolbar" aria-label={t("slides.toolbar")} className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-neutral-200 px-3 print:hidden">
				<ToolButton label={t("office.print")} onClick={props.onPrint}><Printer size={16} /></ToolButton>
				{zoomSelect}
				<span className="w-3 shrink-0" />
				{present}
			</div>
		);
	}

	return (
		<div role="toolbar" aria-label={t("slides.toolbar")} className="flex h-12 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-neutral-200 px-2 print:hidden">
			<ToolButton label={t("slides.undo")} onClick={props.onUndo} disabled={!props.canUndo}><Undo2 size={16} /></ToolButton>
			<ToolButton label={t("slides.redo")} onClick={props.onRedo} disabled={!props.canRedo}><RedoIcon size={16} /></ToolButton>
			<ToolButton label={t("office.print")} onClick={props.onPrint}><Printer size={16} /></ToolButton>
			{zoomSelect}
			<Divider />
			<div className="flex shrink-0 items-center">
				<ToolButton label={t("slides.newSlide")} onClick={() => props.onAddSlide("titleBody")}><Plus size={16} /><span className="text-sm max-sm:hidden">{t("slides.newSlide")}</span></ToolButton>
				<Menu label={t("slides.newSlideWithLayout")} trigger={null} compact>
					{SLIDE_LAYOUTS.map((layout) => <DropdownMenu.Item key={layout} className={menuItemClass} onSelect={() => props.onAddSlide(layout)}>{t(LAYOUT_LABELS[layout])}</DropdownMenu.Item>)}
				</Menu>
			</div>
			<Divider />
			<ToolButton label={t("slides.select")} active={!props.editing} onClick={props.onSelectTool}><CursorIcon size={16} /></ToolButton>
			<ToolButton label={t("slides.textBox")} onClick={() => props.onInsert("text")}><TextBoxIcon size={17} /></ToolButton>
			<Menu label={t("slides.image")} trigger={<ImagePlus size={17} />}>
				<DropdownMenu.Item className={menuItemClass} onSelect={props.onUploadImage}><Upload size={16} />{t("slides.imageUpload")}</DropdownMenu.Item>
				<DropdownMenu.Item className={menuItemClass} onSelect={props.onImageUrl}><Link2 size={16} />{t("slides.imageUrl")}</DropdownMenu.Item>
			</Menu>
			<Menu label={t("slides.shape")} trigger={<ShapesIcon size={17} />}>
				<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onInsert("rect")}><RectIcon size={16} />{t("slides.shape.rect")}</DropdownMenu.Item>
				<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onInsert("roundRect")}><RoundRectIcon size={16} />{t("slides.shape.roundRect")}</DropdownMenu.Item>
				<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onInsert("ellipse")}><EllipseIcon size={16} />{t("slides.shape.ellipse")}</DropdownMenu.Item>
				<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onInsert("triangle")}><TriangleIcon size={16} />{t("slides.shape.triangle")}</DropdownMenu.Item>
				<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onInsert("arrow")}><ArrowShapeIcon size={16} />{t("slides.shape.arrow")}</DropdownMenu.Item>
			</Menu>
			<ToolButton label={t("slides.shape.line")} onClick={() => props.onInsert("line")}><LineIcon size={16} /></ToolButton>
			<Divider />
			{selection.length > 0 ? (
				<>
					{hasFill && <ColorButton label={t("slides.fillColor")} value={hex(style.fill, "#ffffff")} onChange={(color) => props.onStyle({ fill: color }, "fill")}><FillIcon size={15} /></ColorButton>}
					{hasFill && <ToolButton label={t("slides.noFill")} active={style.fill === "transparent"} onClick={() => props.onStyle({ fill: style.fill === "transparent" ? undefined : "transparent" })}><span className="text-xs">∅</span></ToolButton>}
					{hasStroke && <ColorButton label={t("slides.borderColor")} value={hex(style.stroke, "#202124")} onChange={(color) => props.onStyle({ stroke: color, strokeWidth: style.strokeWidth || 2 }, "stroke")}><BorderIcon size={15} /></ColorButton>}
					{hasStroke && (
						<Select value={String(style.strokeWidth ?? 0)} onChange={(event) => props.onStyle({ strokeWidth: Number(event.target.value) })} aria-label={t("slides.borderWidth")} className="h-8 w-[4.5rem] text-xs" containerClassName="shrink-0">
							{STROKE_WIDTHS.map((width) => <option key={width} value={String(width)}>{width} px</option>)}
						</Select>
					)}
					{isRect && (
						<Select value={String(style.radius ?? 0)} onChange={(event) => props.onStyle({ radius: Number(event.target.value) })} aria-label={t("slides.cornerRadius")} className="h-8 w-[4.5rem] text-xs" containerClassName="shrink-0">
							{RADII.map((radius) => <option key={radius} value={String(radius)}>⌜ {radius}</option>)}
						</Select>
					)}
					<Select value={String(Math.round((style.opacity ?? 1) * 100))} onChange={(event) => props.onStyle({ opacity: Number(event.target.value) / 100 })} aria-label={t("slides.opacity")} className="h-8 w-[4.75rem] text-xs" containerClassName="shrink-0">
						{OPACITIES.map((opacity) => <option key={opacity} value={String(opacity)}>{opacity}%</option>)}
					</Select>
					{hasText && (
						<>
							<Divider />
							<Select value={FONT_FAMILIES.some((font) => font.value === (style.fontFamily ?? props.themeFont)) ? style.fontFamily ?? props.themeFont : ""} onChange={(event) => { if (event.target.value) props.onStyle({ fontFamily: event.target.value }); }} aria-label={t("slides.fontFamily")} className="h-8 w-[7.5rem] text-xs" containerClassName="shrink-0">
								{!FONT_FAMILIES.some((font) => font.value === (style.fontFamily ?? props.themeFont)) && <option value="">{t("slides.fontFamily")}</option>}
								{FONT_FAMILIES.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
							</Select>
							<Select value={String(style.fontSize ?? 20)} onChange={(event) => props.onStyle({ fontSize: Number(event.target.value) })} aria-label={t("slides.fontSize")} className="h-8 w-[4.25rem] text-xs" containerClassName="shrink-0">
								{[...new Set([...FONT_SIZES, style.fontSize ?? 20])].sort((a, b) => a - b).map((size) => <option key={size} value={String(size)}>{size}</option>)}
							</Select>
							<ToolButton label={t("slides.bold")} active={editing ? undefined : !!style.bold} onClick={() => (editing ? props.onExec("bold") : props.onStyle({ bold: !style.bold }))}><Bold size={16} /></ToolButton>
							<ToolButton label={t("slides.italic")} active={editing ? undefined : !!style.italic} onClick={() => (editing ? props.onExec("italic") : props.onStyle({ italic: !style.italic }))}><Italic size={16} /></ToolButton>
							<ToolButton label={t("slides.underline")} active={editing ? undefined : !!style.underline} onClick={() => (editing ? props.onExec("underline") : props.onStyle({ underline: !style.underline }))}><Underline size={16} /></ToolButton>
							<ColorButton label={t("slides.textColor")} value={hex(style.color, "#202124")} onChange={(color) => (editing ? props.onExec("foreColor", color) : props.onStyle({ color }, "color"))}><TextColorIcon size={15} /></ColorButton>
							<ToolButton label={t("slides.bullets")} disabled={!editing} onClick={() => props.onExec("insertUnorderedList")}><List size={16} /></ToolButton>
							<ToolButton label={t("slides.alignLeft")} active={(style.align ?? "left") === "left"} onClick={() => props.onStyle({ align: "left" })}><AlignLeftIcon size={16} /></ToolButton>
							<ToolButton label={t("slides.alignCenter")} active={style.align === "center"} onClick={() => props.onStyle({ align: "center" })}><AlignCenterIcon size={16} /></ToolButton>
							<ToolButton label={t("slides.alignRight")} active={style.align === "right"} onClick={() => props.onStyle({ align: "right" })}><AlignRightIcon size={16} /></ToolButton>
							<ToolButton label={t("slides.alignTop")} active={(style.verticalAlign ?? "top") === "top"} onClick={() => props.onStyle({ verticalAlign: "top" })}><VAlignTopIcon size={16} /></ToolButton>
							<ToolButton label={t("slides.alignMiddle")} active={style.verticalAlign === "middle"} onClick={() => props.onStyle({ verticalAlign: "middle" })}><VAlignMiddleIcon size={16} /></ToolButton>
							<ToolButton label={t("slides.alignBottom")} active={style.verticalAlign === "bottom"} onClick={() => props.onStyle({ verticalAlign: "bottom" })}><VAlignBottomIcon size={16} /></ToolButton>
						</>
					)}
					<Divider />
					<Menu label={t("slides.arrange")} trigger={<ArrangeIcon size={16} />}>
						<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onArrange("front")}>{t("slides.bringToFront")}</DropdownMenu.Item>
						<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onArrange("forward")}>{t("slides.bringForward")}</DropdownMenu.Item>
						<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onArrange("backward")}>{t("slides.sendBackward")}</DropdownMenu.Item>
						<DropdownMenu.Item className={menuItemClass} onSelect={() => props.onArrange("back")}>{t("slides.sendToBack")}</DropdownMenu.Item>
						<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
						<DropdownMenu.Label className="px-3 py-1 text-xs text-neutral-500">{t("slides.alignToSlide")}</DropdownMenu.Label>
						{(["left", "center", "right", "top", "middle", "bottom"] as AlignMode[]).map((mode) => (
							<DropdownMenu.Item key={mode} className={menuItemClass} onSelect={() => props.onAlign(mode)}>{t(`slides.alignSlide.${mode}` as TranslationKey)}</DropdownMenu.Item>
						))}
					</Menu>
					<ToolButton label={t("slides.duplicate")} onClick={props.onDuplicate}><Copy size={16} /></ToolButton>
					<ToolButton label={t("slides.delete")} onClick={props.onDelete}><Trash2 size={16} /></ToolButton>
				</>
			) : (
				props.hasSlide && <>
					<ColorButton label={t("slides.background")} value={hex(props.background, "#ffffff")} onChange={(color) => props.onBackground(color, "background")}><BackgroundIcon size={15} /></ColorButton>
					<ToolButton label={t("slides.resetBackground")} onClick={() => props.onBackground(undefined)}><span className="text-xs">{t("slides.reset")}</span></ToolButton>
					<Menu label={t("slides.applyLayout")} trigger={<><LayoutIcon size={16} /><span className="max-sm:hidden">{t("slides.layoutLabel")}</span></>}>
						{SLIDE_LAYOUTS.map((layout) => <DropdownMenu.Item key={layout} className={menuItemClass} onSelect={() => props.onApplyLayout(layout)}>{t(LAYOUT_LABELS[layout])}</DropdownMenu.Item>)}
					</Menu>
					<Menu label={t("slides.themeLabel")} trigger={<><Palette size={16} /><span className="max-sm:hidden">{t("slides.themeLabel")}</span></>}>
						{(Object.keys(SLIDE_THEMES) as SlideThemeId[]).map((id) => (
							<DropdownMenu.Item key={id} className={menuItemClass} onSelect={() => props.onTheme(id)}>
								<span aria-hidden="true" className="flex h-6 w-10 items-center justify-center rounded border border-neutral-200 text-[10px] font-bold" style={{ background: SLIDE_THEMES[id].background, color: SLIDE_THEMES[id].color }}>Aa</span>
								<span className="flex-1">{t(THEME_LABELS[id])}</span>
								{props.themeId === id && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-blue-600" />}
							</DropdownMenu.Item>
						))}
					</Menu>
				</>
			)}
			<span className="w-3 shrink-0" />
			{present}
		</div>
	);
}
