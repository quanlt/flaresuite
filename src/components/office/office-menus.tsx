"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { Check, ChevronRight } from "@/components/icons";
import type { OfficeMenu, OfficeMenuItem } from "./office-menus-types";

export type { OfficeMenu, OfficeMenuItem } from "./office-menus-types";

/**
 * The menu bar under the document title (Edit, View, Insert, Format, …). The shared header owns File and Help;
 * each editor registers its own menus with `useOfficeMenus`, so the header never needs to know the app.
 */
const OfficeMenusContext = createContext<{ menus: OfficeMenu[]; setMenus: (menus: OfficeMenu[]) => void } | null>(null);

export function OfficeMenusProvider({ children }: { children: ReactNode }) {
	const [menus, setMenus] = useState<OfficeMenu[]>([]);
	return <OfficeMenusContext.Provider value={{ menus, setMenus }}>{children}</OfficeMenusContext.Provider>;
}

/** Menus the current editor offers. Pass a fresh array when its state changes (checked items, disabled items). */
export function useOfficeMenus(menus: OfficeMenu[]) {
	const context = useContext(OfficeMenusContext);
	const setMenus = context?.setMenus;
	useEffect(() => { setMenus?.(menus); }, [setMenus, menus]);
	useEffect(() => () => setMenus?.([]), [setMenus]);
}

export function useRegisteredOfficeMenus(): OfficeMenu[] {
	return useContext(OfficeMenusContext)?.menus ?? [];
}

export const officeMenuItemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[disabled]:cursor-default data-[disabled]:opacity-40";
const contentClass = "z-[200] max-h-[calc(100vh-6rem)] min-w-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl";

function MenuItems({ items }: { items: OfficeMenuItem[] }) {
	return (
		<>
			{items.map((entry, index) => {
				if (entry.kind === "separator") return <DropdownMenu.Separator key={`s${index}`} className="my-1 h-px bg-neutral-100" />;
				if (entry.kind === "submenu") {
					const Icon = entry.icon;
					return (
						<DropdownMenu.Sub key={entry.id}>
							<DropdownMenu.SubTrigger disabled={entry.disabled} className={officeMenuItemClass}>
								<span className="flex w-4 justify-center">{Icon && <Icon size={16} />}</span>
								<span className="flex-1">{entry.label}</span>
								<ChevronRight size={14} />
							</DropdownMenu.SubTrigger>
							<DropdownMenu.Portal>
								<DropdownMenu.SubContent sideOffset={6} className={clsx(contentClass, "z-[201]")}>
									<MenuItems items={entry.items} />
								</DropdownMenu.SubContent>
							</DropdownMenu.Portal>
						</DropdownMenu.Sub>
					);
				}
				const Icon = entry.icon;
				return (
					<DropdownMenu.Item key={entry.id} disabled={entry.disabled} className={clsx(officeMenuItemClass, entry.danger && "text-red-600")} onSelect={() => entry.onSelect()}>
						<span className="flex w-4 justify-center">{entry.checked ? <Check size={16} /> : Icon ? <Icon size={16} /> : null}</span>
						<span className="flex-1">{entry.label}</span>
						{entry.shortcut && <span className="pl-6 text-xs text-neutral-400">{entry.shortcut}</span>}
					</DropdownMenu.Item>
				);
			})}
		</>
	);
}

/** One top-level menu of the bar. */
export function OfficeMenuButton({ menu }: { menu: OfficeMenu }) {
	return (
		<DropdownMenu.Root modal={false}>
			<DropdownMenu.Trigger className="rounded-md px-2 py-0.5 text-neutral-700 outline-none hover:bg-neutral-100 data-[state=open]:bg-neutral-100" data-testid={`office-menu-${menu.id}`}>
				{menu.label}
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				{/* Editors keep their selection: focus does not move back to the trigger when an item runs. */}
				<DropdownMenu.Content align="start" sideOffset={4} className={contentClass} onCloseAutoFocus={(event) => event.preventDefault()}>
					<MenuItems items={menu.items} />
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

/** Platform label for a shortcut written with "Mod" (Ctrl, or ⌘ on Apple devices). */
export function shortcutLabel(shortcut: string): string {
	const apple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
	return apple ? shortcut.replace(/Mod\+/g, "⌘").replace(/Shift\+/g, "⇧").replace(/Alt\+/g, "⌥") : shortcut.replace(/Mod\+/g, "Ctrl+");
}
