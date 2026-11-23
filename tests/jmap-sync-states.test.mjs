import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-mobile-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

async function bundle(entry, outfile) {
	await build({
		entryPoints: [join(root, entry)],
		outfile: join(outDir, outfile),
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node22",
		logLevel: "silent",
		alias: { "@": join(root, "src") },
	});
	return import(pathToFileURL(join(outDir, outfile)).href);
}

const changes = await bundle("src/lib/jmap/changes-utils.ts", "changes-utils.mjs");

test("JMAP states round-trip and reject other formats", () => {
	assert.deepEqual(changes.parseState(changes.formatState(42, "abcd")), { seq: 42, fingerprint: "abcd" });
	assert.equal(changes.parseState('[["mbx","full_access"]]'), null);
	assert.equal(changes.parseState("c1:-1:abcd"), null);
	assert.equal(changes.parseState(null), null);
});

test("change rows coalesce into JMAP created/updated/destroyed", () => {
	const result = changes.coalesceChanges([
		{ id: "a", change: "created" },
		{ id: "a", change: "updated" },
		{ id: "b", change: "updated" },
		{ id: "c", change: "created" },
		{ id: "c", change: "destroyed" },
		{ id: "d", change: "updated" },
		{ id: "d", change: "destroyed" },
		{ id: "e", change: "destroyed" },
		{ id: "e", change: "created" },
	]);
	assert.deepEqual(result.created, ["a"]);
	assert.deepEqual(result.updated.sort(), ["b", "e"]);
	assert.deepEqual(result.destroyed, ["d"]);
});
