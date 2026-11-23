import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number | string };

/** Small stroke icons the shared icon set does not have, drawn in the same 24px style. */
function make(paths: ReactNode, displayName: string) {
	function Icon({ size = 16, ...props }: IconProps) {
		return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths}</svg>;
	}
	Icon.displayName = displayName;
	return Icon;
}

export const RedoIcon = make(<><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>, "RedoIcon");
export const TextBoxIcon = make(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h8M12 9v7" /></>, "TextBoxIcon");
export const ShapesIcon = make(<><rect x="3" y="11" width="10" height="10" rx="1" /><circle cx="16" cy="8" r="5" /></>, "ShapesIcon");
export const RectIcon = make(<rect x="3" y="6" width="18" height="12" />, "RectIcon");
export const RoundRectIcon = make(<rect x="3" y="6" width="18" height="12" rx="4" />, "RoundRectIcon");
export const EllipseIcon = make(<ellipse cx="12" cy="12" rx="9" ry="7" />, "EllipseIcon");
export const LineIcon = make(<path d="M4 20L20 4" />, "LineIcon");
export const AlignCenterIcon = make(<path d="M4 6h16M7 12h10M5 18h14" />, "AlignCenterIcon");
export const AlignRightIcon = make(<path d="M4 6h16M10 12h10M6 18h14" />, "AlignRightIcon");
export const AlignLeftIcon = make(<path d="M4 6h16M4 12h10M4 18h14" />, "AlignLeftIcon");
export const VAlignTopIcon = make(<><path d="M4 4h16" /><path d="M12 20V8M8 12l4-4 4 4" /></>, "VAlignTopIcon");
export const VAlignMiddleIcon = make(<><path d="M4 12h16" /><path d="M12 3v5M9 6l3 2 3-2M12 21v-5M9 18l3-2 3 2" /></>, "VAlignMiddleIcon");
export const VAlignBottomIcon = make(<><path d="M4 20h16" /><path d="M12 4v12M8 12l4 4 4-4" /></>, "VAlignBottomIcon");
export const ArrangeIcon = make(<><rect x="3" y="3" width="11" height="11" rx="1" /><rect x="10" y="10" width="11" height="11" rx="1" /></>, "ArrangeIcon");
export const FillIcon = make(<><path d="M5 11l7-7 7 7-7 7z" /><path d="M20 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z" /></>, "FillIcon");
export const BorderIcon = make(<rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 2" />, "BorderIcon");
export const TextColorIcon = make(<><path d="M7 16l5-12 5 12M9 12h6" /><path d="M4 20h16" /></>, "TextColorIcon");
export const BackgroundIcon = make(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" /></>, "BackgroundIcon");
export const TriangleIcon = make(<path d="M12 4l9 16H3z" />, "TriangleIcon");
export const ArrowShapeIcon = make(<path d="M3 9h10V5l8 7-8 7v-4H3z" />, "ArrowShapeIcon");
export const CursorIcon = make(<path d="M5 3l14 8-6 1.5L10 19z" />, "CursorIcon");
export const GridIcon = make(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>, "GridIcon");
export const FilmstripIcon = make(<><rect x="3" y="4" width="6" height="16" rx="1" /><rect x="12" y="4" width="9" height="16" rx="1" /></>, "FilmstripIcon");
export const NotesIcon = make(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15h18M7 18h8" /></>, "NotesIcon");
export const ZoomIcon = make(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4M8 11h6M11 8v6" /></>, "ZoomIcon");
export const LayoutIcon = make(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M10 9v11" /></>, "LayoutIcon");
