import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(root, "node_modules", "flaresuite-office-slides-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `export * from "./src/components/office/slides/slides-utils.ts"; export { validateOfficeContent } from "./src/lib/office/utils.ts";`,
		resolveDir: root,
		sourcefile: "office-slides-entry.ts",
	},
	outfile: join(directory, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
	packages: "external",
	logLevel: "silent",
});
const slides = await import(pathToFileURL(join(directory, "entry.mjs")).href);
const { applyResize, rotationFromPointer, computeSnap, alignElements, moveZ, moveItem, cloneSlide, createSlide, createElement, applyTheme, themeIdOf, isHtmlEmpty, safeImageSrc, fitSize, buildPresentationHtml, boundsOf, SLIDE_THEMES, SLIDE_LAYOUTS, validateOfficeContent } = slides;
const { shapePoints, hasTextBody, presentableIndices, presentStart, applyLayout, safeFontFamily, elementSurfaceStyle, shapeSvgAttributes, FONT_FAMILIES } = slides;

const el = (id, x = 0, y = 0, w = 100, h = 50) => ({ id, type: "rect", x, y, w, h });

test("resizing from the east handle grows the width and keeps the left edge", () => {
	assert.deepEqual(applyResize({ x: 100, y: 100, w: 200, h: 100 }, "e", 50, 30), { x: 100, y: 100, w: 250, h: 100 });
});

test("resizing from the north-west handle keeps the bottom-right corner", () => {
	const box = applyResize({ x: 100, y: 100, w: 200, h: 100 }, "nw", -20, -10);
	assert.deepEqual(box, { x: 80, y: 90, w: 220, h: 110 });
});

test("resize never goes below the minimum size", () => {
	const box = applyResize({ x: 0, y: 0, w: 40, h: 40 }, "se", -100, -100, { min: 8 });
	assert.equal(box.w, 8);
	assert.equal(box.h, 8);
	assert.equal(box.x, 0);
	assert.equal(box.y, 0);
});

test("a corner resize can keep the aspect ratio", () => {
	const box = applyResize({ x: 0, y: 0, w: 200, h: 100 }, "se", 100, 0, { keepRatio: true });
	assert.equal(box.w / box.h, 2);
	assert.equal(box.w, 300);
});

test("a rotated element resizes along its own axis", () => {
	// Rotated 90°: dragging the east handle downwards on screen lengthens the element.
	const box = applyResize({ x: 0, y: 0, w: 100, h: 20, rotation: 90 }, "e", 0, 40);
	assert.equal(box.w, 140);
	assert.equal(box.h, 20);
});

test("rotation follows the pointer and snaps to 15° with Shift", () => {
	const box = { x: 0, y: 0, w: 100, h: 100 };
	assert.equal(rotationFromPointer(box, 50, -100), 0);
	assert.equal(rotationFromPointer(box, 200, 50), 90);
	assert.equal(rotationFromPointer(box, 160, -40, true) % 15, 0);
});

test("moving snaps to the slide centre and returns a guide", () => {
	const result = computeSnap({ x: 0, y: 0, w: 100, h: 100 }, 427, 10, []);
	assert.equal(result.dx, 430); // centre at 480
	assert.ok(result.guides.some((guide) => guide.orientation === "vertical" && guide.position === 480));
});

test("moving snaps to another element's edge", () => {
	const result = computeSnap({ x: 0, y: 300, w: 50, h: 50 }, 198, 0, [{ x: 250, y: 0, w: 20, h: 20 }]);
	assert.equal(result.dx, 200); // right edge meets the other's left edge at 250
});

test("snapping leaves far moves alone", () => {
	const result = computeSnap({ x: 100, y: 100, w: 10, h: 10 }, 33, 47, []);
	assert.equal(result.dx, 33);
	assert.equal(result.dy, 47);
	assert.equal(result.guides.length, 0);
});

test("aligning to the slide moves only the chosen elements", () => {
	const aligned = alignElements([el("a", 10, 10), el("b", 20, 20)], ["a"], "right");
	assert.equal(aligned[0].x, 860);
	assert.equal(aligned[1].x, 20);
	assert.equal(alignElements([el("a")], ["a"], "middle")[0].y, 245);
	assert.equal(alignElements([el("a")], ["a"], "center")[0].x, 430);
});

