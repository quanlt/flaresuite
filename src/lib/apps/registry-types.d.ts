import type { LucideIcon } from "@/components/icons";
import type { TranslationKey } from "@/lib/i18n/types";

/** The account switches an app can depend on (see `users` in the schema). */
export type AppUserFlags = {
	calendarEnabled?: boolean;
	driveEnabled?: boolean;
};

export type AppIcon = LucideIcon;

/**
 * One entry in the apps launcher. Add an entry here when a new app ships
 * (Docs, Sheets, Slides, ...); the launcher and any future app switcher read
 * this list instead of hard-coding routes.
 */
export type AppDefinition = {
	id: string;
	href: string;
	/** i18n key resolved with `t()`. */
	labelKey: TranslationKey;
	icon: AppIcon;
	/** Hide the app for accounts where it is turned off. Omit for always-on apps. */
	isEnabled?: (user: AppUserFlags | null) => boolean;
};
