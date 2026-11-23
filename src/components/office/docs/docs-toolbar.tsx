"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { Bold, ChevronDown, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Minus, RemoveFormatting, Strikethrough, Underline } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { useDismissible } from "@/components/use-dismissible";
import { AlignCenterGlyph, AlignJustifyGlyph, AlignLeftGlyph, AlignRightGlyph, ColorGlyph, IndentGlyph, OutdentGlyph, PageBreakGlyph, PageSetupGlyph, PrintGlyph, RedoGlyph, TableGlyph, UndoGlyph, UnlinkGlyph } from "./docs-icons";
import type { DocsAction, DocsBlockStyle, DocsToolbarState } from "./docs-types";

export const FONT_FAMILIES: { label: string; value: string }[] = [
	{ label: "Arial", value: "Arial, Helvetica, sans-serif" },
	{ label: "Inter", value: "Inter, Arial, sans-serif" },
	{ label: "Georgia", value: "Georgia, serif" },
	{ label: "Times New Roman", value: "\"Times New Roman\", Times, serif" },
	{ label: "Verdana", value: "Verdana, Geneva, sans-serif" },
	{ label: "Trebuchet MS", value: "\"Trebuchet MS\", sans-serif" },
	{ label: "Courier New", value: "\"Courier New\", Courier, monospace" },
];

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72];

const COLORS = [
	"#000000", "#434343", "#666666", "#999999", "#cccccc", "#ffffff",
	"#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff",
	"#4a86e8", "#0000ff", "#9900ff", "#ff00ff", "#e6b8af", "#f4cccc",
	"#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#d9d2e9",
	"#cc4125", "#e69138", "#6aa84f", "#3c78d8", "#674ea7", "#a61c00",
];

const buttonClass = "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-neutral-700 hover:bg-neutral-200 disabled:opacity-40 disabled:hover:bg-transparent aria-pressed:bg-blue-100 aria-pressed:text-blue-800";
const selectClass = "h-8 shrink-0 rounded-md border-0 bg-transparent px-1.5 text-sm text-neutral-800 hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const divider = <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-neutral-300" />;

/** Keeps the page's selection when a toolbar button is pressed. */
const keepSelection = (event: React.MouseEvent) => event.preventDefault();

