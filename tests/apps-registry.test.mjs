import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(root, "node_modules", "flaresuite-apps-registry-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `export { APPS, visibleApps } from "./src/lib/apps/registry.ts";`,
		resolveDir: root,
		sourcefile: "apps-registry-entry.ts",
	},
	outfile: join(directory, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
	packages: "external",
	jsx: "automatic",
	logLevel: "silent",
});
const { APPS, visibleApps } = await import(pathToFileURL(join(directory, "entry.mjs")).href);

test("app ids and routes are unique", () => {
	assert.equal(new Set(APPS.map((app) => app.id)).size, APPS.length);
	assert.equal(new Set(APPS.map((app) => app.href)).size, APPS.length);
});

test("apps launcher keeps the built-in order for a full account", () => {
	assert.deepEqual(visibleApps({ calendarEnabled: true, driveEnabled: true }).map((app) => app.id), ["mail", "calendar", "drive", "docs", "sheets", "slides", "contacts"]);
});

test("apps turned off for an account are hidden, including the Drive-backed editors", () => {
	assert.deepEqual(visibleApps({ calendarEnabled: false, driveEnabled: false }).map((app) => app.id), ["mail", "contacts"]);
});

test("an unknown user still sees every app that is not explicitly turned off", () => {
	assert.deepEqual(visibleApps(null).map((app) => app.id), ["mail", "calendar", "drive", "docs", "sheets", "slides", "contacts"]);
});

test("every label key exists in the English messages", async () => {
	const { default: en } = await import(pathToFileURL(join(root, "src/lib/i18n/en.json")).href, { with: { type: "json" } });
	for (const app of APPS) assert.ok(en[app.labelKey], `missing ${app.labelKey}`);
});
