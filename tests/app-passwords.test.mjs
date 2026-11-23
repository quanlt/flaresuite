import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(root, "node_modules", "mailflare-app-passwords-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

await build({
	stdin: {
		contents: `
			export { SqliteDatabase } from "./server/runtime/sqlite-database.ts";
			export { applyMigrations } from "./server/runtime/migrate.ts";
			export { createSession, deleteUserSessions } from "./src/lib/auth/session.ts";
			export { authenticateApiRequest, authenticateApiKeyValue } from "./src/lib/api/key-auth.ts";
			export { clearApiKeyVerificationCache } from "./src/lib/api/find-api-key.ts";
			export * as list from "./src/app/api/app-passwords/route.ts";
			export * as one from "./src/app/api/app-passwords/[id]/route.ts";
			export * as apiKeys from "./src/app/api/api-keys/route.ts";
		`,
		resolveDir: root,
		sourcefile: "app-passwords-entry.ts",
	},
	outfile: join(outDir, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	tsconfig: join(root, "tsconfig.json"),
	packages: "external",
	alias: { "next/headers": "next/headers.js", "next/server": "next/server.js", "cloudflare:workers": "./server/runtime/cloudflare-workers.ts" },
	logLevel: "silent",
});

const { SqliteDatabase, applyMigrations, createSession, deleteUserSessions, authenticateApiRequest, authenticateApiKeyValue, clearApiKeyVerificationCache, list, one, apiKeys } =
	await import(pathToFileURL(join(outDir, "entry.mjs")).href);

async function fixture(t) {
	clearApiKeyVerificationCache();
	const database = new SqliteDatabase(":memory:");
	await applyMigrations(database, join(root, "drizzle/migrations"));
	database.db.prepare("INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES ('u1', 'ana@acme.test', 'Ana', 'x', 'admin', 1)").run();
	const env = { DB: database, MAILFLARE_RUNTIME: "node", MAIL_GATEWAY_HOST: "mail.flaresuite.ai" };
	globalThis.__mailflareNodeEnv = env;
	t.after(() => { delete globalThis.__mailflareNodeEnv; database.db.close(); });
	const session = await createSession(env, "u1");
	const request = (path, init = {}) => new Request(`https://mail.acme.test${path}`, {
		...init,
		headers: { Authorization: `Bearer ${session}`, Origin: "https://mail.acme.test", "Content-Type": "application/json", ...init.headers },
	});
	const basic = (password) => new Request("https://mail.acme.test/jmap/session", { headers: { Authorization: `Basic ${Buffer.from(`ana@acme.test:${password}`).toString("base64")}` } });
	return { database, env, request, basic };
}

test("an app password is created, signs mail apps in for mail only, and is revoked", async (t) => {
	const f = await fixture(t);
	const created = await list.POST(f.request("/api/app-passwords", { method: "POST", body: JSON.stringify({ name: "Outlook on my laptop" }) }));
	assert.equal(created.status, 201);
	const body = await created.json();
	assert.match(body.password, /^[0-9A-Za-z]{16}$/);
	assert.equal(body.username, "ana@acme.test");
	assert.deepEqual(body.mailServer, { host: "mail.flaresuite.ai", imapPort: 993, smtpPort: 465, submissionPort: 587 });

	// Stored apart from API keys, hashed.
	assert.equal(f.database.db.prepare("SELECT COUNT(*) AS n FROM api_keys").get().n, 0);
	const row = f.database.db.prepare("SELECT * FROM app_passwords").get();
	assert.equal(row.name, "Outlook on my laptop");
	assert.notEqual(row.password_sha256, body.password);

	// The gateway signs in with HTTP Basic; spaces as shown ("abcd efgh …") are accepted too.
	const auth = await authenticateApiRequest(f.env, f.basic(body.password));
	assert.equal(auth.keyKind, "app_password");
	assert.deepEqual(auth.scopes, ["jmap"]);
	assert.equal(auth.mailboxIds, null);
	assert.equal((await authenticateApiRequest(f.env, f.basic(body.password.replace(/(.{4})(?=.)/g, "$1 "))))?.userId, "u1");
	// Never an API key: the REST API (Bearer through authenticateApiKeyValue) does not take it.
	assert.equal(await authenticateApiKeyValue(f.env, body.password), null);

	const listed = await (await list.GET(f.request("/api/app-passwords"))).json();
	assert.equal(listed.appPasswords.length, 1);
	assert.equal(listed.appPasswords[0].lastUsedAt !== null, true);
	assert.equal((await (await apiKeys.GET(f.request("/api/api-keys"))).json()).apiKeys.length, 0);

	const revoked = await one.DELETE(f.request(`/api/app-passwords/${body.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: body.id }) });
	assert.equal(revoked.status, 200);
	assert.equal(await authenticateApiRequest(f.env, f.basic(body.password)), null);
});

test("changing the password revokes every app password", async (t) => {
	const f = await fixture(t);
	const body = await (await list.POST(f.request("/api/app-passwords", { method: "POST", body: JSON.stringify({ name: "iPhone" }) }))).json();
	await deleteUserSessions(f.env, "u1");
	assert.equal(await authenticateApiRequest(f.env, f.basic(body.password)), null);
	assert.equal(f.database.db.prepare("SELECT COUNT(*) AS n FROM app_passwords").get().n, 0);
});

test("the migration moves app passwords out of api_keys and drops mobile push registrations", async (t) => {
	const database = new SqliteDatabase(":memory:");
	t.after(() => database.db.close());
	const dir = join(root, "drizzle/migrations");
	// Every migration before 0094, then a device key as the gateway's app passwords were stored.
	const journal = JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8"));
	const before = mkdtempSync(join(outDir, "migrations-"));
	const { cpSync, mkdirSync, writeFileSync } = await import("node:fs");
	mkdirSync(join(before, "meta"));
	const kept = journal.entries.filter((entry) => entry.tag !== "0094_app_passwords");
	for (const entry of kept) cpSync(join(dir, `${entry.tag}.sql`), join(before, `${entry.tag}.sql`));
	writeFileSync(join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries: kept }));
	await applyMigrations(database, before);
	database.db.prepare("INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES ('u1', 'ana@acme.test', 'Ana', 'x', 'admin', 1)").run();
	database.db.prepare("INSERT INTO api_keys (id, user_id, name, prefix, key_hash, key_sha256, kind, scopes, created_at, last_used_at) VALUES ('key_old', 'u1', 'Outlook', 'abcdef', 'h', 'deadbeef', 'device', '[\"jmap\"]', 10, 20)").run();
	database.db.prepare("INSERT INTO api_keys (id, user_id, name, prefix, key_hash, key_sha256, kind, scopes, created_at) VALUES ('key_api', 'u1', 'Script', 'ep_x', 'h2', 'cafe', 'legacy', '[\"read\"]', 10)").run();
	await applyMigrations(database, dir);
	assert.deepEqual(database.db.prepare("SELECT id, user_id, name, prefix, password_sha256, created_at, last_used_at FROM app_passwords").all(), [
		{ id: "key_old", user_id: "u1", name: "Outlook", prefix: "abcdef", password_sha256: "deadbeef", created_at: 10, last_used_at: 20 },
	]);
	assert.deepEqual(database.db.prepare("SELECT id FROM api_keys").all(), [{ id: "key_api" }]);
	assert.equal(database.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'push_devices'").get().n, 0);
});