function ToolButton({ label, pressed, disabled, onClick, children }: { label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
	return (
		<button type="button" title={label} aria-label={label} aria-pressed={pressed === undefined ? undefined : pressed} disabled={disabled} onMouseDown={keepSelection} onClick={onClick} className={buttonClass}>
			{children}
		</button>
	);
}

function Popover({ label, trigger, children, open, setOpen }: { label: string; trigger: ReactNode; children: ReactNode; open: boolean; setOpen: (open: boolean) => void }) {
	const ref = useRef<HTMLDivElement>(null);
	useDismissible(open, () => setOpen(false), ref);
	return (
		<div ref={ref} className="relative shrink-0">
			<button type="button" title={label} aria-label={label} aria-haspopup="true" aria-expanded={open} onMouseDown={keepSelection} onClick={() => setOpen(!open)} className={clsx(buttonClass, "gap-0.5")}>
				{trigger}
				<ChevronDown size={12} className="text-neutral-500" />
			</button>
			{open && <div className="absolute left-0 top-9 z-50 rounded-xl border border-neutral-200 bg-white p-2 shadow-xl" onMouseDown={keepSelection}>{children}</div>}
		</div>
	);
}

function ColorPicker({ label, highlight, onPick }: { label: string; highlight?: boolean; onPick: (color: string) => void }) {
	const { t } = useLanguage();
	const [open, setOpen] = useState(false);
	const [last, setLast] = useState(highlight ? "#ffff00" : "#000000");
	const pick = (color: string) => { setLast(color); setOpen(false); onPick(color); };
	return (
		<Popover label={label} open={open} setOpen={setOpen} trigger={<ColorGlyph color={last} highlight={highlight} />}>
			<div className="grid w-max grid-cols-6 gap-1">
				{COLORS.map((color) => (
					<button key={color} type="button" title={color} aria-label={color} onClick={() => pick(color)} className="h-6 w-6 rounded-full ring-1 ring-black/15 hover:scale-110" style={{ background: color }} />
				))}
			</div>
			{highlight && <button type="button" onClick={() => pick("transparent")} className="mt-2 w-full rounded-md px-2 py-1 text-left text-xs text-neutral-700 hover:bg-neutral-100">{t("docs.toolbar.noHighlight")}</button>}
			<label className="mt-2 flex items-center gap-2 px-1 text-xs text-neutral-600">
				{t("docs.toolbar.customColor")}
				<input type="color" value={last === "transparent" ? "#ffffff" : last} onChange={(event) => pick(event.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
			</label>
		</Popover>
	);
}

function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
	const { t } = useLanguage();
	const [open, setOpen] = useState(false);
	const [hover, setHover] = useState({ rows: 0, cols: 0 });
	return (
		<Popover label={t("docs.toolbar.table")} open={open} setOpen={setOpen} trigger={<TableGlyph />}>
			<div className="grid grid-cols-8 gap-0.5" onMouseLeave={() => setHover({ rows: 0, cols: 0 })}>
				{Array.from({ length: 64 }, (_, index) => {
					const rows = Math.floor(index / 8) + 1;
					const cols = (index % 8) + 1;
					const active = rows <= hover.rows && cols <= hover.cols;
					return <button key={index} type="button" aria-label={`${rows} × ${cols}`} onMouseEnter={() => setHover({ rows, cols })} onFocus={() => setHover({ rows, cols })} onClick={() => { setOpen(false); onPick(rows, cols); }} className={clsx("h-4 w-4 rounded-sm border", active ? "border-blue-500 bg-blue-100" : "border-neutral-300 bg-white")} />;
				})}
			</div>
			<p className="mt-1.5 text-center text-xs text-neutral-600">{hover.rows ? `${hover.rows} × ${hover.cols}` : t("docs.toolbar.tableSize")}</p>
		</Popover>
	);
}

function ImageMenu({ onUpload, onUrl }: { onUpload: (file: File) => void; onUrl: () => void }) {
	const { t } = useLanguage();
	const [open, setOpen] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	return (
		<Popover label={t("docs.toolbar.image")} open={open} setOpen={setOpen} trigger={<ImagePlus size={18} />}>
			<input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload(file); }} />
			<div className="flex w-44 flex-col">
				<button type="button" onClick={() => { setOpen(false); input.current?.click(); }} className="rounded-md px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100">{t("docs.toolbar.imageUpload")}</button>
				<button type="button" onClick={() => { setOpen(false); onUrl(); }} className="rounded-md px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100">{t("docs.toolbar.imageUrl")}</button>
			</div>
		</Popover>
	);
}

