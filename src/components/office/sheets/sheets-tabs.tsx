"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { useState } from "react";
import { ChevronDown, Plus } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { confirmDestructive } from "@/components/ui/confirm-dialog";
import type { Sheet } from "@/lib/office/types";
import { formatGeneralNumber } from "@/lib/office/sheets/formula";
import type { SelectionStats } from "./sheets-editor-types";

const itemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[disabled]:cursor-default data-[disabled]:opacity-40";

type TabsProps = {
	sheets: Sheet[];
	activeId: string;
	readOnly: boolean;
	stats: SelectionStats | null;
	onSelect: (id: string) => void;
	onAdd: () => void;
	onRename: (id: string, name: string) => void;
	onDelete: (id: string) => void;
	onDuplicate: (id: string) => void;
	onMove: (id: string, toIndex: number) => void;
};

/** Sheet tabs along the bottom, plus the sum / average / count of the selection. */
export function SheetsTabs({ sheets, activeId, readOnly, stats, onSelect, onAdd, onRename, onDelete, onDuplicate, onMove }: TabsProps) {
	const { t } = useLanguage();
	const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
	const [dragId, setDragId] = useState<string | null>(null);

	function finishRename() {
		if (renaming && renaming.value.trim()) onRename(renaming.id, renaming.value);
		setRenaming(null);
	}

	async function remove(sheet: Sheet) {
		if (await confirmDestructive(t("sheets.deleteSheetConfirm", { name: sheet.name }))) onDelete(sheet.id);
	}

	return (
		<div className="flex h-10 shrink-0 items-center gap-1 border-t border-neutral-200 bg-neutral-50 px-2 print:hidden">
			{!readOnly && (
				<button type="button" onClick={onAdd} aria-label={t("sheets.addSheet")} title={t("sheets.addSheet")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-200"><Plus size={18} /></button>
			)}
			<div role="tablist" aria-label={t("sheets.sheets")} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
				{sheets.map((sheet, index) => {
					const active = sheet.id === activeId;
					if (renaming?.id === sheet.id) {
						return (
							<input
								key={sheet.id}
								autoFocus
								value={renaming.value}
								aria-label={t("sheets.renameSheet")}
								onChange={(event) => setRenaming({ id: sheet.id, value: event.target.value })}
								onFocus={(event) => event.currentTarget.select()}
								onBlur={finishRename}
								onKeyDown={(event) => {
									if (event.key === "Enter") finishRename();
									if (event.key === "Escape") setRenaming(null);
								}}
								maxLength={100}
								className="h-8 w-32 rounded-md border border-blue-500 bg-white px-2 text-sm outline-none"
							/>
						);
					}
					return (
						<div
							key={sheet.id}
							draggable={!readOnly}
							onDragStart={(event) => { setDragId(sheet.id); event.dataTransfer.effectAllowed = "move"; }}
							onDragEnd={() => setDragId(null)}
							onDragOver={(event) => { if (dragId && dragId !== sheet.id) event.preventDefault(); }}
							onDrop={(event) => { event.preventDefault(); if (dragId && dragId !== sheet.id) onMove(dragId, index); setDragId(null); }}
							className={clsx("flex h-8 shrink-0 items-center rounded-md text-sm", active ? "bg-white font-medium text-blue-700 shadow-sm" : "text-neutral-700 hover:bg-neutral-200", dragId === sheet.id && "opacity-50")}
						>
							<button
								type="button"
								role="tab"
								aria-selected={active}
								onClick={() => onSelect(sheet.id)}
								onDoubleClick={() => { if (!readOnly) setRenaming({ id: sheet.id, value: sheet.name }); }}
								className="h-full max-w-48 truncate pl-3 pr-1"
							>
								{sheet.name}
							</button>
							{!readOnly && (
								<DropdownMenu.Root>
									<DropdownMenu.Trigger asChild>
										<button type="button" aria-label={t("sheets.sheetMenu", { name: sheet.name })} className="mr-1 flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-300/60"><ChevronDown size={12} /></button>
									</DropdownMenu.Trigger>
									<DropdownMenu.Portal>
										<DropdownMenu.Content side="top" align="start" sideOffset={4} className="z-[200] min-w-44 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
											<DropdownMenu.Item className={itemClass} onSelect={() => setRenaming({ id: sheet.id, value: sheet.name })}>{t("sheets.renameSheet")}</DropdownMenu.Item>
											<DropdownMenu.Item className={itemClass} onSelect={() => onDuplicate(sheet.id)}>{t("sheets.duplicateSheet")}</DropdownMenu.Item>
											<DropdownMenu.Item className={itemClass} disabled={index === 0} onSelect={() => onMove(sheet.id, index - 1)}>{t("sheets.moveLeft")}</DropdownMenu.Item>
											<DropdownMenu.Item className={itemClass} disabled={index === sheets.length - 1} onSelect={() => onMove(sheet.id, index + 1)}>{t("sheets.moveRight")}</DropdownMenu.Item>
											<DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />
											<DropdownMenu.Item className={clsx(itemClass, "text-red-600")} disabled={sheets.length < 2} onSelect={() => void remove(sheet)}>{t("sheets.deleteSheet")}</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Portal>
								</DropdownMenu.Root>
							)}
						</div>
					);
				})}
			</div>
			{stats && (
				<div aria-live="polite" className="hidden shrink-0 items-center gap-3 rounded-md bg-white px-3 py-1 text-xs text-neutral-700 shadow-sm sm:flex">
					{stats.numbers > 0 && <span>{t("sheets.statSum", { value: formatGeneralNumber(stats.sum) })}</span>}
					{stats.average !== null && <span>{t("sheets.statAverage", { value: formatGeneralNumber(stats.average) })}</span>}
					<span>{t("sheets.statCount", { value: String(stats.count) })}</span>
				</div>
			)}
		</div>
	);
}
