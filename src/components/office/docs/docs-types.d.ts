/** Paragraph styles offered by the toolbar. `title` is an h1 marked with data-title, `subtitle` a p marked with data-subtitle. */
export type DocsBlockStyle = "p" | "title" | "subtitle" | "h1" | "h2" | "h3" | "blockquote" | "pre";

export type DocsAlign = "left" | "center" | "right" | "justify";

/** Letter case changes offered by Format > Text > Capitalization. */
export type DocsTextCase = "lower" | "upper" | "title";

/** CSS list-style-type values offered by Format > Bullets & numbering. */
export type DocsListStyle = "disc" | "circle" | "square" | "decimal" | "lower-alpha" | "upper-alpha" | "lower-roman" | "upper-roman";

export type DocsTableEdit = "rowAbove" | "rowBelow" | "columnLeft" | "columnRight" | "deleteRow" | "deleteColumn" | "deleteTable";

/** What the toolbar shows as active for the current selection. */
export type DocsToolbarState = {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	superscript: boolean;
	subscript: boolean;
	unorderedList: boolean;
	orderedList: boolean;
	checklist: boolean;
	align: DocsAlign;
	block: DocsBlockStyle | null;
	fontSize: number | null;
	fontFamily: string | null;
	lineHeight: number | null;
	/** Whether the paragraph at the caret has space above / below it (Format > Line & paragraph spacing). */
	spaceBefore: boolean;
	spaceAfter: boolean;
	link: boolean;
	inTable: boolean;
	canUndo: boolean;
	canRedo: boolean;
};

export type DocsCommand =
	| "undo" | "redo" | "bold" | "italic" | "underline" | "strikeThrough" | "superscript" | "subscript"
	| "insertUnorderedList" | "insertOrderedList" | "indent" | "outdent" | "removeFormat" | "unlink"
	| "selectAll" | "cut" | "copy";

export type DocsAction =
	| { type: "command"; command: DocsCommand }
	| { type: "paste"; plain: boolean }
	| { type: "align"; align: DocsAlign }
	| { type: "block"; style: DocsBlockStyle }
	| { type: "fontSize"; pt: number }
	| { type: "fontSizeStep"; direction: 1 | -1 }
	| { type: "fontFamily"; family: string }
	| { type: "color"; target: "text" | "highlight"; color: string }
	| { type: "lineHeight"; value: number }
	| { type: "paragraphSpacing"; edge: "before" | "after"; add: boolean }
	| { type: "textCase"; mode: DocsTextCase }
	| { type: "listStyle"; style: DocsListStyle }
	| { type: "checklist" }
	| { type: "link" }
	| { type: "table"; rows: number; cols: number }
	| { type: "tableDialog" }
	| { type: "tableEdit"; edit: DocsTableEdit }
	| { type: "imageUpload"; file: File }
	| { type: "imageUrl" }
	| { type: "horizontalRule" }
	| { type: "pageBreak" }
	| { type: "insertText"; text: string }
	| { type: "date" }
	| { type: "specialCharacters" }
	| { type: "find"; replace: boolean }
	| { type: "wordCount" }
	| { type: "pageSetup" }
	| { type: "print" };

/** View settings: never stored with the document. */
export type DocsViewState = {
	zoom: number;
	printLayout: boolean;
	outline: boolean;
	wordCount: boolean;
};
