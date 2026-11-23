export type Box = { x: number; y: number; w: number; h: number };

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

export type ZOrderMove = "forward" | "backward" | "front" | "back";

export type SnapGuide = { orientation: "vertical" | "horizontal"; position: number };

export type SnapResult = { dx: number; dy: number; guides: SnapGuide[] };

export type SlideLayoutId = "title" | "titleBody" | "section" | "twoColumns" | "imageCaption" | "blank";

export type SlideThemeId = "light" | "dark" | "blue" | "warm";

export type SlideTheme = { fontFamily: string; background: string; color: string; accent: string };

export type InsertKind = "text" | "rect" | "roundRect" | "ellipse" | "triangle" | "arrow" | "line";

/** "fit" sizes the slide to the space around it; a number is a percentage. */
export type ZoomLevel = "fit" | number;

/** What a colour picker opened from a menu changes. */
export type ColorTarget = "text" | "fill" | "stroke" | "background";

/** Everything the menus (and keyboard shortcuts) can do; the editor implements it. */
export type SlidesActions = {
	undo: () => void;
	redo: () => void;
	cut: () => void;
	copy: () => void;
	paste: () => void;
	duplicate: () => void;
	deleteSelection: () => void;
	selectAll: () => void;
	present: (fromStart: boolean) => void;
	toggleGrid: () => void;
	toggleFilmstrip: () => void;
	toggleNotes: () => void;
	setZoom: (zoom: ZoomLevel) => void;
	insert: (kind: InsertKind) => void;
	uploadImage: () => void;
	imageUrl: () => void;
	addSlide: (layout: SlideLayoutId) => void;
	duplicateSlide: () => void;
	deleteSlide: () => void;
	moveSlide: (delta: number) => void;
	toggleSkip: () => void;
	applyLayout: (layout: SlideLayoutId) => void;
	setTheme: (id: SlideThemeId) => void;
	resetBackground: () => void;
	pickColor: (target: ColorTarget) => void;
	toggleBold: () => void;
	toggleItalic: () => void;
	toggleUnderline: () => void;
	setFontSize: (size: number) => void;
	setFontFamily: (family: string) => void;
	setAlign: (align: "left" | "center" | "right") => void;
	setVerticalAlign: (align: "top" | "middle" | "bottom") => void;
	toggleBullets: () => void;
	noFill: () => void;
	setStrokeWidth: (width: number) => void;
	arrange: (move: ZOrderMove) => void;
	alignToSlide: (mode: AlignMode) => void;
	print: () => void;
};

/** The editor state menus show (checked, disabled); serialisable so menus rebuild only when it changes. */
export type SlidesMenuState = {
	readOnly: boolean;
	canUndo: boolean;
	canRedo: boolean;
	canPaste: boolean;
	selectionCount: number;
	hasText: boolean;
	hasFill: boolean;
	hasStroke: boolean;
	editing: boolean;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	fontSize: number;
	fontFamily: string;
	align: "left" | "center" | "right";
	verticalAlign: "top" | "middle" | "bottom";
	strokeWidth: number;
	gridView: boolean;
	showFilmstrip: boolean;
	showNotes: boolean;
	zoom: ZoomLevel;
	current: number;
	slideCount: number;
	skipped: boolean;
	themeId: SlideThemeId | null;
};
