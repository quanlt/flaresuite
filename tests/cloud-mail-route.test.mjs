import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";
import { build } from "esbuild";

/** The Domains page of a FlareSuite Cloud workspace reads its DNS records from the Cloud, with the workspace's secret. */
const project = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(project, "tests", ".tmp-cloud-mail-"));
const realFetch = globalThis.fetch;
after(() => { rmSync(temporary, { recursive: true, force: true }); delete globalThis.cloudMailEnv; delete globalThis.cloudMailUser; globalThis.fetch = realFetch; });
const mocks = {
	"@/lib/cloudflare": "export function getEnv(){return globalThis.cloudMailEnv}",
	"@/lib/auth/cookies": "export async function requireUser(){return globalThis.cloudMailUser}",
	"@/lib/auth/admin": "export function canManageDomains(user){return !!user.canManageDomains}",
	"@/lib/auth/origin": "export function hasValidSessionMutationOrigin(request){return request.headers.get('origin') === 'https://acme.flaresuite.ai'}",
	"next/server": "export const NextResponse = { json: (body, init) => Response.json(body, init) }",
};
await build({ entryPoints: [join(project, "src/app/api/cloud-mail/route.ts")], outfile: join(temporary, "route.mjs"), bundle: true, platform: "node", format: "esm", packages: "external", alias: { "@": join(project, "src") }, logLevel: "silent", plugins: [{ name: "route-fixtures", setup(builder) {
	builder.onResolve({ filter: /^@\/lib\/(cloudflare|auth\/cookies|auth\/admin|auth\/origin)$|^next\/server$/ }, args => ({ path: args.path, namespace: "mock" }));
	builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
} }] });
const { GET, POST } = await import(pathToFileURL(join(temporary, "route.mjs")).href);

const ENV = { MANAGED_MAIL: "1", CLOUD_API_URL: "http://cloud:3000/", CLOUD_WORKSPACE_ID: "ws_1", INBOUND_WEBHOOK_SECRET: "s3cret", APP_URL: "https://acme.flaresuite.ai" };
function fixture(t, { env = ENV, user = { canManageDomains: true }, answer = () => Response.json({ status: "pending", records: [] }) } = {}) {
	globalThis.cloudMailEnv = env;
	globalThis.cloudMailUser = user;
	const calls = [];
	globalThis.fetch = async (url, init) => { calls.push({ url, method: init.method, auth: init.headers.authorization, body: init.body ? JSON.parse(init.body) : null }); return answer(url); };
	t.after(() => { globalThis.fetch = realFetch; });
	return calls;
}
const post = (body, origin = "https://acme.flaresuite.ai") => POST(new Request("https://acme.flaresuite.ai/api/cloud-mail", { method: "POST", headers: { origin }, body: JSON.stringify(body) }));

test("reads the state from the Cloud's internal API with the workspace secret", async (t) => {
	const calls = fixture(t);
	const response = await GET(new Request("https://acme.flaresuite.ai/api/cloud-mail"));
	assert.equal(response.status, 200);
	assert.equal((await response.json()).status, "pending");
	assert.deepEqual(calls, [{ url: "http://cloud:3000/internal/workspaces/ws_1/mail", method: "GET", auth: "Bearer s3cret", body: null }]);
});

test("checks DNS and asks for a Domain Connect link that returns to this Domains page", async (t) => {
	const calls = fixture(t, { answer: (url) => Response.json(url.endsWith("/connect") ? { url: "https://dash.cloudflare.com/domainconnect/apply" } : { status: "verified" }) });
	assert.equal((await (await post({ action: "check" })).json()).status, "verified");
	assert.equal((await (await post({ action: "connect" })).json()).url, "https://dash.cloudflare.com/domainconnect/apply");
	assert.equal(calls[0].url, "http://cloud:3000/internal/workspaces/ws_1/mail/check");
	assert.deepEqual(calls[1].body, { returnUrl: "https://acme.flaresuite.ai/domains?dns=connected" });
	assert.equal((await post({ action: "other" })).status, 400);
});

test("only domain managers, same-origin posts, and Cloud-run workspaces get through", async (t) => {
	let calls = fixture(t, { user: { canManageDomains: false } });
	assert.equal((await GET(new Request("https://acme.flaresuite.ai/api/cloud-mail"))).status, 403);
	calls = fixture(t);
	assert.equal((await post({ action: "check" }, "https://evil.test")).status, 403);
	calls = fixture(t, { env: { ...ENV, MANAGED_MAIL: undefined } });
	assert.equal((await GET(new Request("https://acme.flaresuite.ai/api/cloud-mail"))).status, 404);
	assert.equal(calls.length, 0);
});

test("a Cloud that is down or refuses answers 502", async (t) => {
	fixture(t, { answer: () => { throw new Error("ECONNREFUSED"); } });
	assert.equal((await GET(new Request("https://acme.flaresuite.ai/api/cloud-mail"))).status, 502);
	fixture(t, { answer: () => Response.json({ error: "Unauthorized" }, { status: 401 }) });
	assert.equal((await GET(new Request("https://acme.flaresuite.ai/api/cloud-mail"))).status, 502);
});
