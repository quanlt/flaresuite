import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import bcrypt from "bcryptjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** FlareSuite Cloud creates the first administrator and domain from the sign-up, with the workspace's setup token. */
const directory = mkdtempSync(join(root, "node_modules", "flaresuite-cloud-bootstrap-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `
			export { SqliteDatabase } from "./server/runtime/sqlite-database.ts";
			export { applyMigrations } from "./server/runtime/migrate.ts";
			export { POST as bootstrap } from "./src/app/api/setup/bootstrap/route.ts";
			export { verifyPassword } from "./src/lib/auth/password.ts";
		`,
		resolveDir: root,
		sourcefile: "cloud-bootstrap-entry.ts",
	},
	outfile: join(directory, "entry.mjs"), bundle: true, platform: "node", format: "esm", target: "node24",
	tsconfig: join(root, "tsconfig.json"), packages: "external",
	alias: { "next/headers": "next/headers.js", "next/server": "next/server.js", "cloudflare:workers": "./server/runtime/cloudflare-workers.ts" },
	logLevel: "silent",
});
const { SqliteDatabase, applyMigrations, bootstrap, verifyPassword } = await import(pathToFileURL(join(directory, "entry.mjs")).href);
const HASH = bcrypt.hashSync("correct-horse", 4);

async function fixture(t, extraEnv = { SETUP_TOKEN: "tok-123" }) {
	const database = new SqliteDatabase(":memory:");
	t.after(() => database.db.close());
	await applyMigrations(database, join(root, "drizzle/migrations"));
	globalThis.__mailflareNodeEnv = { DB: database, MAILFLARE_RUNTIME: "node", EMAIL: { configured: true }, ...extraEnv };
	t.after(() => { delete globalThis.__mailflareNodeEnv; });
	t.mock.method(globalThis, "fetch", async (url) => { throw new Error(`no network expected: ${url}`); });
	const call = (body, token = "tok-123") => bootstrap(new Request("https://acme.test/api/setup/bootstrap", {
		method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "X-Setup-Token": token } : {}) }, body: JSON.stringify(body),
	}));
	return { database, call };
}
const BODY = { email: "Admin@Acme.com", name: "Ada Lovelace", passwordHash: HASH, resetEmail: "Ada@Personal.test" };

test("creates the administrator, mailbox and a manually managed domain", async (t) => {
	const f = await fixture(t);
	const response = await f.call(BODY);
	assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
	const user = f.database.db.prepare("SELECT email, name, role, is_primary_admin, password_hash, reset_email FROM users").get();
	assert.equal(user.reset_email, "ada@personal.test");
	assert.equal(user.email, "admin@acme.com");
	assert.equal(user.name, "Ada Lovelace");
	assert.equal(user.role, "admin");
	assert.ok(verifyPassword("correct-horse", user.password_hash));
	const domain = f.database.db.prepare("SELECT hostname, zone_id FROM domains").get();
	assert.deepEqual({ ...domain }, { hostname: "acme.com", zone_id: "manual" });
	assert.equal(f.database.db.prepare("SELECT local_part FROM mailboxes").get().local_part, "admin");
	// A retry with the same address succeeds without creating anything.
	const again = await f.call(BODY);
	assert.equal(again.status, 200);
	assert.equal((await again.json()).alreadyComplete, true);
	assert.equal(f.database.db.prepare("SELECT count(*) AS n FROM users").get().n, 1);
	// Another address cannot take over once an administrator exists.
	assert.equal((await f.call({ ...BODY, email: "eve@acme.com" })).status, 409);
});

test("needs the setup token, and a configured one", async (t) => {
	const f = await fixture(t);
	assert.equal((await f.call(BODY, "wrong")).status, 403);
	assert.equal((await f.call(BODY, null)).status, 403);
	const open = await fixture(t, {});
	assert.equal((await open.call(BODY, null)).status, 403);
	assert.equal(f.database.db.prepare("SELECT count(*) AS n FROM users").get().n, 0);
});

test("accepts only a bcrypt hash and a valid address", async (t) => {
	const f = await fixture(t);
	assert.equal((await f.call({ ...BODY, passwordHash: "correct-horse" })).status, 400);
	assert.equal((await f.call({ ...BODY, email: "admin@localhost" })).status, 400);
	assert.equal((await f.call({ ...BODY, name: " " })).status, 400);
	assert.equal((await f.call({ ...BODY, resetEmail: "nope" })).status, 400);
});
