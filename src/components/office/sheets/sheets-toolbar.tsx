"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import type { ReactNode } from "react";
import { AlignLeft, ArrowDown, ArrowUp, Bold, ChevronDown, Columns2, Italic, Palette, RemoveFormatting, RotateCw, Strikethrough, TextAlignJustify, Underline, Undo2 } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import type { CellNumberFormat, CellStyle } from "@/lib/office/types";
import type { Axis } from "@/lib/office/sheets/structure";
import { Tooltip } from "@/components/ui/tooltip";

export type ToolbarAction =
	| { type: "undo" }
	| { type: "redo" }
	| { type: "format"; format: CellNumberFormat }
	| { type: "decimals"; delta: number }
	| { type: "toggle"; key: "bold" | "italic" | "underline" | "strike" | "wrap" }
	| { type: "color"; key: "color" | "fill"; value: string | undefined }
	| { type: "align"; value: "left" | "center" | "right" }
	| { type: "freeze"; rows?: number; cols?: number }
	| { type: "insert"; axis: Axis; after: boolean }
	| { type: "delete"; axis: Axis }
	| { type: "sort"; ascending: boolean }
	| { type: "clearFormat" };

const SWATCHES = [
	"#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#ffffff",
	"#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8",
	"#0000ff", "#9900ff", "#ff00ff", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3",
	"#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc", "#e06666", "#93c47d",
];

const buttonClass = "flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent";
const menuClass = "z-[200] min-w-48 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl";
const itemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100";

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
	return (
		<Tooltip label={label}>
			<button type="button" aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className={clsx(buttonClass, active && "bg-blue-100 text-blue-800 hover:bg-blue-100")}>
				{children}
			</button>
		</Tooltip>
	);
}

function Divider() {
	return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-neutral-200" />;
}