test("stacking order moves", () => {
	const list = [el("a"), el("b"), el("c")];
	assert.deepEqual(moveZ(list, ["a"], "front").map((entry) => entry.id), ["b", "c", "a"]);
	assert.deepEqual(moveZ(list, ["c"], "back").map((entry) => entry.id), ["c", "a", "b"]);
	assert.deepEqual(moveZ(list, ["a"], "forward").map((entry) => entry.id), ["b", "a", "c"]);
	assert.deepEqual(moveZ(list, ["c"], "backward").map((entry) => entry.id), ["a", "c", "b"]);
	assert.deepEqual(moveZ(list, ["c"], "forward").map((entry) => entry.id), ["a", "b", "c"]);
});

test("slides reorder", () => {
	assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
	assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
	assert.deepEqual(moveItem(["a", "b"], 5, 0), ["a", "b"]);
});

test("cloned slides get fresh ids everywhere", () => {
	const slide = createSlide("titleBody", SLIDE_THEMES.light, { title: "Hello" });
	const copy = cloneSlide(slide);
	assert.notEqual(copy.id, slide.id);
	assert.equal(copy.elements.length, slide.elements.length);
	for (let index = 0; index < copy.elements.length; index += 1) assert.notEqual(copy.elements[index].id, slide.elements[index].id);
	assert.equal(copy.elements[0].html, "Hello");
});

test("every layout builds a slide a presentation accepts", () => {
	const deck = { slides: SLIDE_LAYOUTS.map((layout) => createSlide(layout, SLIDE_THEMES.dark)) };
	assert.equal(validateOfficeContent("presentation", deck), null);
	assert.equal(deck.slides.find((slide, index) => SLIDE_LAYOUTS[index] === "blank").elements.length, 0);
	for (const slide of deck.slides) for (const element of slide.elements) {
		assert.ok(element.x >= 0 && element.y >= 0 && element.x + element.w <= 960 && element.y + element.h <= 540, `${element.id} stays on the slide`);
	}
});

test("new elements are centred and typed", () => {
	const text = createElement("text", SLIDE_THEMES.light);
	assert.equal(text.x + text.w / 2, 480);
	assert.equal(text.html, "");
	const shape = createElement("rect", SLIDE_THEMES.blue, { style: { radius: 16 } });
	assert.equal(shape.style.radius, 16);
	assert.equal(shape.style.fill, SLIDE_THEMES.blue.accent);
});

test("changing theme recolours theme-coloured items and keeps custom colours", () => {
	const theme = SLIDE_THEMES.light;
	const content = {
		theme: { ...theme },
		slides: [{ id: "s", background: "#123456", elements: [
			{ id: "a", type: "text", x: 0, y: 0, w: 10, h: 10, style: { color: theme.color } },
			{ id: "b", type: "rect", x: 0, y: 0, w: 10, h: 10, style: { fill: theme.accent, color: "#ff0000" } },
		] }],
	};
	const next = applyTheme(content, "dark");
	assert.equal(themeIdOf(next), "dark");
	assert.equal(next.slides[0].background, undefined);
	assert.equal(next.slides[0].elements[0].style.color, SLIDE_THEMES.dark.color);
	assert.equal(next.slides[0].elements[1].style.fill, SLIDE_THEMES.dark.accent);
	assert.equal(next.slides[0].elements[1].style.color, "#ff0000");
	assert.equal(content.slides[0].background, "#123456", "the original is not mutated");
	assert.equal(themeIdOf({ theme: { background: "#abcdef" } }), null);
});

test("empty rich text is detected", () => {
	assert.equal(isHtmlEmpty(""), true);
	assert.equal(isHtmlEmpty("<p><br></p>"), true);
	assert.equal(isHtmlEmpty("<p>&nbsp;</p>"), true);
	assert.equal(isHtmlEmpty("<p>Hi</p>"), false);
	assert.equal(isHtmlEmpty('<img src="x">'), false);
});

