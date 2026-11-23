import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(root, "node_modules", "flaresuite-setup-token-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: { contents: `export * from "./src/lib/auth/setup-token.ts"; export { readManagedPlan } from "./src/lib/licenses/utils.ts"; export { resolveAppName } from "./src/lib/branding/utils.ts"; export { getSetupRequirementChecks } from "./src/lib/setup/configuration.ts";`, resolveDir: root, sourcefile: "entry.ts" },
	outfile: join(directory, "entry.mjs"), bundle: true, platform: "node", format: "esm", target: "node24",
	tsconfig: join(root, "tsconfig.json"), packages: "external", logLevel: "silent",
});
const m = await import(pathToFileURL(join(directory, "entry.mjs")).href);

test("without SETUP_TOKEN setup stays open", () => {
	assert.equal(m.isSetupTokenRequired({}), false);
	assert.equal(m.matchesSetupToken({}, null), true);
	assert.equal(m.matchesSetupToken({ SETUP_TOKEN: "  " }, null), true);
});

test("with SETUP_TOKEN only the exact token is accepted", () => {
	const env = { SETUP_TOKEN: "s3cret-token" };
	assert.equal(m.isSetupTokenRequired(env), true);
	assert.equal(m.matchesSetupToken(env, "s3cret-token"), true);
	assert.equal(m.matchesSetupToken(env, "s3cret-tokem"), false);
	assert.equal(m.matchesSetupToken(env, "s3cret-token-longer"), false);
	assert.equal(m.matchesSetupToken(env, ""), false);
	assert.equal(m.matchesSetupToken(env, null), false);
});

test("the token is read from the header or the claim cookie", () => {
	assert.equal(m.setupTokenFromRequest(new Request("https://x.test", { headers: { "X-Setup-Token": " abc " } })), "abc");
	assert.equal(m.setupTokenFromRequest(new Request("https://x.test", { headers: { Cookie: `a=1; ${m.SETUP_TOKEN_COOKIE}=t%2Fk; b=2` } })), "t/k");
	assert.equal(m.setupTokenFromRequest(new Request("https://x.test")), null);
});

test("managed plans come only from pro or team with an optional seat limit", () => {
	assert.equal(m.readManagedPlan({}), null);
	assert.equal(m.readManagedPlan({ MANAGED_PLAN: "enterprise" }), null);
	assert.deepEqual(m.readManagedPlan({ MANAGED_PLAN: "Team" }), { plan: "team", seatLimit: null });
	assert.deepEqual(m.readManagedPlan({ MANAGED_PLAN: "pro", MANAGED_SEAT_LIMIT: "5" }), { plan: "pro", seatLimit: 5 });
	assert.deepEqual(m.readManagedPlan({ MANAGED_PLAN: "pro", MANAGED_SEAT_LIMIT: "0" }), { plan: "pro", seatLimit: null });
});

test("the legacy seeded name counts as the default FlareSuite name", () => {
	assert.equal(m.resolveAppName("Mailflare"), "FlareSuite");
	assert.equal(m.resolveAppName(null), "FlareSuite");
	assert.equal(m.resolveAppName("  "), "FlareSuite");
	assert.equal(m.resolveAppName("Acme Mail"), "Acme Mail");
});

test("a managed workspace does not need a server-wide mailer to finish setup", () => {
	const nodeEnv = (extra) => ({ MAILFLARE_RUNTIME: "node", DB: {}, EMAIL: { configured: false }, ...extra });
	const selfHosted = m.getSetupRequirementChecks(nodeEnv({}));
	assert.equal(selfHosted.find((check) => check.key === "Outbound mail").configured, false);
	const managed = m.getSetupRequirementChecks(nodeEnv({ MANAGED_PLAN: "pro" }));
	assert.ok(managed.every((check) => check.configured), JSON.stringify(managed));
	assert.match(managed.find((check) => check.key.startsWith("Outbound mail")).message, /Resend|SES/);
});
