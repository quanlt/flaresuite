import { FileSpreadsheet, FileText, Presentation } from "@/components/icons";
import type { LucideIcon } from "@/components/icons";
import type { TranslationKey } from "@/lib/i18n/types";
import type { OfficeKind } from "@/lib/office/types";
import { OFFICE_APP_PATHS } from "@/lib/office/utils";
import type { OfficeAppClient, OfficeEditorComponent } from "./office-types";
import { docsApp } from "./docs/app";
import { DocsEditor } from "./docs/docs-editor";
import { sheetsApp } from "./sheets/app";
import { SheetsEditor } from "./sheets/sheets-editor";
import { slidesApp } from "./slides/app";
import { SlidesEditor } from "./slides/slides-editor";

export type OfficeAppMeta<K extends OfficeKind> = {
	kind: K;
	path: string;
	icon: LucideIcon;
	/** Brand colour of the app, used as an inline style so the dark theme keeps it. */
	color: string;
	nameKey: TranslationKey;
	newKey: TranslationKey;
	blankKey: TranslationKey;
	client: OfficeAppClient<K>;
	Editor: OfficeEditorComponent<K>;
};

export const OFFICE_APPS: { [K in OfficeKind]: OfficeAppMeta<K> } = {
	document: { kind: "document", path: OFFICE_APP_PATHS.document, icon: FileText, color: "#1a73e8", nameKey: "apps.docs", newKey: "office.newDocument", blankKey: "office.blankDocument", client: docsApp, Editor: DocsEditor },
	spreadsheet: { kind: "spreadsheet", path: OFFICE_APP_PATHS.spreadsheet, icon: FileSpreadsheet, color: "#188038", nameKey: "apps.sheets", newKey: "office.newSpreadsheet", blankKey: "office.blankSpreadsheet", client: sheetsApp, Editor: SheetsEditor },
	presentation: { kind: "presentation", path: OFFICE_APP_PATHS.presentation, icon: Presentation, color: "#e37400", nameKey: "apps.slides", newKey: "office.newPresentation", blankKey: "office.blankPresentation", client: slidesApp, Editor: SlidesEditor },
};

export function officeApp<K extends OfficeKind>(kind: K): OfficeAppMeta<K> {
	return OFFICE_APPS[kind] as OfficeAppMeta<K>;
}