test("image sources are limited to https and inline images", () => {
	assert.equal(safeImageSrc("javascript:alert(1)"), null);
	assert.equal(safeImageSrc("http://example.com/a.png"), null);
	assert.equal(safeImageSrc("data:image/svg+xml;base64,AAAA"), null);
	assert.equal(safeImageSrc("https://example.com/a.png"), "https://example.com/a.png");
	assert.equal(safeImageSrc("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
});

test("images fit inside the default box keeping their ratio", () => {
	assert.deepEqual(fitSize(1200, 600), { w: 600, h: 300 });
	assert.deepEqual(fitSize(100, 50), { w: 100, h: 50 });
	assert.deepEqual(boundsOf([el("a", 10, 20, 30, 40), el("b", 100, 0, 10, 10)]), { x: 10, y: 0, w: 100, h: 60 });
});

test("the HTML export is self-contained and runs rich text through the sanitizer", () => {
	const content = {
		theme: { ...SLIDE_THEMES.light },
		slides: [
			{ id: "s1", elements: [{ id: "t", type: "text", x: 0, y: 0, w: 100, h: 50, html: "<p>Hello<script>bad()</script></p>" }, { id: "i", type: "image", x: 0, y: 0, w: 10, h: 10, src: "javascript:alert(1)" }] },
			{ id: "s2", background: "#000000", elements: [] },
		],
	};
	const html = buildPresentationHtml(content, "My <deck>", (value) => value.replace(/<script>.*?<\/script>/g, ""));
	assert.match(html, /<title>My &lt;deck&gt;<\/title>/);
	assert.equal((html.match(/<section class="slide"/g) ?? []).length, 2);
	assert.ok(html.includes("<p>Hello</p>"));
	assert.ok(!html.includes("bad()"));
	assert.ok(!html.includes("javascript:alert"));
	assert.ok(html.includes("ArrowRight"));
	assert.ok(!/<(script|link)[^>]+src=/i.test(html), "no external resources");
});

test("triangles and arrows are text shapes drawn as polygons that fill their box", () => {
	assert.equal(shapePoints("triangle", 100, 80), "50,0 100,80 0,80");
	const arrow = shapePoints("arrow", 200, 100).split(" ").map((point) => point.split(",").map(Number));
	assert.equal(arrow.length, 7);
	assert.deepEqual(arrow[3], [200, 50], "the tip is at the right middle");
	assert.ok(arrow.every(([x, y]) => x >= 0 && x <= 200 && y >= 0 && y <= 100));
	assert.equal(hasTextBody("triangle"), true);
	assert.equal(hasTextBody("arrow"), true);
	assert.equal(hasTextBody("line"), false);
	assert.equal(hasTextBody("image"), false);
	const triangle = createElement("triangle", SLIDE_THEMES.light);
	assert.equal(triangle.html, "");
	assert.equal(triangle.style.fill, SLIDE_THEMES.light.accent);
	assert.equal(triangle.x + triangle.w / 2, 480);
});

test("polygon shapes paint their fill and border in the SVG, not the text box", () => {
	const arrow = { id: "a", type: "arrow", x: 0, y: 0, w: 200, h: 100, style: { fill: "#ff0000", stroke: "#000000", strokeWidth: 2 } };
	const surface = elementSurfaceStyle(arrow, SLIDE_THEMES.light);
	assert.equal(surface.background, "transparent");
	assert.equal(surface.border, undefined);
	const svg = shapeSvgAttributes(arrow, SLIDE_THEMES.light);
	assert.equal(svg.fill, "#ff0000");
	assert.equal(svg.stroke, "#000000");
	assert.equal(shapeSvgAttributes({ ...arrow, style: { fill: "transparent" } }, SLIDE_THEMES.light).fill, "none");
	assert.equal(shapeSvgAttributes({ ...arrow, style: {} }, SLIDE_THEMES.light).stroke, "none");
});

test("underline and font family are element styles, and unsafe fonts fall back", () => {
	const text = { id: "t", type: "text", x: 0, y: 0, w: 10, h: 10, style: { underline: true, fontFamily: FONT_FAMILIES[4].value } };
	const css = elementSurfaceStyle(text, SLIDE_THEMES.light);
	assert.equal(css.textDecoration, "underline");
	assert.equal(css.fontFamily, FONT_FAMILIES[4].value);
	assert.equal(safeFontFamily("Arial; background:url(x)", "Inter"), "Inter");
	assert.equal(safeFontFamily(undefined, "Inter"), "Inter");
	for (const font of FONT_FAMILIES) assert.equal(safeFontFamily(font.value, "x"), font.value);
});

test("skipped slides are left out of the slideshow", () => {
	const slides = [{}, { skipped: true }, {}, { skipped: true }];
	assert.deepEqual(presentableIndices(slides), [0, 2]);
	assert.equal(presentStart(slides, 1), 2, "starting on a skipped slide begins at the next shown one");
	assert.equal(presentStart(slides, 3), 2, "after the last shown slide it starts at the last shown one");
	assert.deepEqual(presentableIndices([{ skipped: true }, { skipped: true }]), [0, 1], "a deck that skips everything still plays");
	assert.deepEqual(presentableIndices([]), []);
});

test("applying a layout moves text into its placeholders and keeps everything else", () => {
	const theme = SLIDE_THEMES.light;
	const slide = {
		id: "s",
		notes: "keep me",
		elements: [
			{ id: "title", type: "text", x: 5, y: 5, w: 100, h: 40, html: "<p>Title</p>", style: { fontSize: 30, color: "#ff0000" } },
			{ id: "pic", type: "image", x: 10, y: 10, w: 50, h: 50, src: "https://example.com/a.png" },
			{ id: "body", type: "text", x: 5, y: 60, w: 100, h: 40, html: "<p>Body</p>" },
			{ id: "extra", type: "text", x: 5, y: 120, w: 100, h: 40, html: "<p>Extra</p>" },
		],
	};
	const next = applyLayout(slide, "titleBody", theme);
	const reference = createSlide("titleBody", theme);
	const title = next.elements.find((element) => element.id === "title");
	assert.equal(title.html, "<p>Title</p>");
	assert.equal(title.x, reference.elements[0].x);
	assert.equal(title.style.fontSize, reference.elements[0].style.fontSize);
	assert.equal(title.style.color, "#ff0000", "a custom colour survives");
	assert.equal(next.elements.find((element) => element.id === "body").y, reference.elements[1].y);
	assert.ok(next.elements.some((element) => element.id === "pic"), "images stay");
	assert.ok(next.elements.some((element) => element.id === "extra"), "text without a placeholder stays");
	assert.equal(next.notes, "keep me");
	assert.equal(next.id, "s");
	const section = applyLayout(applyLayout(slide, "section", theme), "section", theme);
	assert.equal(section.elements.filter((element) => element.type === "rect").length, 1, "decorations are not added twice");
	const twoColumns = applyLayout({ id: "e", elements: [] }, "twoColumns", theme);
	assert.equal(twoColumns.elements.length, 3, "an empty slide gets empty placeholders");
});

test("new shape types, underline and skipped slides load and validate", () => {
	const deck = { slides: [{ id: "s", skipped: true, elements: [createElement("triangle", SLIDE_THEMES.light), createElement("arrow", SLIDE_THEMES.light), { id: "t", type: "text", x: 0, y: 0, w: 10, h: 10, style: { underline: true } }] }] };
	assert.equal(validateOfficeContent("presentation", deck), null);
});

test("the HTML export draws polygons and leaves skipped slides out", () => {
	const content = {
		theme: { ...SLIDE_THEMES.light },
		slides: [
			{ id: "s1", elements: [{ id: "a", type: "triangle", x: 0, y: 0, w: 100, h: 80, html: "<p>Up</p>", style: { fill: "#00ff00" } }] },
			{ id: "s2", skipped: true, elements: [] },
			{ id: "s3", elements: [{ id: "u", type: "unknown-future-type", x: 0, y: 0, w: 1, h: 1 }] },
		],
	};
	const html = buildPresentationHtml(content, "Deck", (value) => value);
	assert.equal((html.match(/<section class="slide"/g) ?? []).length, 2);
	assert.ok(html.includes('<polygon points="50,0 100,80 0,80" fill="#00ff00"'));
	assert.ok(html.includes("<p>Up</p>"));
	assert.ok(!html.includes("unknown-future-type"));
});
