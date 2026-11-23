import assert from "node:assert/strict";
import test from "node:test";
import { loadApp } from "./helpers/real-db.mjs";

/** Mail apps through the IMAP/SMTP gateway: server settings and Bcc from the SMTP envelope (app passwords: app-passwords.test.mjs). */
const { app, newDatabase } = await loadApp("mail-apps", `
	export { withEnvelopeBcc } from "./src/lib/jmap/identities.ts";
	export { mailAppServer } from "./src/lib/auth/mail-apps.ts";
	export { appleProfileUrl } from "./src/components/settings/app-password-settings-utils.ts";
`, { mocks: {
	"@/lib/cloudflare": "export function getEnv(){return globalThis.mailAppsEnv}",
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
	assert.equal(app.appleProfileUrl("mail.flaresuite.ai", "ana+work@acme.test"), "https://mail.flaresuite.ai/apple/mail.mobileconfig?email=ana%2Bwork%40acme.test");
	assert.equal(app.mailAppServer({ MAIL_GATEWAY_HOST: "bad host/" }), null);
});
