"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { Bold, ChevronDown, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Minus, RemoveFormatting, Strikethrough, Underline } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { useDismissible } from "@/components/use-dismissible";
import { AlignCenterGlyph, AlignJustifyGlyph, AlignLeftGlyph, AlignRightGlyph, ColorGlyph, FontSizeUpGlyph, IndentGlyph, LineSpacingGlyph, OutdentGlyph, PageBreakGlyph, PageSetupGlyph, PrintGlyph, RedoGlyph, SubscriptGlyph, SuperscriptGlyph, TableGlyph, UndoGlyph, UnlinkGlyph } from "./docs-icons";
import type { DocsAction, DocsBlockStyle, DocsToolbarState } from "./docs-types";
import { FONT_SIZES, LINE_HEIGHTS, parseFontSize, ZOOM_LEVELS } from "./docs-utils";

export const FONT_FAMILIES: { label: string; value: string }[] = [
	{ label: "Arial", value: "Arial, Helvetica, sans-serif" },
	{ label: "Inter", value: "Inter, Arial, sans-serif" },
	{ label: "Georgia", value: "Georgia, serif" },
	{ label: "Times New Roman", value: "\"Times New Roman\", Times, serif" },
	{ label: "Verdana", value: "Verdana, Geneva, sans-serif" },
	{ label: "Trebuchet MS", value: "\"Trebuchet MS\", sans-serif" },
	{ label: "Courier New", value: "\"Courier New\", Courier, monospace" },
];

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
	const panel = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
	useDismissible(open, () => setOpen(false), ref);
	// The toolbar scrolls sideways, which would clip an absolutely placed panel: it is fixed to the viewport instead,
	// kept on screen, and closes when anything scrolls or the window resizes.
	useLayoutEffect(() => {
		if (!open || !ref.current) { setPosition(null); return; }
		const rect = ref.current.getBoundingClientRect();
		const width = panel.current?.offsetWidth ?? 0;
		setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: rect.bottom + 4 });
		const close = (event: Event) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
		window.addEventListener("resize", close);
		window.addEventListener("scroll", close, true);
		return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
	}, [open, setOpen]);
	return (
		<div ref={ref} className="relative shrink-0">
			<button type="button" title={label} aria-label={label} aria-haspopup="true" aria-expanded={open} onMouseDown={keepSelection} onClick={() => setOpen(!open)} className={clsx(buttonClass, "gap-0.5")}>
				{trigger}
				<ChevronDown size={12} className="text-neutral-500" />
			</button>
			{open && (
				<div ref={panel} className="fixed z-50 max-w-[calc(100vw-1rem)] rounded-xl border border-neutral-200 bg-white p-2 shadow-xl" style={position ?? { left: 0, top: 0, visibility: "hidden" }} onMouseDown={keepSelection}>
					{children}
				</div>
			)}
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
		<>
			{/* Outside the panel: the panel unmounts when the file picker opens, and a detached input never reports the file. */}
			<input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload(file); }} />
			<Popover label={t("docs.toolbar.image")} open={open} setOpen={setOpen} trigger={<ImagePlus size={18} />}>
				<div className="flex w-44 flex-col">
					<button type="button" onClick={() => { setOpen(false); input.current?.click(); }} className="rounded-md px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100">{t("docs.toolbar.imageUpload")}</button>
					<button type="button" onClick={() => { setOpen(false); onUrl(); }} className="rounded-md px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100">{t("docs.toolbar.imageUrl")}</button>
				</div>
			</Popover>
		</>
	);
}

const menuButtonClass = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100";

function LineSpacingMenu({ state, onAction }: { state: DocsToolbarState; onAction: (action: DocsAction) => void }) {
	const { t } = useLanguage();
	const [open, setOpen] = useState(false);
	const run = (action: DocsAction) => { setOpen(false); onAction(action); };
	return (
		<Popover label={t("docs.toolbar.lineSpacing")} open={open} setOpen={setOpen} trigger={<LineSpacingGlyph />}>
			<div className="flex w-56 flex-col">
				{LINE_HEIGHTS.map((entry) => (
					<button key={entry.key} type="button" onClick={() => run({ type: "lineHeight", value: entry.value })} className={menuButtonClass}>
						<span className="w-4 text-blue-700">{state.lineHeight === entry.value ? "✓" : ""}</span>
						{t(`docs.spacing.${entry.key}`)}
					</button>
				))}
				<span aria-hidden="true" className="my-1 h-px bg-neutral-100" />
				<button type="button" onClick={() => run({ type: "paragraphSpacing", edge: "before", add: !state.spaceBefore })} className={menuButtonClass}>
					<span className="w-4" />{state.spaceBefore ? t("docs.spacing.removeBefore") : t("docs.spacing.addBefore")}
				</button>
				<button type="button" onClick={() => run({ type: "paragraphSpacing", edge: "after", add: !state.spaceAfter })} className={menuButtonClass}>
					<span className="w-4" />{state.spaceAfter ? t("docs.spacing.removeAfter") : t("docs.spacing.addAfter")}
				</button>
			</div>
		</Popover>
	);
}

