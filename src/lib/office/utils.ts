import type { DocumentContent, OfficeContentMap, OfficeEnvelope, OfficeKind, PresentationContent, SpreadsheetContent } from "./types";

export const OFFICE_KINDS: OfficeKind[] = ["document", "spreadsheet", "presentation"];

export const OFFICE_CONTENT_TYPES: Record<OfficeKind, string> = {
	document: "application/vnd.flaresuite.document+json",
	spreadsheet: "application/vnd.flaresuite.spreadsheet+json",
	presentation: "application/vnd.flaresuite.presentation+json",
};

/** Route of each app, e.g. /docs/<id>. */
export const OFFICE_APP_PATHS: Record<OfficeKind, string> = {
	document: "/docs",
	spreadsheet: "/sheets",
	presentation: "/slides",
};

/** Largest stored document. Slides carry images as data: URLs, so this is generous. */
export const OFFICE_MAX_BYTES = 8 * 1024 * 1024;
/** Request bodies are JSON with the content plus a little framing. */
export const OFFICE_MAX_REQUEST_BYTES = OFFICE_MAX_BYTES + 64 * 1024;

export const SPREADSHEET_DEFAULT_ROWS = 100;
export const SPREADSHEET_DEFAULT_COLS = 26;
export const SPREADSHEET_MAX_ROWS = 10_000;
export const SPREADSHEET_MAX_COLS = 702; // A..ZZ
export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;

export function isOfficeKind(value: unknown): value is OfficeKind {
	return typeof value === "string" && (OFFICE_KINDS as string[]).includes(value);
}

export function officeKindFromContentType(contentType: string | null | undefined): OfficeKind | null {
	for (const kind of OFFICE_KINDS) if (OFFICE_CONTENT_TYPES[kind] === contentType) return kind;
	return null;
}

export function isOfficeContentType(contentType: string | null | undefined): boolean {
	return officeKindFromContentType(contentType) !== null;
}

export function officeEditorPath(kind: OfficeKind, id: string): string {
	return `${OFFICE_APP_PATHS[kind]}/${encodeURIComponent(id)}`;
}

/** Short random id for sheets, slides and elements. Not security sensitive. */
export function officeLocalId(prefix: string): string {
	const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14);
	return `${prefix}_${random}`;
}

export function emptyContent<K extends OfficeKind>(kind: K): OfficeContentMap[K] {
	if (kind === "document") return { html: "<p><br></p>", page: { size: "a4", orientation: "portrait" } } satisfies DocumentContent as OfficeContentMap[K];
	if (kind === "spreadsheet") {
		const id = officeLocalId("sh");
		return { sheets: [{ id, name: "Sheet1", rowCount: SPREADSHEET_DEFAULT_ROWS, colCount: SPREADSHEET_DEFAULT_COLS, cells: {} }], activeSheetId: id } satisfies SpreadsheetContent as OfficeContentMap[K];
	}
	return {
		slides: [{
			id: officeLocalId("sl"),
			elements: [
				{ id: officeLocalId("el"), type: "text", x: 80, y: 170, w: 800, h: 110, html: "<p></p>", style: { fontSize: 44, bold: true, align: "center", verticalAlign: "middle" } },
				{ id: officeLocalId("el"), type: "text", x: 160, y: 300, w: 640, h: 60, html: "<p></p>", style: { fontSize: 24, align: "center", verticalAlign: "top", color: "#5f6368" } },
			],
		}],
		theme: { fontFamily: "Inter, Arial, sans-serif", background: "#ffffff", color: "#202124", accent: "#1a73e8" },
	} satisfies PresentationContent as OfficeContentMap[K];
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Structural check of content sent by a client. It does not sanitize HTML (that happens where it is rendered)
 * but refuses shapes the editors could not open, so one bad save cannot make a document unreadable.
 */
export function validateOfficeContent(kind: OfficeKind, content: unknown): string | null {
	if (!isRecord(content)) return "Content must be an object";
	if (kind === "document") return typeof content.html === "string" ? null : "A document needs html";
	if (kind === "spreadsheet") {
		const sheets = content.sheets;
		if (!Array.isArray(sheets) || sheets.length === 0 || sheets.length > 200) return "A spreadsheet needs 1 to 200 sheets";
		for (const sheet of sheets) {
			if (!isRecord(sheet) || typeof sheet.id !== "string" || typeof sheet.name !== "string" || !isRecord(sheet.cells)) return "Invalid sheet";
			if (!Number.isInteger(sheet.rowCount) || !Number.isInteger(sheet.colCount)) return "Invalid sheet size";
			if ((sheet.rowCount as number) < 1 || (sheet.rowCount as number) > SPREADSHEET_MAX_ROWS || (sheet.colCount as number) < 1 || (sheet.colCount as number) > SPREADSHEET_MAX_COLS) return "Sheet is too large";
		}
		return null;
	}
	const slides = content.slides;
	if (!Array.isArray(slides) || slides.length > 1000) return "A presentation needs a list of at most 1000 slides";
	for (const slide of slides) {
		if (!isRecord(slide) || typeof slide.id !== "string" || !Array.isArray(slide.elements)) return "Invalid slide";
	}
	return null;
}

export function createEnvelope<K extends OfficeKind>(kind: K, content: OfficeContentMap[K], revision = 1): OfficeEnvelope<K> {
	return { format: "flaresuite", kind, version: 1, revision, content };
}

/** Reads a stored envelope; returns null when the bytes are not a FlareSuite document of that kind. */
export function parseEnvelope<K extends OfficeKind>(kind: K, text: string): OfficeEnvelope<K> | null {
	let value: unknown;
	try { value = JSON.parse(text); } catch { return null; }
	if (!isRecord(value) || value.format !== "flaresuite" || value.kind !== kind) return null;
	if (validateOfficeContent(kind, value.content)) return null;
	const revision = typeof value.revision === "number" && Number.isFinite(value.revision) ? value.revision : 1;
	return { format: "flaresuite", kind, version: 1, revision, content: value.content as OfficeContentMap[K] };
}

/** File name for a new document, by kind. */
export function defaultOfficeName(kind: OfficeKind): string {
	return kind === "document" ? "Untitled document" : kind === "spreadsheet" ? "Untitled spreadsheet" : "Untitled presentation";
}
