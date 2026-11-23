export type Box = { x: number; y: number; w: number; h: number };

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

export type ZOrderMove = "forward" | "backward" | "front" | "back";

export type SnapGuide = { orientation: "vertical" | "horizontal"; position: number };

export type SnapResult = { dx: number; dy: number; guides: SnapGuide[] };

export type SlideLayoutId = "title" | "titleBody" | "section" | "twoColumns" | "imageCaption" | "blank";

export type SlideThemeId = "light" | "dark" | "blue" | "warm";

export type SlideTheme = { fontFamily: string; background: string; color: string; accent: string };
