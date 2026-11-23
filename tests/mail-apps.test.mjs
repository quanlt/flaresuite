import assert from "node:assert/strict";
import test from "node:test";
import { loadApp } from "./helpers/real-db.mjs";

/** Mail apps through the IMAP/SMTP gateway: app passwords, server settings, and Bcc from the SMTP envelope. */
const { app, newDatabase } = await loadApp("mail-apps", `
	export { withEnvelopeBcc } from "./src/lib/jmap/identities.ts";
	export { mailAppServer } from "./src/lib/auth/mail-apps.ts";
	export { GET as listDevices, POST as createDevice } from "./src/app/api/devices/route.ts";
	export { authenticateApiKeyValue } from "./src/lib/api/key-auth.ts";
`, { mocks: {
	"@/lib/cloudflare": "export function getEnv(){return globalThis.mailAppsEnv}",
	"@/lib/api/auth": "export async function requireSessionUser(){return {user:{id:'u1',email:'ana@acme.test'}}}",
	"@/lib/auth/origin": "export function hasValidSessionMutationOrigin(r){return r.headers.get('origin')==='https://acme.test'}",
} });

test("envelope recipients missing from the headers are sent as Bcc", () => {
	const envelope = { mailFrom: { email: "ana@acme.test" }, rcptTo: [{ email: "bob@x.test" }, { email: "Hidden@Y.test" }, { email: "carol@x.test" }, { email: "bad address" }] };
	assert.equal(app.withEnvelopeBcc("Bob <bob@x.test>", "carol@x.test", null, envelope), "Hidden@Y.test");
	assert.equal(app.withEnvelopeBcc("bob@x.test", null, "dan@z.test", envelope), "dan@z.test, Hidden@Y.test, carol@x.test");
	assert.equal(app.withEnvelopeBcc("bob@x.test", null, "dan@z.test", null), "dan@z.test");
	assert.equal(app.withEnvelopeBcc("bob@x.test", null, null, { rcptTo: [{ email: "BOB@x.test" }] }), null);
});

test("mail server settings come from MAIL_GATEWAY_HOST", () => {
	assert.deepEqual(app.mailAppServer({ MAIL_GATEWAY_HOST: "Mail.FlareSuite.ai" }), { host: "mail.flaresuite.ai", imapPort: 993, smtpPort: 465, submissionPort: 587 });
	assert.equal(app.mailAppServer({}), null);
	assert.equal(app.mailAppServer({ MAIL_GATEWAY_HOST: "bad host/" }), null);
});

test("an app password is a 16-character device key that only grants JMAP, listed under devices", async (t) => {
	const { env } = await newDatabase(t, "INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES ('u1', 'ana@acme.test', 'x', 'Ana', 'admin', 1);");
	globalThis.mailAppsEnv = { ...env, MAIL_GATEWAY_HOST: "mail.flaresuite.ai" };
	t.after(() => { delete globalThis.mailAppsEnv; });
	const post = (body, origin = "https://acme.test") => app.createDevice(new Request("https://acme.test/api/devices", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
	assert.equal((await post({ name: "Outlook" }, "https://evil.test")).status, 403);
	assert.equal((await post({ name: "  " })).status, 400);
	const response = await post({ name: "Outlook on laptop" });
	assert.equal(response.status, 201);
	const created = await response.json();
	assert.match(created.password, /^[0-9A-Za-z]{16}$/);
	assert.equal(created.username, "ana@acme.test");
	assert.equal(created.mailServer.host, "mail.flaresuite.ai");
	const listed = await (await app.listDevices(new Request("https://acme.test/api/devices"))).json();
	assert.deepEqual(listed.devices.map((device) => device.name), ["Outlook on laptop"]);
	const auth = await app.authenticateApiKeyValue(globalThis.mailAppsEnv, created.password);
	assert.ok(auth, "the password authenticates");
	assert.deepEqual(auth.scopes ?? auth.key?.scopes ?? ["jmap"], ["jmap"]);
});
