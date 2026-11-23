"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Bold, CheckSquare2, ChevronDown, Columns2, Italic, Link2, Minus, Palette, Plus, Printer, RemoveFormatting, RotateCw, Strikethrough, Underline, Undo2 } from "@/components/icons";
import type { LucideIcon } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import type { CellBorder, CellNumberFormat, CellStyle } from "@/lib/office/types";
import type { BorderKind } from "@/lib/office/sheets/borders";
import { Tooltip } from "@/components/ui/tooltip";
import type { SheetAction, SheetViewState, WrapMode } from "./sheets-editor-types";
import { DEFAULT_FONT_PT, FONT_FAMILIES, FONT_SIZES, MENU_FUNCTIONS, ZOOM_LEVELS } from "./sheets-editor-utils";
import {
	AlignCenterIcon, AlignLeftIcon, AlignRightIcon, BorderAllIcon, BorderBottomIcon, BorderHorizontalIcon, BorderInnerIcon, BorderLeftIcon, BorderNoneIcon, BorderOuterIcon,
	BorderRightIcon, BorderTopIcon, BorderVerticalIcon, FilterIcon, MergeIcon, SigmaIcon, VAlignBottomIcon, VAlignMiddleIcon, VAlignTopIcon, WrapClipIcon, WrapOverflowIcon, WrapTextIcon,
} from "./sheets-icons";

const SWATCHES = [
	"#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#ffffff",
	"#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8",
	"#0000ff", "#9900ff", "#ff00ff", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3",
	"#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc", "#e06666", "#93c47d",
];

const buttonClass = "flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent data-[state=open]:bg-neutral-100";
const menuClass = "z-[200] max-h-[calc(100vh-8rem)] min-w-48 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl";
const itemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[state=checked]:font-semibold";
const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

function ToolButton({ label, active, disabled, onClick, children, className }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
	return (
		<Tooltip label={label}>
			<button type="button" aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={keepFocus} onClick={onClick} className={clsx(buttonClass, active && "bg-blue-100 text-blue-800 hover:bg-blue-100", className)}>
				{children}
			</button>
		</Tooltip>
	);
}

function Divider() {
	return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-neutral-200" />;
}

