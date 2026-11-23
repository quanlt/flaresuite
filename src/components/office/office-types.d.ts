import type { ComponentType } from "react";
import type { TranslationKey } from "@/lib/i18n/types";
import type { DriveItemDto, DriveRole } from "@/lib/drive/types";
import type { OfficeContentMap, OfficeKind } from "@/lib/office/types";

/**
 * Props every editor (Docs, Sheets, Slides) receives. The editor owns its UI below the shared header, including
 * its toolbar, and reports every change through `onChange`; saving, conflicts and sharing are handled outside.
 */
export type OfficeEditorProps<K extends OfficeKind> = {
	content: OfficeContentMap[K];
	/**
	 * Increments whenever `content` was replaced from outside (first load, reload, a newer revision saved by
	 * someone else). Uncontrolled editors (contentEditable) must reset their DOM when it changes, and only then.
	 */
	contentKey: number;
	onChange: (next: OfficeContentMap[K]) => void;
	/** Viewers, public links and trashed files: show the content, allow selecting and copying, change nothing. */
	readOnly: boolean;
	/** The file name, e.g. for print headers or exports. */
	name: string;
};

export type OfficeEditorComponent<K extends OfficeKind> = ComponentType<OfficeEditorProps<K>>;

export type OfficeTemplate<K extends OfficeKind> = {
	id: string;
	labelKey: TranslationKey;
	create: () => OfficeContentMap[K];
};

export type OfficeExport<K extends OfficeKind> = {
	id: string;
	labelKey: TranslationKey;
	run: (content: OfficeContentMap[K], name: string) => void | Promise<void>;
};

/** Per-app client configuration: templates on the home page, file import and export formats. */
export type OfficeAppClient<K extends OfficeKind> = {
	kind: K;
	templates: OfficeTemplate<K>[];
	exports: OfficeExport<K>[];
	/** `accept` attribute for the import file picker; omit when the app cannot import. */
	importAccept?: string;
	importFile?: (file: File) => Promise<{ name: string; content: OfficeContentMap[K] }>;
};

export type OfficeSaveState = "saved" | "pending" | "saving" | "error" | "conflict" | "readonly";

export type OfficeDocumentState<K extends OfficeKind> =
	| { status: "loading" }
	| { status: "missing" }
	| { status: "error"; message: string }
	| { status: "ready"; item: DriveItemDto; kind: OfficeKind; role: DriveRole; revision: number; content: OfficeContentMap[K] };
