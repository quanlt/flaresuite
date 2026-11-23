import type { SVGProps } from "react";

/* Toolbar glyphs the shared icon set does not have, drawn in the same 24px stroke style. */

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 18, children, ...props }: GlyphProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
			{children}
		</svg>
	);
}

export const AlignLeftGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /></Glyph>;
export const AlignCenterGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M4 6h16M7 10h10M4 14h16M7 18h10" /></Glyph>;
export const AlignRightGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M4 6h16M10 10h10M4 14h16M10 18h10" /></Glyph>;
export const AlignJustifyGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></Glyph>;
export const RedoGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Glyph>;
export const UndoGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Glyph>;
export const IndentGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M4 5h16M11 10h9M11 14h9M4 19h16M4 9l3 3-3 3" /></Glyph>;
export const OutdentGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M4 5h16M11 10h9M11 14h9M4 19h16M7 9l-3 3 3 3" /></Glyph>;
export const TableGlyph = (props: GlyphProps) => <Glyph {...props}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10" /></Glyph>;
export const UnlinkGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 2.9 9.1M8 12h3M4 4l16 16" /></Glyph>;
export const PageBreakGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M6 3v5h12V3M6 21v-5h12v5M3 12h2M8 12h3M13 12h3M19 12h2" /></Glyph>;
export const PrintGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" rx="1" /></Glyph>;
export const PageSetupGlyph = (props: GlyphProps) => <Glyph {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Glyph>;

/** "A" with a colour bar underneath, for text colour and highlight. */
export function ColorGlyph({ color, highlight, size = 18 }: { color: string; highlight?: boolean; size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
			{highlight
				? <path d="M8 14l-2 4h5l1-1M8 14l6-9 4 3-6 9z" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
				: <path d="M7 17L12 4l5 13M8.8 12.5h6.4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
			<rect x="3" y="19.5" width="18" height="3" rx="1" fill={color} stroke="rgb(0 0 0 / 0.15)" strokeWidth={0.5} />
		</svg>
	);
}