/** A toolbar button that opens a menu. */
function MenuButton({ label, trigger, children, className, contentClassName }: { label: string; trigger: ReactNode; children: ReactNode; className?: string; contentClassName?: string }) {
	return (
		<DropdownMenu.Root modal={false}>
			<Tooltip label={label}>
				<DropdownMenu.Trigger asChild>
					<button type="button" aria-label={label} onMouseDown={keepFocus} className={clsx(buttonClass, className)}>
						{trigger}
					</button>
				</DropdownMenu.Trigger>
			</Tooltip>
			<DropdownMenu.Portal>
				<DropdownMenu.Content align="start" sideOffset={4} className={clsx(menuClass, contentClassName)} onCloseAutoFocus={keepFocus}>
					{children}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

function Swatches({ current, onPick }: { current: string | undefined; onPick: (value: string) => void }) {
	return (
		<div className="grid grid-cols-7 gap-1 p-2">
			{SWATCHES.map((swatch) => (
				<DropdownMenu.Item key={swatch} asChild onSelect={() => onPick(swatch)}>
					<button type="button" aria-label={swatch} className={clsx("h-6 w-6 cursor-pointer rounded-full border border-neutral-300 outline-none data-[highlighted]:ring-2 data-[highlighted]:ring-blue-500", current === swatch && "ring-2 ring-blue-600")} style={{ background: swatch }} />
				</DropdownMenu.Item>
			))}
		</div>
	);
}

function ColorMenu({ label, current, icon, onPick }: { label: string; current: string | undefined; icon: ReactNode; onPick: (value: string | undefined) => void }) {
	const { t } = useLanguage();
	return (
		<MenuButton
			label={label}
			contentClassName="w-56"
			trigger={(
				<>
					<span className="flex flex-col items-center leading-none">
						{icon}
						<span aria-hidden="true" className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300" style={{ background: current ?? "transparent" }} />
					</span>
					<ChevronDown size={12} />
				</>
			)}
		>
			<DropdownMenu.Item className={itemClass} onSelect={() => onPick(undefined)}>{t("sheets.colorReset")}</DropdownMenu.Item>
			<Swatches current={current} onPick={onPick} />
			<label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
				<input type="color" value={current ?? "#000000"} onChange={(event) => onPick(event.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
				{t("sheets.colorCustom")}
			</label>
		</MenuButton>
	);
}

function BordersMenu({ onAction }: { onAction: (action: SheetAction) => void }) {
	const { t } = useLanguage();
	const [color, setColor] = useState("#000000");
	const [lineStyle, setLineStyle] = useState<NonNullable<CellBorder["style"]>>("solid");
	const kinds: { kind: BorderKind; label: string; Icon: LucideIcon }[] = [
		{ kind: "all", label: t("sheets.borderAll"), Icon: BorderAllIcon },
		{ kind: "inner", label: t("sheets.borderInner"), Icon: BorderInnerIcon },
		{ kind: "horizontal", label: t("sheets.borderHorizontal"), Icon: BorderHorizontalIcon },
		{ kind: "vertical", label: t("sheets.borderVertical"), Icon: BorderVerticalIcon },
		{ kind: "outer", label: t("sheets.borderOuter"), Icon: BorderOuterIcon },
		{ kind: "left", label: t("sheets.borderLeft"), Icon: BorderLeftIcon },
		{ kind: "top", label: t("sheets.borderTop"), Icon: BorderTopIcon },
		{ kind: "right", label: t("sheets.borderRight"), Icon: BorderRightIcon },
		{ kind: "bottom", label: t("sheets.borderBottom"), Icon: BorderBottomIcon },
		{ kind: "none", label: t("sheets.borderNone"), Icon: BorderNoneIcon },
	];
	const styles: { value: NonNullable<CellBorder["style"]>; label: string }[] = [
		{ value: "solid", label: t("sheets.borderSolid") },
		{ value: "thick", label: t("sheets.borderThick") },
		{ value: "dashed", label: t("sheets.borderDashed") },
		{ value: "dotted", label: t("sheets.borderDotted") },
	];
	return (
		<MenuButton label={t("sheets.borders")} contentClassName="w-64" trigger={<><BorderAllIcon size={16} /><ChevronDown size={12} /></>}>
			<div className="grid grid-cols-5 gap-1 p-1">
				{kinds.map(({ kind, label, Icon }) => (
					<DropdownMenu.Item key={kind} asChild onSelect={() => onAction({ type: "borders", kind, color, style: lineStyle })}>
						<button type="button" aria-label={label} title={label} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-neutral-700 outline-none data-[highlighted]:bg-neutral-100">
							<Icon size={18} />
						</button>
					</DropdownMenu.Item>
				))}
			</div>
			<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
			<DropdownMenu.Label className="px-3 py-1 text-xs font-medium text-neutral-500">{t("sheets.borderColor")}</DropdownMenu.Label>
			<div onKeyDown={(event) => event.stopPropagation()}>
				<div className="grid grid-cols-7 gap-1 px-2 pb-1">
					{SWATCHES.slice(0, 14).map((swatch) => (
						<button key={swatch} type="button" aria-label={swatch} onClick={() => setColor(swatch)} className={clsx("h-6 w-6 cursor-pointer rounded-full border border-neutral-300", color === swatch && "ring-2 ring-blue-600")} style={{ background: swatch }} />
					))}
				</div>
			</div>
			<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
			<DropdownMenu.Label className="px-3 py-1 text-xs font-medium text-neutral-500">{t("sheets.borderStyle")}</DropdownMenu.Label>
			<DropdownMenu.RadioGroup value={lineStyle} onValueChange={(value) => setLineStyle(value as NonNullable<CellBorder["style"]>)}>
				{styles.map((entry) => (
					<DropdownMenu.RadioItem key={entry.value} value={entry.value} className={itemClass} onSelect={(event) => event.preventDefault()}>
						<span aria-hidden="true" className="w-10" style={{ borderTop: `${entry.value === "thick" ? 3 : 1}px ${entry.value === "thick" ? "solid" : entry.value} #3c4043` }} />
						{entry.label}
					</DropdownMenu.RadioItem>
				))}
			</DropdownMenu.RadioGroup>
		</MenuButton>
	);
}

function FontSizeControl({ size, onChange }: { size: number; onChange: (size: number) => void }) {
	const { t } = useLanguage();
	const [draft, setDraft] = useState<string | null>(null);
	const step = (direction: 1 | -1) => {
		const next = direction > 0 ? FONT_SIZES.find((entry) => entry > size) ?? Math.min(400, size + 2) : [...FONT_SIZES].reverse().find((entry) => entry < size) ?? Math.max(1, size - 1);
		onChange(next);
	};
	const commit = () => {
		if (draft === null) return;
		const value = Math.round(Number(draft));
		setDraft(null);
		if (Number.isFinite(value) && value >= 1 && value <= 400 && value !== size) onChange(value);
	};
	return (
		<div className="flex shrink-0 items-center">
			<ToolButton label={t("sheets.fontSizeDecrease")} onClick={() => step(-1)}><Minus size={14} /></ToolButton>
			<input
				value={draft ?? String(size)}
				inputMode="numeric"
				aria-label={t("sheets.fontSize")}
				onFocus={(event) => { setDraft(String(size)); event.currentTarget.select(); }}
				onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") { event.preventDefault(); commit(); event.currentTarget.blur(); }
					if (event.key === "Escape") { setDraft(null); event.currentTarget.blur(); }
				}}
				className="h-7 w-9 rounded border border-neutral-300 text-center text-sm text-neutral-800 outline-none focus:border-blue-500"
			/>
			<ToolButton label={t("sheets.fontSizeIncrease")} onClick={() => step(1)}><Plus size={14} /></ToolButton>
		</div>
	);
}

export function SheetsToolbar({ style, view, currencySymbol, onAction }: {
	style: CellStyle;
	view: SheetViewState;
	currencySymbol: string;
	onAction: (action: SheetAction) => void;
}) {
	const { t } = useLanguage();
	const format = style.format ?? "general";
	const formats: { value: CellNumberFormat; label: string; example: string }[] = [
		{ value: "general", label: t("sheets.formatGeneral"), example: "" },
		{ value: "text", label: t("sheets.formatText"), example: "" },
		{ value: "number", label: t("sheets.formatNumber"), example: "1,000.12" },
		{ value: "percent", label: t("sheets.formatPercent"), example: "10.12%" },
		{ value: "currency", label: t("sheets.formatCurrency"), example: `${currencySymbol}1,000.12` },
		{ value: "date", label: t("sheets.formatDate"), example: "2026-09-26" },
		{ value: "time", label: t("sheets.formatTime"), example: "15:59:00" },
	];
	const align = style.align ?? "left";
	const aligns: { value: "left" | "center" | "right"; label: string; Icon: LucideIcon }[] = [
		{ value: "left", label: t("sheets.alignLeft"), Icon: AlignLeftIcon },
		{ value: "center", label: t("sheets.alignCenter"), Icon: AlignCenterIcon },
		{ value: "right", label: t("sheets.alignRight"), Icon: AlignRightIcon },
	];
	const valign = style.valign ?? "middle";
	const valigns: { value: "top" | "middle" | "bottom"; label: string; Icon: LucideIcon }[] = [
		{ value: "top", label: t("sheets.valignTop"), Icon: VAlignTopIcon },
		{ value: "middle", label: t("sheets.valignMiddle"), Icon: VAlignMiddleIcon },
		{ value: "bottom", label: t("sheets.valignBottom"), Icon: VAlignBottomIcon },
	];
	const wrapMode: WrapMode = style.wrap ? "wrap" : style.clip ? "clip" : "overflow";
	const wraps: { value: WrapMode; label: string; Icon: LucideIcon }[] = [
		{ value: "overflow", label: t("sheets.wrapOverflow"), Icon: WrapOverflowIcon },
		{ value: "wrap", label: t("sheets.wrapWrap"), Icon: WrapTextIcon },
		{ value: "clip", label: t("sheets.wrapClip"), Icon: WrapClipIcon },
	];
	const AlignIcon = aligns.find((entry) => entry.value === align)?.Icon ?? AlignLeftIcon;
	const VAlignIcon = valigns.find((entry) => entry.value === valign)?.Icon ?? VAlignMiddleIcon;
	const WrapIcon = wraps.find((entry) => entry.value === wrapMode)?.Icon ?? WrapOverflowIcon;
	const fontLabel = FONT_FAMILIES.find((entry) => entry.value === style.fontFamily)?.label ?? style.fontFamily ?? "Arial";

	return (
		<div role="toolbar" aria-label={t("sheets.toolbar")} className="flex min-h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-neutral-200 bg-white px-2 py-1 [scrollbar-width:thin]">
			<ToolButton label={t("sheets.undo")} disabled={!view.canUndo} onClick={() => onAction({ type: "undo" })}><Undo2 size={16} /></ToolButton>
			<ToolButton label={t("sheets.redo")} disabled={!view.canRedo} onClick={() => onAction({ type: "redo" })}><RotateCw size={16} /></ToolButton>
			<ToolButton label={t("office.print")} onClick={() => onAction({ type: "print" })}><Printer size={16} /></ToolButton>
			<MenuButton label={t("sheets.zoom")} className="min-w-16 justify-between px-2" trigger={<><span className="text-xs tabular-nums">{Math.round(view.zoom * 100)}%</span><ChevronDown size={12} /></>}>
				<DropdownMenu.RadioGroup value={String(view.zoom)} onValueChange={(value) => onAction({ type: "zoom", value: Number(value) })}>
					{ZOOM_LEVELS.map((level) => <DropdownMenu.RadioItem key={level} value={String(level)} className={itemClass}>{Math.round(level * 100)}%</DropdownMenu.RadioItem>)}
				</DropdownMenu.RadioGroup>
			</MenuButton>
			<Divider />
			<ToolButton label={t("sheets.formatAsCurrency")} active={format === "currency"} onClick={() => onAction({ type: "format", format: format === "currency" ? "general" : "currency" })}><span className="text-sm font-semibold">{currencySymbol}</span></ToolButton>
			<ToolButton label={t("sheets.formatAsPercent")} active={format === "percent"} onClick={() => onAction({ type: "format", format: format === "percent" ? "general" : "percent" })}><span className="text-sm font-semibold">%</span></ToolButton>
			<ToolButton label={t("sheets.decimalsLess")} onClick={() => onAction({ type: "decimals", delta: -1 })}><span className="text-xs font-semibold">.0←</span></ToolButton>
			<ToolButton label={t("sheets.decimalsMore")} onClick={() => onAction({ type: "decimals", delta: 1 })}><span className="text-xs font-semibold">.00→</span></ToolButton>
			<MenuButton label={t("sheets.numberFormat")} contentClassName="w-64" trigger={<><span className="text-xs font-semibold">123</span><ChevronDown size={12} /></>}>
				<DropdownMenu.RadioGroup value={format} onValueChange={(value) => onAction({ type: "format", format: value as CellNumberFormat })}>
					{formats.map((entry) => (
						<DropdownMenu.RadioItem key={entry.value} value={entry.value} className={clsx(itemClass, "justify-between")}>
							<span>{entry.label}</span>
							{entry.example && <span className="text-xs text-neutral-400">{entry.example}</span>}
						</DropdownMenu.RadioItem>
					))}
				</DropdownMenu.RadioGroup>
			</MenuButton>
			<Divider />
			<MenuButton label={t("sheets.font")} className="w-32 justify-between px-2" trigger={<><span className="truncate" style={{ fontFamily: style.fontFamily }}>{fontLabel}</span><ChevronDown size={12} /></>}>
				<DropdownMenu.RadioGroup value={style.fontFamily ?? ""} onValueChange={(value) => onAction({ type: "fontFamily", value: value || undefined })}>
					{FONT_FAMILIES.map((entry) => <DropdownMenu.RadioItem key={entry.label} value={entry.value ?? ""} className={itemClass} style={{ fontFamily: entry.value ?? "Arial" }}>{entry.label}</DropdownMenu.RadioItem>)}
				</DropdownMenu.RadioGroup>
			</MenuButton>
			<Divider />
			<FontSizeControl size={style.fontSize ?? DEFAULT_FONT_PT} onChange={(value) => onAction({ type: "fontSize", value })} />
			<Divider />
			<ToolButton label={t("sheets.bold")} active={!!style.bold} onClick={() => onAction({ type: "toggle", key: "bold" })}><Bold size={16} /></ToolButton>
			<ToolButton label={t("sheets.italic")} active={!!style.italic} onClick={() => onAction({ type: "toggle", key: "italic" })}><Italic size={16} /></ToolButton>
			<ToolButton label={t("sheets.strikethrough")} active={!!style.strike} onClick={() => onAction({ type: "toggle", key: "strike" })}><Strikethrough size={16} /></ToolButton>
			<ToolButton label={t("sheets.underline")} active={!!style.underline} onClick={() => onAction({ type: "toggle", key: "underline" })}><Underline size={16} /></ToolButton>
			<ColorMenu label={t("sheets.textColor")} current={style.color} icon={<span className="text-sm font-semibold leading-none">A</span>} onPick={(value) => onAction({ type: "color", key: "color", value })} />
			<Divider />
			<ColorMenu label={t("sheets.fillColor")} current={style.fill} icon={<Palette size={14} />} onPick={(value) => onAction({ type: "color", key: "fill", value })} />
			<BordersMenu onAction={onAction} />
			<div className="flex shrink-0 items-center">
				<ToolButton label={view.merged ? t("sheets.unmerge") : t("sheets.mergeAll")} active={view.merged} onClick={() => onAction(view.merged ? { type: "unmerge" } : { type: "merge", mode: "all" })} className="rounded-r-none pr-0.5"><MergeIcon size={16} /></ToolButton>
				<MenuButton label={t("sheets.merge")} className="min-w-5 rounded-l-none px-0.5" trigger={<ChevronDown size={12} />}>
					<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "merge", mode: "all" })}>{t("sheets.mergeAll")}</DropdownMenu.Item>
					<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "merge", mode: "vertical" })}>{t("sheets.mergeVertical")}</DropdownMenu.Item>
					<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "merge", mode: "horizontal" })}>{t("sheets.mergeHorizontal")}</DropdownMenu.Item>
					<DropdownMenu.Item className={itemClass} disabled={!view.merged} onSelect={() => onAction({ type: "unmerge" })}>{t("sheets.unmerge")}</DropdownMenu.Item>
				</MenuButton>
			</div>
			<Divider />
			<MenuButton label={t("sheets.align")} trigger={<><AlignIcon size={16} /><ChevronDown size={12} /></>} contentClassName="min-w-0">
				<div className="flex gap-1">
					{aligns.map(({ value, label, Icon }) => (
						<DropdownMenu.Item key={value} asChild onSelect={() => onAction({ type: "align", value })}>
							<button type="button" aria-label={label} title={label} className={clsx("flex h-9 w-9 cursor-pointer items-center justify-center rounded-md outline-none data-[highlighted]:bg-neutral-100", value === align && "bg-blue-100 text-blue-800")}><Icon size={18} /></button>
						</DropdownMenu.Item>
					))}
				</div>
			</MenuButton>
			<MenuButton label={t("sheets.valign")} trigger={<><VAlignIcon size={16} /><ChevronDown size={12} /></>} contentClassName="min-w-0">
				<div className="flex gap-1">
					{valigns.map(({ value, label, Icon }) => (
						<DropdownMenu.Item key={value} asChild onSelect={() => onAction({ type: "valign", value })}>
							<button type="button" aria-label={label} title={label} className={clsx("flex h-9 w-9 cursor-pointer items-center justify-center rounded-md outline-none data-[highlighted]:bg-neutral-100", value === valign && "bg-blue-100 text-blue-800")}><Icon size={18} /></button>
						</DropdownMenu.Item>
					))}
				</div>
			</MenuButton>
			<MenuButton label={t("sheets.wrapping")} trigger={<><WrapIcon size={16} /><ChevronDown size={12} /></>} contentClassName="min-w-0">
				<div className="flex gap-1">
					{wraps.map(({ value, label, Icon }) => (
						<DropdownMenu.Item key={value} asChild onSelect={() => onAction({ type: "wrap", value })}>
							<button type="button" aria-label={label} title={label} className={clsx("flex h-9 w-9 cursor-pointer items-center justify-center rounded-md outline-none data-[highlighted]:bg-neutral-100", value === wrapMode && "bg-blue-100 text-blue-800")}><Icon size={18} /></button>
						</DropdownMenu.Item>
					))}
				</div>
			</MenuButton>
			<Divider />
			<ToolButton label={t("sheets.insertLink")} onClick={() => onAction({ type: "link" })}><Link2 size={16} /></ToolButton>
			<ToolButton label={t("sheets.checkbox")} active={!!style.checkbox} onClick={() => onAction({ type: "checkbox" })}><CheckSquare2 size={16} /></ToolButton>
			<ToolButton label={view.filterOn ? t("sheets.removeFilter") : t("sheets.createFilter")} active={view.filterOn} onClick={() => onAction({ type: "filter" })}><FilterIcon size={16} /></ToolButton>
			<MenuButton label={t("sheets.functions")} trigger={<><SigmaIcon size={16} /><ChevronDown size={12} /></>}>
				{MENU_FUNCTIONS.map((name) => <DropdownMenu.Item key={name} className={clsx(itemClass, "font-mono text-xs")} onSelect={() => onAction({ type: "insertFunction", name })}>{name}</DropdownMenu.Item>)}
			</MenuButton>
			<ToolButton label={t("sheets.clearFormatting")} onClick={() => onAction({ type: "clearFormat" })}><RemoveFormatting size={16} /></ToolButton>
			<Divider />
			<MenuButton label={t("sheets.rowsAndColumns")} className="px-2" trigger={<>{t("sheets.rowsAndColumns")}<ChevronDown size={12} /></>}>
				<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "insert", axis: "row", after: false })}>{t("sheets.insertRowAbove")}</DropdownMenu.Item>
				<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "insert", axis: "row", after: true })}>{t("sheets.insertRowBelow")}</DropdownMenu.Item>
				<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "insert", axis: "col", after: false })}>{t("sheets.insertColumnLeft")}</DropdownMenu.Item>
				<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "insert", axis: "col", after: true })}>{t("sheets.insertColumnRight")}</DropdownMenu.Item>
				<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
				<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "delete", axis: "row" })}>{t("sheets.deleteRows")}</DropdownMenu.Item>
				<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "delete", axis: "col" })}>{t("sheets.deleteColumns")}</DropdownMenu.Item>
			</MenuButton>
			<MenuButton label={t("sheets.freeze")} className="px-2" trigger={<><Columns2 size={16} />{t("sheets.freeze")}<ChevronDown size={12} /></>}>
				<DropdownMenu.Label className="px-3 py-1 text-xs font-medium text-neutral-500">{t("sheets.freezeRows")}</DropdownMenu.Label>
				<DropdownMenu.RadioGroup value={String(view.frozenRows)} onValueChange={(value) => onAction({ type: "freeze", rows: Number(value) })}>
					<DropdownMenu.RadioItem value="0" className={itemClass}>{t("sheets.freezeNone")}</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="1" className={itemClass}>{t("sheets.freezeOneRow")}</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="2" className={itemClass}>{t("sheets.freezeTwoRows")}</DropdownMenu.RadioItem>
				</DropdownMenu.RadioGroup>
				<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
				<DropdownMenu.Label className="px-3 py-1 text-xs font-medium text-neutral-500">{t("sheets.freezeColumns")}</DropdownMenu.Label>
				<DropdownMenu.RadioGroup value={String(view.frozenCols)} onValueChange={(value) => onAction({ type: "freeze", cols: Number(value) })}>
					<DropdownMenu.RadioItem value="0" className={itemClass}>{t("sheets.freezeNone")}</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="1" className={itemClass}>{t("sheets.freezeOneColumn")}</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="2" className={itemClass}>{t("sheets.freezeTwoColumns")}</DropdownMenu.RadioItem>
				</DropdownMenu.RadioGroup>
			</MenuButton>
			<ToolButton label={t("sheets.sortAscending")} onClick={() => onAction({ type: "sort", ascending: true, scope: "range" })}><ArrowDown size={14} /><span className="text-xs font-semibold">A→Z</span></ToolButton>
			<ToolButton label={t("sheets.sortDescending")} onClick={() => onAction({ type: "sort", ascending: false, scope: "range" })}><ArrowUp size={14} /><span className="text-xs font-semibold">Z→A</span></ToolButton>
		</div>
	);
}