export function DocsToolbar({ state, onAction }: { state: DocsToolbarState; onAction: (action: DocsAction) => void }) {
	const { t } = useLanguage();
	const blockOptions: { value: DocsBlockStyle; label: string }[] = [
		{ value: "p", label: t("docs.style.normal") },
		{ value: "title", label: t("docs.style.title") },
		{ value: "h1", label: t("docs.style.heading1") },
		{ value: "h2", label: t("docs.style.heading2") },
		{ value: "h3", label: t("docs.style.heading3") },
		{ value: "blockquote", label: t("docs.style.quote") },
		{ value: "pre", label: t("docs.style.code") },
	];
	const family = FONT_FAMILIES.find((entry) => state.fontFamily && state.fontFamily.toLowerCase().replace(/["']/g, "").startsWith(entry.label.toLowerCase()));
	const command = (name: Extract<DocsAction, { type: "command" }>["command"]) => () => onAction({ type: "command", command: name });

	return (
		<div role="toolbar" aria-label={t("docs.toolbar.label")} className="flex items-center gap-0.5 overflow-x-auto rounded-full bg-neutral-100 px-3 py-1 [scrollbar-width:none] print:hidden">
			<ToolButton label={t("docs.toolbar.undo")} onClick={command("undo")} disabled={!state.canUndo}><UndoGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.redo")} onClick={command("redo")} disabled={!state.canRedo}><RedoGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.print")} onClick={() => onAction({ type: "print" })}><PrintGlyph /></ToolButton>
			{divider}
			<select aria-label={t("docs.toolbar.style")} title={t("docs.toolbar.style")} value={state.block ?? ""} onChange={(event) => onAction({ type: "block", style: event.target.value as DocsBlockStyle })} className={clsx(selectClass, "w-32")}>
				{!state.block && <option value="">—</option>}
				{blockOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
			</select>
			{divider}
			<select aria-label={t("docs.toolbar.font")} title={t("docs.toolbar.font")} value={family?.value ?? ""} onChange={(event) => onAction({ type: "fontFamily", family: event.target.value })} className={clsx(selectClass, "w-32")}>
				{!family && <option value="">—</option>}
				{FONT_FAMILIES.map((entry) => <option key={entry.value} value={entry.value} style={{ fontFamily: entry.value }}>{entry.label}</option>)}
			</select>
			{divider}
			<select aria-label={t("docs.toolbar.fontSize")} title={t("docs.toolbar.fontSize")} value={state.fontSize && FONT_SIZES.includes(state.fontSize) ? String(state.fontSize) : ""} onChange={(event) => onAction({ type: "fontSize", pt: Number(event.target.value) })} className={clsx(selectClass, "w-16")}>
				{!(state.fontSize && FONT_SIZES.includes(state.fontSize)) && <option value="">{state.fontSize ?? "—"}</option>}
				{FONT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
			</select>
			{divider}
			<ToolButton label={t("docs.toolbar.bold")} pressed={state.bold} onClick={command("bold")}><Bold size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.italic")} pressed={state.italic} onClick={command("italic")}><Italic size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.underline")} pressed={state.underline} onClick={command("underline")}><Underline size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.strikethrough")} pressed={state.strike} onClick={command("strikeThrough")}><Strikethrough size={18} /></ToolButton>
			<ColorPicker label={t("docs.toolbar.textColor")} onPick={(color) => onAction({ type: "color", target: "text", color })} />
			<ColorPicker label={t("docs.toolbar.highlight")} highlight onPick={(color) => onAction({ type: "color", target: "highlight", color })} />
			{divider}
			<ToolButton label={t("docs.toolbar.link")} pressed={state.link} onClick={() => onAction({ type: "link" })}><Link2 size={18} /></ToolButton>
			{state.link && <ToolButton label={t("docs.toolbar.unlink")} onClick={command("unlink")}><UnlinkGlyph /></ToolButton>}
			<ImageMenu onUpload={(file) => onAction({ type: "imageUpload", file })} onUrl={() => onAction({ type: "imageUrl" })} />
			<TablePicker onPick={(rows, cols) => onAction({ type: "table", rows, cols })} />
			{divider}
			<ToolButton label={t("docs.toolbar.alignLeft")} pressed={state.align === "left"} onClick={() => onAction({ type: "align", align: "left" })}><AlignLeftGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.alignCenter")} pressed={state.align === "center"} onClick={() => onAction({ type: "align", align: "center" })}><AlignCenterGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.alignRight")} pressed={state.align === "right"} onClick={() => onAction({ type: "align", align: "right" })}><AlignRightGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.alignJustify")} pressed={state.align === "justify"} onClick={() => onAction({ type: "align", align: "justify" })}><AlignJustifyGlyph /></ToolButton>
			{divider}
			<ToolButton label={t("docs.toolbar.checklist")} pressed={state.checklist} onClick={() => onAction({ type: "checklist" })}><ListChecks size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.bulletedList")} pressed={state.unorderedList && !state.checklist} onClick={command("insertUnorderedList")}><List size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.numberedList")} pressed={state.orderedList} onClick={command("insertOrderedList")}><ListOrdered size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.outdent")} onClick={command("outdent")}><OutdentGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.indent")} onClick={command("indent")}><IndentGlyph /></ToolButton>
			{divider}
			<ToolButton label={t("docs.toolbar.horizontalRule")} onClick={() => onAction({ type: "horizontalRule" })}><Minus size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.pageBreak")} onClick={() => onAction({ type: "pageBreak" })}><PageBreakGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.clearFormatting")} onClick={command("removeFormat")}><RemoveFormatting size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.pageSetup")} onClick={() => onAction({ type: "pageSetup" })}><PageSetupGlyph /></ToolButton>
		</div>
	);
}
