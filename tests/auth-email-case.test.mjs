import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(root, "tests", ".tmp-auth-email-case-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `export { loginSchema } from "./src/lib/validators.ts";`,
		resolveDir: root,
		sourcefile: "auth-email-case-entry.ts",
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
const { loginSchema } = await import(pathToFileURL(join(directory, "entry.mjs")).href);

test("web login matches the lowercase stored email", () => {
	assert.equal(loginSchema.parse({ email: "  Alice@Example.COM ", password: "x" }).email, "alice@example.com");
});
