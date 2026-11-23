import assert from "node:assert/strict";
import test from "node:test";
import { loadApp } from "./helpers/real-db.mjs";

/** Admin → AI assistant: what a fresh installation starts from, and when the assistant button shows. */
const { app, newDatabase } = await loadApp("agent-setup", `
	export { getAgentProviderPublicConfig } from "./src/lib/agent/provider.ts";
	export { GET as availability } from "./src/app/api/agent/availability/utils.ts";
	export { providerLabel } from "./src/app/(admin)/agent/utils.ts";
`, { mocks: {
	"@/lib/cloudflare": "export function getEnv(){return globalThis.agentSetupEnv}",
	"@/lib/auth/cookies": "export async function getCurrentUser(){return globalThis.agentSetupUser}",
	"@/lib/auth/client": "export const authFetch = fetch",
} });

test("without Workers AI, a fresh installation starts from an OpenAI-compatible provider that is not set up", async (t) => {
	const { env } = await newDatabase(t);
	const config = await app.getAgentProviderPublicConfig(env);
	assert.deepEqual({ provider: config.provider, preset: config.preset, baseUrl: config.baseUrl, models: config.models, configured: config.configured },
		{ provider: "compatible", preset: "openai", baseUrl: "https://api.openai.com/v1", models: [], configured: false });
	// With the binding, Workers AI stays the zero-setup default.
	assert.equal((await app.getAgentProviderPublicConfig({ ...env, AI: {} })).provider, "cloudflare");
});

test("the assistant button shows only when it is turned on and set up", async (t) => {
	const { env, sqlite } = await newDatabase(t);
	globalThis.agentSetupEnv = env;
	globalThis.agentSetupUser = { id: "u1" };
	t.after(() => { delete globalThis.agentSetupEnv; delete globalThis.agentSetupUser; });
	const enabled = async () => (await (await app.availability(new Request("https://mail.test/api/agent/availability"))).json()).enabled;

	assert.equal(await enabled(), false);
	sqlite.prepare("INSERT INTO app_settings (id, agent_provider, agent_preset, agent_base_url, agent_api_key, agent_model, updated_at) VALUES ('default', 'compatible', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4.1-mini', 1) ON CONFLICT(id) DO UPDATE SET agent_provider = excluded.agent_provider, agent_preset = excluded.agent_preset, agent_base_url = excluded.agent_base_url, agent_api_key = excluded.agent_api_key, agent_model = excluded.agent_model").run();
	assert.equal(await enabled(), true);
	sqlite.prepare("UPDATE app_settings SET agent_enabled = 0").run();
	assert.equal(await enabled(), false);
});

test("the status line names the provider", () => {
	assert.equal(app.providerLabel({ provider: "compatible", preset: "anthropic", baseUrl: "" }), "Anthropic");
	assert.equal(app.providerLabel({ provider: "compatible", preset: "custom", baseUrl: "https://llm.example.com/v1" }), "llm.example.com");
	assert.equal(app.providerLabel({ provider: "cloudflare", preset: "openai", baseUrl: "" }), "Cloudflare Workers AI");
});
