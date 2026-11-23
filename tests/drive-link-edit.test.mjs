import assert from "node:assert/strict";
import test from "node:test";
import { loadApp } from "./helpers/real-db.mjs";

/** "Anyone with the link" access: the owner picks view or edit, and edit links save Docs, Sheets and Slides. */
const { app, newDatabase } = await loadApp("drive-link-edit", `
	export { GET as openByLink, PUT as saveByLink } from "./src/app/api/drive/public/[token]/office/route.ts";
	export { POST as setLink } from "./src/app/api/drive/items/[id]/link/route.ts";
	export { createEnvelope } from "./src/lib/office/utils.ts";
`, { mocks: {
	"@/lib/cloudflare": "export function getEnv(){return globalThis.linkEnv}",
	"@/lib/drive/auth": "export async function authorizeDrive(){const e=globalThis.linkEnv;return {env:e,db:globalThis.linkDb,user:{id:'owner'}}}",
} });

function bucket() {
	const objects = new Map();
	return {
		objects,
		async get(key) { return objects.has(key) ? { text: async () => objects.get(key) } : null; },
		async put(key, bytes) { objects.set(key, typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes)); },
		async delete(key) { objects.delete(key); },
	};
}

const DOC = "application/vnd.flaresuite.document+json";
async function fixture(t, { kind = "file", contentType = DOC } = {}) {
	const { env, db } = await newDatabase(t, `
		INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES ('owner', 'owner@acme.test', 'x', 'Owner', 'admin', 1);
		INSERT INTO drive_items (id, owner_id, parent_id, kind, name, r2_key, size, content_type, created_at, updated_at)
			VALUES ('doc1', 'owner', NULL, '${kind}', 'Plan', 'drive/owner/doc1', 0, '${contentType}', 1, 1);
	`);
	const store = bucket();
	store.objects.set("drive/owner/doc1", JSON.stringify(app.createEnvelope("document", { html: "<p>Hello</p>" }, 3)));
	globalThis.linkEnv = { ...env, BUCKET: store };
	globalThis.linkDb = db;
	t.after(() => { delete globalThis.linkEnv; delete globalThis.linkDb; });
	return store;
}

const setLink = (body) => app.setLink(new Request("https://acme.test/api/drive/items/doc1/link", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "doc1" }) });
const open = (token, query = "") => app.openByLink(new Request(`https://acme.test/api/drive/public/${token}/office${query}`), { params: Promise.resolve({ token }) });
const save = (token, body) => app.saveByLink(new Request(`https://acme.test/api/drive/public/${token}/office`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ token }) });

test("a view link opens the document read-only and refuses saves", async (t) => {
	await fixture(t);
	const { linkToken, linkRole } = await (await setLink({ enabled: true })).json();
	assert.equal(linkRole, "view");
	const opened = await (await open(linkToken)).json();
	assert.equal(opened.role, "view");
	assert.equal(opened.revision, 3);
	assert.equal(opened.content.html, "<p>Hello</p>");
	assert.equal(opened.item.linkToken, null, "visitors never see the token as owner data");
	assert.equal((await save(linkToken, { content: { html: "<p>Hacked</p>" }, baseRevision: 3 })).status, 403);
});

test("an edit link saves with revision checks, and switching back to view stops it", async (t) => {
	const store = await fixture(t);
	const { linkToken } = await (await setLink({ enabled: true, role: "edit" })).json();
	assert.equal((await (await open(linkToken, "?meta=1")).json()).role, "edit");
	const saved = await save(linkToken, { content: { html: "<p>Edited by a visitor</p>" }, baseRevision: 3 });
	assert.equal(saved.status, 200);
	assert.equal((await saved.json()).revision, 4);
	assert.match(store.objects.get("drive/owner/doc1"), /Edited by a visitor/);
	assert.equal((await save(linkToken, { content: { html: "<p>stale</p>" }, baseRevision: 3 })).status, 409);
	assert.equal((await save(linkToken, { content: { nope: 1 }, baseRevision: 4 })).status, 400);
	const again = await (await setLink({ role: "view" })).json();
	assert.equal(again.linkToken, linkToken, "changing the role keeps the same link");
	assert.equal((await save(linkToken, { content: { html: "<p>x</p>" }, baseRevision: 4 })).status, 403);
});

test("turning the link off kills the token and forgets edit access", async (t) => {
	await fixture(t);
	const { linkToken } = await (await setLink({ enabled: true, role: "edit" })).json();
	assert.deepEqual(await (await setLink({ enabled: false })).json(), { linkToken: null, linkRole: "view" });
	assert.equal((await open(linkToken)).status, 404);
	const next = await (await setLink({ enabled: true })).json();
	assert.notEqual(next.linkToken, linkToken);
	assert.equal(next.linkRole, "view");
	assert.equal((await setLink({ enabled: true, role: "owner" })).status, 400);
});

test("only Docs, Sheets and Slides open through the office link API", async (t) => {
	await fixture(t, { contentType: "application/pdf" });
	const { linkToken } = await (await setLink({ enabled: true, role: "edit" })).json();
	assert.equal((await open(linkToken)).status, 404);
	assert.equal((await save(linkToken, { content: {}, baseRevision: 0 })).status, 404);
});
