import type { DriveItemDto, DriveRole } from "@/lib/drive/types";

/** The three FlareSuite editors. Each document is a Drive file of the matching content type. */
export type OfficeKind = "document" | "spreadsheet" | "presentation";

/* ---------- Docs ---------- */

export type DocumentContent = {
	/** Sanitized-on-render rich text HTML of the page body. */
	html: string;
	/** Page setup used by the editor and when printing. */
	page?: { size: "a4" | "letter"; orientation: "portrait" | "landscape" };
};

/* ---------- Sheets ---------- */

export type CellNumberFormat = "general" | "number" | "percent" | "currency" | "date" | "time" | "text";

/** A border line drawn on one side of a cell. */
export type CellBorder = { color?: string; style?: "solid" | "dashed" | "dotted" | "thick" };

export type CellStyle = {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
	color?: string;
	fill?: string;
	align?: "left" | "center" | "right";
	/** Vertical alignment; absent means middle. */
	valign?: "top" | "middle" | "bottom";
	format?: CellNumberFormat;
	/** Decimal places for number, percent and currency formats. */
	decimals?: number;
	wrap?: boolean;
	/** Cuts text at the cell edge instead of letting it spill into empty neighbours. Ignored when `wrap` is set. */
	clip?: boolean;
	/** Font size in points; absent means 10. */
	fontSize?: number;
	fontFamily?: string;
	borders?: { top?: CellBorder; right?: CellBorder; bottom?: CellBorder; left?: CellBorder };
	/** Shows a checkbox: TRUE is checked, anything else unchecked. */
	checkbox?: boolean;
};

/** One cell. `input` is what the user typed: a literal value or a formula starting with "=". */
export type Cell = { input: string; style?: CellStyle; /** http(s) or mailto URL the cell links to. */ link?: string };

/** A basic filter: the header row is the first row of `range`; `hidden` lists hidden values per column index. */
export type SheetFilter = { range: string; hidden?: Record<string, string[]> };

export type Sheet = {
	id: string;
	name: string;
	rowCount: number;
	colCount: number;
	/** Keyed by A1 address, e.g. "B12". Empty cells are omitted. */
	cells: Record<string, Cell>;
	/** Column widths in px, keyed by zero-based column index. */
	colWidths?: Record<string, number>;
	/** Row heights in px, keyed by zero-based row index. */
	rowHeights?: Record<string, number>;
	frozenRows?: number;
	frozenCols?: number;
	/** Merged ranges such as "A1:B2"; the top-left cell holds the value. Ranges never overlap. */
	merges?: string[];
	hideGridlines?: boolean;
	filter?: SheetFilter;
};

export type SpreadsheetContent = { sheets: Sheet[]; activeSheetId?: string };

/* ---------- Slides ---------- */

/** Triangle and arrow were added later: older readers render unknown types as nothing, never fail. */
export type SlideElementType = "text" | "rect" | "ellipse" | "triangle" | "arrow" | "line" | "image";

export type SlideElement = {
	id: string;
	type: SlideElementType;
	/** Position and size in slide units (the slide is 960 x 540). */
	x: number;
	y: number;
	w: number;
	h: number;
	rotation?: number;
	/** Rich text HTML for text boxes and text inside shapes. */
	html?: string;
	/** Image source: a data: URL or an https URL. */
	src?: string;
	style?: {
		fill?: string;
		stroke?: string;
		strokeWidth?: number;
		color?: string;
		fontSize?: number;
		fontFamily?: string;
		bold?: boolean;
		italic?: boolean;
		underline?: boolean;
		align?: "left" | "center" | "right";
		verticalAlign?: "top" | "middle" | "bottom";
		radius?: number;
		opacity?: number;
	};
};

export type Slide = {
	id: string;
	background?: string;
	elements: SlideElement[];
	/** Plain-text speaker notes. */
	notes?: string;
	/** Left out of the slideshow and the HTML export (still edited and printed). */
	skipped?: boolean;
};

export type PresentationContent = {
	slides: Slide[];
	theme?: { fontFamily?: string; background?: string; color?: string; accent?: string };
};

export type OfficeContentMap = {
	document: DocumentContent;
	spreadsheet: SpreadsheetContent;
	presentation: PresentationContent;
};

export type OfficeContent = OfficeContentMap[OfficeKind];

/** What is stored in the bucket for every FlareSuite document. */
export type OfficeEnvelope<K extends OfficeKind = OfficeKind> = {
	format: "flaresuite";
	kind: K;
	/** Schema version of `content`. */
	version: 1;
	/** Bumped on every save; a save based on an older revision is refused as a conflict. */
	revision: number;
	content: OfficeContentMap[K];
};

/** GET /api/office/[id] */
export type OfficeDocumentResponse<K extends OfficeKind = OfficeKind> = {
	item: DriveItemDto;
	kind: K;
	role: DriveRole;
	revision: number;
	content: OfficeContentMap[K];
};

/** PUT /api/office/[id] */
export type OfficeSaveRequest = { content: unknown; baseRevision: number };
export type OfficeSaveResponse = { revision: number; updatedAt: string; size: number };
export type OfficeConflictResponse = { error: string; code: "CONFLICT"; revision: number };

/** GET /api/office?kind= */
export type OfficeListResponse = { items: DriveItemDto[] };
