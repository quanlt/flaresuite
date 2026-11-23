"use client";

import type { ReactNode } from "react";
import type { IconProps, LucideIcon } from "@/components/icons";

/** Spreadsheet-specific glyphs (borders, merge, alignment, wrapping) the shared icon set does not have. */
function icon(displayName: string, body: ReactNode, dimmed?: ReactNode): LucideIcon {
	function Icon({ size = 16, ...rest }: IconProps) {
		// These glyphs keep their own stroke; the shared icon props for it do not apply to an <svg>.
		const props = { ...rest };
		delete props.strokeWidth;
		delete props.absoluteStrokeWidth;
		return (
			<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
				{dimmed && <g opacity={0.3} strokeDasharray="2 3">{dimmed}</g>}
				{body}
			</svg>
		);
	}
	Icon.displayName = displayName;
	return Icon;
}

const outer = <rect x="3" y="3" width="18" height="18" rx="1" />;
const inner = <path d="M12 3v18M3 12h18" />;
const top = <path d="M3 3h18" />;
const bottom = <path d="M3 21h18" />;
const left = <path d="M3 3v18" />;
const right = <path d="M21 3v18" />;

export const BorderAllIcon = icon("BorderAllIcon", <>{outer}{inner}</>);
export const BorderInnerIcon = icon("BorderInnerIcon", inner, outer);
export const BorderHorizontalIcon = icon("BorderHorizontalIcon", <path d="M3 12h18" />, <>{outer}<path d="M12 3v18" /></>);
export const BorderVerticalIcon = icon("BorderVerticalIcon", <path d="M12 3v18" />, <>{outer}<path d="M3 12h18" /></>);
export const BorderOuterIcon = icon("BorderOuterIcon", outer, inner);
export const BorderTopIcon = icon("BorderTopIcon", top, <>{outer}{inner}</>);
export const BorderBottomIcon = icon("BorderBottomIcon", bottom, <>{outer}{inner}</>);
export const BorderLeftIcon = icon("BorderLeftIcon", left, <>{outer}{inner}</>);
export const BorderRightIcon = icon("BorderRightIcon", right, <>{outer}{inner}</>);
export const BorderNoneIcon = icon("BorderNoneIcon", null, <>{outer}{inner}</>);

export const MergeIcon = icon("MergeIcon", <><path d="M3 5V3h18v2M3 19v2h18v-2" /><path d="M7 12h10M7 12l3-3M7 12l3 3M17 12l-3-3M17 12l-3 3" /></>);

export const AlignLeftIcon = icon("AlignLeftIcon", <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />);
export const AlignCenterIcon = icon("AlignCenterIcon", <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />);
export const AlignRightIcon = icon("AlignRightIcon", <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />);
export const VAlignTopIcon = icon("VAlignTopIcon", <path d="M4 3h16M12 21V8M8 12l4-4 4 4" />);
export const VAlignMiddleIcon = icon("VAlignMiddleIcon", <path d="M4 12h16M12 3v5M9 5l3 3 3-3M12 21v-5M9 19l3-3 3 3" />);
export const VAlignBottomIcon = icon("VAlignBottomIcon", <path d="M4 21h16M12 3v13M8 12l4 4 4-4" />);

export const WrapOverflowIcon = icon("WrapOverflowIcon", <path d="M4 4v16M20 4v16M8 12h13M18 9l3 3-3 3" />);
export const WrapTextIcon = icon("WrapTextIcon", <path d="M4 4v16M20 4v16M8 8h7a3 3 0 0 1 0 6h-5M12 12l-2 2 2 2" />);
export const WrapClipIcon = icon("WrapClipIcon", <path d="M4 4v16M16 4v16M8 12h8" />);

export const SigmaIcon = icon("SigmaIcon", <path d="M18 5H6l6 7-6 7h12" />);
export const FunctionIcon = icon("FunctionIcon", <path d="M14 4h-1a3 3 0 0 0-3 3v10a3 3 0 0 1-3 3H6M7 10h7M15 13l5 6M20 13l-5 6" />);
export const FilterIcon = icon("FilterIcon", <path d="M3 5h18l-7 8v6l-4 2v-8z" />);
export const ZoomIcon = icon("ZoomIcon", <><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5M8 11h6M11 8v6" /></>);
export const TextIcon = icon("TextIcon", <path d="M5 6V4h14v2M12 4v16M9 20h6" />);
export const FontSizeIcon = icon("FontSizeIcon", <path d="M3 7V5h10v2M8 5v14M6 19h4M14 12v-1h7v1M17.5 11v8M16 19h3" />);
export const GridlinesIcon = icon("GridlinesIcon", <>{outer}<path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></>);
export const FormulaBarIcon = icon("FormulaBarIcon", <><rect x="3" y="7" width="18" height="10" rx="1" /><path d="M7 10.5c0-1 .5-1.5 1.5-1.5M6.5 12h2.5M8 11v4" /></>);
export const SnowflakeIcon = icon("SnowflakeIcon", <path d="M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 4l3 2 3-2M9 20l3-2 3 2" />);
export const DuplicatesIcon = icon("DuplicatesIcon", <><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 14h6" /></>);
export const SortAscIcon = icon("SortAscIcon", <path d="M7 4v16M3 16l4 4 4-4M14 5h7M14 11h5M14 17h3" />);
export const SortDescIcon = icon("SortDescIcon", <path d="M7 4v16M3 16l4 4 4-4M14 5h3M14 11h5M14 17h7" />);
export const PasteIcon = icon("PasteIcon", <><rect x="5" y="4" width="14" height="17" rx="1" /><path d="M9 4V2h6v2M9 10h6M9 14h6" /></>);
export const CutIcon = icon("CutIcon", <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8 16L18 3M16 16L6 3" /></>);
export const InsertRowIcon = icon("InsertRowIcon", <><rect x="3" y="13" width="18" height="7" rx="1" /><path d="M12 3v7M8.5 6.5h7" /></>);
export const InsertColIcon = icon("InsertColIcon", <><rect x="13" y="3" width="7" height="18" rx="1" /><path d="M3 12h7M6.5 8.5v7" /></>);
