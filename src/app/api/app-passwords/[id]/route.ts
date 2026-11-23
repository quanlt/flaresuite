import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { requireSessionUser } from "@/lib/api/auth";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { revokeAppPassword } from "@/lib/auth/app-passwords";

/** Revokes an app password: the mail app using it is signed out at its next connection. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const env = getEnv();
	const { user, error } = await requireSessionUser(env, request);
	if (error) return error;
	if (!hasValidSessionMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	const { id } = await params;
	if (!(await revokeAppPassword(env, user.id, id))) return NextResponse.json({ error: "App password not found" }, { status: 404 });
	return NextResponse.json({ ok: true });
}
