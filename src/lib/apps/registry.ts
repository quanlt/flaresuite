import { CalendarDays, FileSpreadsheet, FileText, HardDrive, Inbox, Presentation, UsersRound } from "@/components/icons";
import type { AppDefinition, AppUserFlags } from "./registry-types";

export type { AppDefinition, AppUserFlags } from "./registry-types";

/**
 * Every app FlareSuite ships, in launcher order. Docs, Sheets and Slides store
 * their files in Drive, so they follow the account's Drive switch; see
 * docs/extending-apps.md for how to add another app.
 */
export const APPS: AppDefinition[] = [
	{ id: "mail", href: "/inbox", labelKey: "navigation.inbox", icon: Inbox },
	{ id: "calendar", href: "/calendar", labelKey: "account.calendar", icon: CalendarDays, isEnabled: (user) => user?.calendarEnabled !== false },
	{ id: "drive", href: "/drive", labelKey: "account.drive", icon: HardDrive, isEnabled: (user) => user?.driveEnabled !== false },
	{ id: "docs", href: "/docs", labelKey: "apps.docs", icon: FileText, isEnabled: (user) => user?.driveEnabled !== false },
	{ id: "sheets", href: "/sheets", labelKey: "apps.sheets", icon: FileSpreadsheet, isEnabled: (user) => user?.driveEnabled !== false },
	{ id: "slides", href: "/slides", labelKey: "apps.slides", icon: Presentation, isEnabled: (user) => user?.driveEnabled !== false },
	{ id: "contacts", href: "/contacts", labelKey: "navigation.contacts", icon: UsersRound },
];

/** The apps this user can open, in launcher order. */
export function visibleApps(user: AppUserFlags | null, apps: AppDefinition[] = APPS): AppDefinition[] {
	return apps.filter((app) => app.isEnabled?.(user) ?? true);
}
