import type { LucideIcon } from "@/components/icons";

export type OfficeMenuItem =
	| { kind: "item"; id: string; label: string; icon?: LucideIcon; shortcut?: string; checked?: boolean; disabled?: boolean; danger?: boolean; onSelect: () => void }
	| { kind: "separator" }
	| { kind: "submenu"; id: string; label: string; icon?: LucideIcon; disabled?: boolean; items: OfficeMenuItem[] };

/** A top-level menu: label already translated by the editor. */
export type OfficeMenu = { id: string; label: string; items: OfficeMenuItem[] };
