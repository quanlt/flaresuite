import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * The dark theme remaps the Tailwind palette under .dark (neutral-950 becomes white, accents invert), so a
 * `dark:` palette class is inverted twice: `dark:bg-neutral-950` paints a white card in dark mode. Plain classes
 * already adapt; `dark:` is only for black scrims and the deliberately light compose header.
 */
const ALLOWED = new Set(["src/components/compose/compose-form.tsx"]);
const files = (dir) => readdirSync(dir).flatMap((name) => {
	const path = join(dir, name);
	return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
});

test("components do not add dark: palette colours on top of the remapped palette", () => {
	const offenders = files("src").filter((file) => !ALLOWED.has(file)).flatMap((file) =>
		[...readFileSync(file, "utf8").matchAll(/\bdark:(?:hover:|focus:)?(?:bg|text|border|divide|ring|from|to|via)-(?:white|neutral|gray|slate|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b[\w/-]*/g)].map((match) => `${file}: ${match[0]}`));
	assert.deepEqual(offenders, []);
});
