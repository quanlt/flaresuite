import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getAgentEnabled, getAgentProviderPublicConfig } from "@/lib/agent/provider";

export async function GET(request: Request) {
	const env = getEnv();
	if (!await getCurrentUser(env, request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
	// The assistant button only shows when it can answer: turned on and a provider with a model is set up.
	const enabled = await getAgentEnabled(env) && (await getAgentProviderPublicConfig(env)).configured;
	return Response.json({ enabled }, { headers: { "Cache-Control": "no-store" } });
}
