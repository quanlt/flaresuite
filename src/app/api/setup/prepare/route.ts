import { NextResponse } from "next/server";
import { hasAdminAccount } from "@/lib/auth/setup";
import { getEnv } from "@/lib/cloudflare";
import { getSetupRequirementChecks } from "@/lib/setup/configuration";
import { migrateCleanDatabase } from "@/lib/setup/migration";
import { matchesSetupToken, setupTokenFromRequest } from "@/lib/auth/setup-token";

export async function POST(request: Request) {
	const env = getEnv();
	if (await hasAdminAccount(env)) {
		return NextResponse.json({ error: "Initial setup is already complete" }, { status: 403 });
	}
	// On FlareSuite Cloud every setup step needs the workspace's setup token, so nobody else can claim it first.
	if (!matchesSetupToken(env, setupTokenFromRequest(request))) {
		return NextResponse.json({ error: "Open the setup link from your FlareSuite Cloud dashboard to create the first account." }, { status: 403 });
	}

	const checks = getSetupRequirementChecks(env);
	if (checks.some((check) => !check.configured)) {
		return NextResponse.json({ checks, migrated: false }, { status: 503 });
	}

	try {
		const migrated = await migrateCleanDatabase(env.DB);
		return NextResponse.json({ checks, migrated });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Database preparation failed";
		return NextResponse.json({ checks, migrated: false, error: message }, { status: 500 });
	}
}
