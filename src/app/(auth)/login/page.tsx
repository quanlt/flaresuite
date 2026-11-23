import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { hasAdminAccount } from "@/lib/auth/setup";
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getEnv } from "@/lib/cloudflare";
import { authPageMetadata } from "../auth-metadata";
import { LoginClient } from "./login-client";

export const dynamic = "force-dynamic";

export const generateMetadata = () => authPageMetadata("auth.signIn");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ add?: string; email?: string }> }) {
	const params = await searchParams;
	const adding = params.add === "1";
	// The control plane's sign-in page sends people here with the address they typed.
	const email = typeof params.email === "string" && params.email.length <= 254 && params.email.includes("@") ? params.email : undefined;
	const env = getEnv();
	if (!(await hasAdminAccount(env))) redirect("/setup");
	const cookieStore = await cookies();
	const user = await getUserFromSession(env, cookieStore.get(SESSION_COOKIE)?.value);
	if (user && !user.disabled && !adding) redirect("/inbox");

	return (
		<AuthGuard mode="public" allowAuthenticated={adding}>
			<LoginClient adding={adding} email={email} />
		</AuthGuard>
	);
}