function ColorMenu({ label, current, icon, onPick }: { label: string; current: string | undefined; icon: ReactNode; onPick: (value: string | undefined) => void }) {
	const { t } = useLanguage();
	return (
		<DropdownMenu.Root>
			<Tooltip label={label}>
				<DropdownMenu.Trigger asChild>
					<button type="button" aria-label={label} className={buttonClass} onMouseDown={(event) => event.stopPropagation()}>
						<span className="flex flex-col items-center leading-none">
							{icon}
							<span aria-hidden="true" className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300" style={{ background: current ?? "transparent" }} />
						</span>
						<ChevronDown size={12} />
					</button>
				</DropdownMenu.Trigger>
			</Tooltip>
			<DropdownMenu.Portal>
				<DropdownMenu.Content align="start" sideOffset={4} className={clsx(menuClass, "w-56")} onCloseAutoFocus={(event) => event.preventDefault()}>
					<DropdownMenu.Item className={itemClass} onSelect={() => onPick(undefined)}>{t("sheets.colorReset")}</DropdownMenu.Item>
					<div className="grid grid-cols-7 gap-1 p-2">
						{SWATCHES.map((swatch) => (
							<DropdownMenu.Item key={swatch} asChild onSelect={() => onPick(swatch)}>
								<button type="button" aria-label={swatch} className="h-6 w-6 cursor-pointer rounded-full border border-neutral-300 outline-none data-[highlighted]:ring-2 data-[highlighted]:ring-blue-500" style={{ background: swatch }} />
							</DropdownMenu.Item>
						))}
					</div>
					<label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
						<input type="color" value={current ?? "#000000"} onChange={(event) => onPick(event.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
						{t("sheets.colorCustom")}
					</label>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

export function SheetsToolbar({ style, canUndo, canRedo, frozenRows, frozenCols, onAction }: {
	style: CellStyle;
	canUndo: boolean;
	canRedo: boolean;
	frozenRows: number;
	frozenCols: number;
	onAction: (action: ToolbarAction) => void;
}) {
	const { t } = useLanguage();
	const format = style.format ?? "general";
	const formats: { value: CellNumberFormat; label: string }[] = [
		{ value: "general", label: t("sheets.formatGeneral") },
		{ value: "number", label: t("sheets.formatNumber") },
		{ value: "percent", label: t("sheets.formatPercent") },
		{ value: "currency", label: t("sheets.formatCurrency") },
		{ value: "date", label: t("sheets.formatDate") },
		{ value: "text", label: t("sheets.formatText") },
	];
	const align = style.align ?? "left";
	const aligns: { value: "left" | "center" | "right"; label: string }[] = [
		{ value: "left", label: t("sheets.alignLeft") },
		{ value: "center", label: t("sheets.alignCenter") },
		{ value: "right", label: t("sheets.alignRight") },
	];

	return (
		<div role="toolbar" aria-label={t("sheets.toolbar")} className="flex min-h-11 shrink-0 flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-white px-2 py-1">
			<ToolButton label={t("sheets.undo")} disabled={!canUndo} onClick={() => onAction({ type: "undo" })}><Undo2 size={16} /></ToolButton>
			<ToolButton label={t("sheets.redo")} disabled={!canRedo} onClick={() => onAction({ type: "redo" })}><RotateCw size={16} /></ToolButton>
			<Divider />
			<DropdownMenu.Root>
				<Tooltip label={t("sheets.numberFormat")}>
					<DropdownMenu.Trigger asChild>
						<button type="button" aria-label={t("sheets.numberFormat")} className={clsx(buttonClass, "min-w-24 justify-between px-2")}>
							<span className="truncate">{formats.find((entry) => entry.value === format)?.label}</span>
							<ChevronDown size={12} />
						</button>
					</DropdownMenu.Trigger>
				</Tooltip>
				<DropdownMenu.Portal>
					<DropdownMenu.Content align="start" sideOffset={4} className={menuClass} onCloseAutoFocus={(event) => event.preventDefault()}>
						<DropdownMenu.RadioGroup value={format} onValueChange={(value) => onAction({ type: "format", format: value as CellNumberFormat })}>
							{formats.map((entry) => <DropdownMenu.RadioItem key={entry.value} value={entry.value} className={clsx(itemClass, "data-[state=checked]:font-semibold")}>{entry.label}</DropdownMenu.RadioItem>)}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<ToolButton label={t("sheets.decimalsLess")} onClick={() => onAction({ type: "decimals", delta: -1 })}><span className="text-xs font-semibold">.0←</span></ToolButton>
			<ToolButton label={t("sheets.decimalsMore")} onClick={() => onAction({ type: "decimals", delta: 1 })}><span className="text-xs font-semibold">.00→</span></ToolButton>
			<Divider />
			<ToolButton label={t("sheets.bold")} active={!!style.bold} onClick={() => onAction({ type: "toggle", key: "bold" })}><Bold size={16} /></ToolButton>
			<ToolButton label={t("sheets.italic")} active={!!style.italic} onClick={() => onAction({ type: "toggle", key: "italic" })}><Italic size={16} /></ToolButton>
			<ToolButton label={t("sheets.underline")} active={!!style.underline} onClick={() => onAction({ type: "toggle", key: "underline" })}><Underline size={16} /></ToolButton>
			<ToolButton label={t("sheets.strikethrough")} active={!!style.strike} onClick={() => onAction({ type: "toggle", key: "strike" })}><Strikethrough size={16} /></ToolButton>
			<ColorMenu label={t("sheets.textColor")} current={style.color} icon={<span className="text-sm font-semibold leading-none">A</span>} onPick={(value) => onAction({ type: "color", key: "color", value })} />
			<ColorMenu label={t("sheets.fillColor")} current={style.fill} icon={<Palette size={14} />} onPick={(value) => onAction({ type: "color", key: "fill", value })} />
			<Divider />
			<DropdownMenu.Root>
				<Tooltip label={t("sheets.align")}>
					<DropdownMenu.Trigger asChild>
						<button type="button" aria-label={t("sheets.align")} className={buttonClass}>
							<AlignLeft size={16} style={{ transform: align === "right" ? "scaleX(-1)" : undefined }} />
							<ChevronDown size={12} />
						</button>
					</DropdownMenu.Trigger>
				</Tooltip>
				<DropdownMenu.Portal>
					<DropdownMenu.Content align="start" sideOffset={4} className={menuClass} onCloseAutoFocus={(event) => event.preventDefault()}>
						<DropdownMenu.RadioGroup value={align} onValueChange={(value) => onAction({ type: "align", value: value as "left" | "center" | "right" })}>
							{aligns.map((entry) => <DropdownMenu.RadioItem key={entry.value} value={entry.value} className={clsx(itemClass, "data-[state=checked]:font-semibold")}>{entry.label}</DropdownMenu.RadioItem>)}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<ToolButton label={t("sheets.wrap")} active={!!style.wrap} onClick={() => onAction({ type: "toggle", key: "wrap" })}><TextAlignJustify size={16} /></ToolButton>
			<ToolButton label={t("sheets.clearFormatting")} onClick={() => onAction({ type: "clearFormat" })}><RemoveFormatting size={16} /></ToolButton>
			<Divider />
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild>
					<button type="button" className={clsx(buttonClass, "px-2")}>{t("sheets.rowsAndColumns")}<ChevronDown size={12} /></button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content align="start" sideOffset={4} className={menuClass} onCloseAutoFocus={(event) => event.preventDefault()}>
						<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "insert", axis: "row", after: false })}>{t("sheets.insertRowAbove")}</DropdownMenu.Item>
						<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "insert", axis: "row", after: true })}>{t("sheets.insertRowBelow")}</DropdownMenu.Item>
						<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "insert", axis: "col", after: false })}>{t("sheets.insertColumnLeft")}</DropdownMenu.Item>
						<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "insert", axis: "col", after: true })}>{t("sheets.insertColumnRight")}</DropdownMenu.Item>
						<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
						<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "delete", axis: "row" })}>{t("sheets.deleteRows")}</DropdownMenu.Item>
						<DropdownMenu.Item className={itemClass} onSelect={() => onAction({ type: "delete", axis: "col" })}>{t("sheets.deleteColumns")}</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild>
					<button type="button" className={clsx(buttonClass, "px-2")}><Columns2 size={16} />{t("sheets.freeze")}<ChevronDown size={12} /></button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content align="start" sideOffset={4} className={menuClass} onCloseAutoFocus={(event) => event.preventDefault()}>
						<DropdownMenu.Label className="px-3 py-1 text-xs font-medium text-neutral-500">{t("sheets.freezeRows")}</DropdownMenu.Label>
						<DropdownMenu.RadioGroup value={String(frozenRows)} onValueChange={(value) => onAction({ type: "freeze", rows: Number(value) })}>
							<DropdownMenu.RadioItem value="0" className={clsx(itemClass, "data-[state=checked]:font-semibold")}>{t("sheets.freezeNone")}</DropdownMenu.RadioItem>
							<DropdownMenu.RadioItem value="1" className={clsx(itemClass, "data-[state=checked]:font-semibold")}>{t("sheets.freezeOneRow")}</DropdownMenu.RadioItem>
							<DropdownMenu.RadioItem value="2" className={clsx(itemClass, "data-[state=checked]:font-semibold")}>{t("sheets.freezeTwoRows")}</DropdownMenu.RadioItem>
						</DropdownMenu.RadioGroup>
						<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
						<DropdownMenu.Label className="px-3 py-1 text-xs font-medium text-neutral-500">{t("sheets.freezeColumns")}</DropdownMenu.Label>
						<DropdownMenu.RadioGroup value={String(frozenCols)} onValueChange={(value) => onAction({ type: "freeze", cols: Number(value) })}>
							<DropdownMenu.RadioItem value="0" className={clsx(itemClass, "data-[state=checked]:font-semibold")}>{t("sheets.freezeNone")}</DropdownMenu.RadioItem>
							<DropdownMenu.RadioItem value="1" className={clsx(itemClass, "data-[state=checked]:font-semibold")}>{t("sheets.freezeOneColumn")}</DropdownMenu.RadioItem>
							<DropdownMenu.RadioItem value="2" className={clsx(itemClass, "data-[state=checked]:font-semibold")}>{t("sheets.freezeTwoColumns")}</DropdownMenu.RadioItem>
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<Divider />
			<ToolButton label={t("sheets.sortAscending")} onClick={() => onAction({ type: "sort", ascending: true })}><ArrowDown size={14} /><span className="text-xs font-semibold">A→Z</span></ToolButton>
			<ToolButton label={t("sheets.sortDescending")} onClick={() => onAction({ type: "sort", ascending: false })}><ArrowUp size={14} /><span className="text-xs font-semibold">Z→A</span></ToolButton>
		</div>
	);
}
