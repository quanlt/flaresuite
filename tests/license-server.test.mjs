import assert from "node:assert/strict";
import test from "node:test";
import { loadApp } from "./helpers/real-db.mjs";

const { app } = await loadApp("license-server", `export { callLicenseServer, LICENSE_SERVER_URL } from "./src/lib/licenses/license-server.ts";`);
const input = { licenseKey: "LICENSE-SECRET-KEY-123", productId: "p", instanceId: "i", instanceUrl: "https://mail.example.com", appVersion: "0.5.5" };

function capture(t, response) {
	const logged = [];
	const realFetch = globalThis.fetch;
	const originals = {};
	for (const level of ["log", "info", "warn", "error", "debug"]) {
		originals[level] = console[level];
		console[level] = (...args) => logged.push(args.map(String).join(" ") + JSON.stringify(args));
	}
	const urls = [];
	globalThis.fetch = async (url) => { urls.push(String(url)); return response; };
	logged.urls = urls;
	t.after(() => {
		globalThis.fetch = realFetch;
		Object.assign(console, originals);
	});
	return logged;
}

test("the license key and the response are never logged", async (t) => {
	const logged = capture(t, Response.json({ valid: true, secret: "RESPONSE-BODY-MARKER" }, { status: 200 }));
	await app.callLicenseServer("activate", input).catch(() => undefined);
	assert.deepEqual(logged.filter((line) => /LICENSE-SECRET-KEY-123|RESPONSE-BODY-MARKER/.test(line)), []);
});

test("a non-JSON 502 reports the license server as unavailable instead of a SyntaxError", async (t) => {
	capture(t, new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }));
	await assert.rejects(app.callLicenseServer("validate", input), /license server is temporarily unavailable/);
});

test("a non-JSON 200 is an invalid license response", async (t) => {
	capture(t, new Response("not json", { status: 200 }));
	await assert.rejects(app.callLicenseServer("validate", input), /invalid license response/);
});

test("keys are checked on flaresuite.ai", async (t) => {
	const logged = capture(t, Response.json({ valid: true, state: "active" }));
	await app.callLicenseServer("activate", input);
	assert.equal(app.LICENSE_SERVER_URL, "https://flaresuite.ai");
	assert.deepEqual(logged.urls, ["https://flaresuite.ai/api/v1/licenses/activate"]);
});
