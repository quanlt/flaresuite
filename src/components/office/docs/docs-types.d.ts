/** Paragraph styles offered by the toolbar. `title` is an h1 marked with data-title. */
export type DocsBlockStyle = "p" | "title" | "h1" | "h2" | "h3" | "blockquote" | "pre";

export type DocsAlign = "left" | "center" | "right" | "justify";

/** What the toolbar shows as active for the current selection. */
export type DocsToolbarState = {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	unorderedList: boolean;
	orderedList: boolean;
	checklist: boolean;
	align: DocsAlign;
	block: DocsBlockStyle | null;
	fontSize: number | null;
	fontFamily: string | null;
	link: boolean;
	canUndo: boolean;
	canRedo: boolean;
};

export type DocsAction =
	| { type: "command"; command: "undo" | "redo" | "bold" | "italic" | "underline" | "strikeThrough" | "insertUnorderedList" | "insertOrderedList" | "indent" | "outdent" | "removeFormat" | "unlink" }
	| { type: "align"; align: DocsAlign }
	| { type: "block"; style: DocsBlockStyle }
	| { type: "fontSize"; pt: number }
	| { type: "fontFamily"; family: string }
	| { type: "color"; target: "text" | "highlight"; color: string }
	| { type: "checklist" }
	| { type: "link" }
	| { type: "table"; rows: number; cols: number }
	| { type: "imageUpload"; file: File }
	| { type: "imageUrl" }
	| { type: "horizontalRule" }
	| { type: "pageBreak" }
	| { type: "pageSetup" }
	| { type: "print" };