/** "- [11] +": a typed size, presets in a list, and steps through the presets. */
function FontSizeBox({ value, onAction }: { value: number | null; onAction: (action: DocsAction) => void }) {
	const { t } = useLanguage();
	const [text, setText] = useState(value ? String(value) : "");
	// Enter applies and moves focus back to the page, which blurs the box: the blur must not apply it again.
	const applied = useRef<number | null>(null);
	const apply = () => {
		const size = parseFontSize(text);
		if (size && size !== value && size !== applied.current) { applied.current = size; onAction({ type: "fontSize", pt: size }); }
		else if (!size) setText(value ? String(value) : "");
	};
	return (
		<div className="flex shrink-0 items-center">
			<ToolButton label={t("docs.toolbar.decreaseFontSize")} onClick={() => onAction({ type: "fontSizeStep", direction: -1 })}><Minus size={16} /></ToolButton>
			<input
				aria-label={t("docs.toolbar.fontSize")}
				title={t("docs.toolbar.fontSize")}
				list="docs-font-sizes"
				inputMode="decimal"
				value={text}
				onChange={(event) => setText(event.target.value)}
				onFocus={(event) => event.target.select()}
				onBlur={apply}
				onKeyDown={(event) => {
					if (event.key === "Enter") { event.preventDefault(); apply(); }
					if (event.key === "Escape") { event.preventDefault(); setText(value ? String(value) : ""); event.currentTarget.blur(); }
				}}
				className="h-7 w-10 shrink-0 rounded-md border border-neutral-300 bg-white text-center text-sm text-neutral-800 focus:border-blue-500 focus:outline-none"
			/>
			<datalist id="docs-font-sizes">{FONT_SIZES.map((size) => <option key={size} value={size} />)}</datalist>
			<ToolButton label={t("docs.toolbar.increaseFontSize")} onClick={() => onAction({ type: "fontSizeStep", direction: 1 })}><FontSizeUpGlyph size={16} /></ToolButton>
		</div>
	);
}

export function DocsToolbar({ state, zoom, onZoom, onAction }: { state: DocsToolbarState; zoom: number; onZoom: (zoom: number) => void; onAction: (action: DocsAction) => void }) {
	const { t } = useLanguage();
	const blockOptions: { value: DocsBlockStyle; label: string }[] = [
		{ value: "p", label: t("docs.style.normal") },
		{ value: "title", label: t("docs.style.title") },
		{ value: "subtitle", label: t("docs.style.subtitle") },
		{ value: "h1", label: t("docs.style.heading1") },
		{ value: "h2", label: t("docs.style.heading2") },
		{ value: "h3", label: t("docs.style.heading3") },
		{ value: "blockquote", label: t("docs.style.quote") },
		{ value: "pre", label: t("docs.style.code") },
	];
	const family = FONT_FAMILIES.find((entry) => state.fontFamily && state.fontFamily.toLowerCase().replace(/["']/g, "").startsWith(entry.label.toLowerCase()));
	const command = (name: Extract<DocsAction, { type: "command" }>["command"]) => () => onAction({ type: "command", command: name });

	return (
		<div role="toolbar" aria-label={t("docs.toolbar.label")} className="flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-full bg-neutral-100 px-3 py-1 [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden">
			<ToolButton label={t("docs.toolbar.undo")} onClick={command("undo")} disabled={!state.canUndo}><UndoGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.redo")} onClick={command("redo")} disabled={!state.canRedo}><RedoGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.print")} onClick={() => onAction({ type: "print" })}><PrintGlyph /></ToolButton>
			<select aria-label={t("docs.toolbar.zoom")} title={t("docs.toolbar.zoom")} value={String(zoom)} onChange={(event) => onZoom(Number(event.target.value))} className={clsx(selectClass, "w-[4.5rem]")}>
				{!ZOOM_LEVELS.includes(zoom) && <option value={String(zoom)}>{zoom}%</option>}
				{ZOOM_LEVELS.map((level) => <option key={level} value={String(level)}>{level}%</option>)}
			</select>
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
			<FontSizeBox key={state.fontSize ?? "none"} value={state.fontSize} onAction={onAction} />
			{divider}
			<ToolButton label={t("docs.toolbar.bold")} pressed={state.bold} onClick={command("bold")}><Bold size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.italic")} pressed={state.italic} onClick={command("italic")}><Italic size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.underline")} pressed={state.underline} onClick={command("underline")}><Underline size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.strikethrough")} pressed={state.strike} onClick={command("strikeThrough")}><Strikethrough size={18} /></ToolButton>
			<ToolButton label={t("docs.toolbar.superscript")} pressed={state.superscript} onClick={command("superscript")}><SuperscriptGlyph /></ToolButton>
			<ToolButton label={t("docs.toolbar.subscript")} pressed={state.subscript} onClick={command("subscript")}><SubscriptGlyph /></ToolButton>
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
			<LineSpacingMenu state={state} onAction={onAction} />
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
