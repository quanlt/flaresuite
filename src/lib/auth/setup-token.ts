/**
 * FlareSuite Cloud starts every workspace with a SETUP_TOKEN so that only its customer, who opens the setup link
 * from the Cloud dashboard, can create the first administrator. Without the variable, first-run setup stays open
 * to the first visitor as in a self-hosted install.
 */
export const SETUP_TOKEN_COOKIE = "fs_setup_token";

function constantTimeEqual(a: string, b: string): boolean {
	const left = new TextEncoder().encode(a);
	const right = new TextEncoder().encode(b);
	let difference = left.length ^ right.length;
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
	return difference === 0;
}

export function isSetupTokenRequired(env: { SETUP_TOKEN?: string }): boolean {
	return !!env.SETUP_TOKEN?.trim();
}

export function matchesSetupToken(env: { SETUP_TOKEN?: string }, candidate: string | null | undefined): boolean {
	const expected = env.SETUP_TOKEN?.trim();
	if (!expected) return true;
	return !!candidate && constantTimeEqual(candidate, expected);
}

/** The token a setup request carries: the cookie set by /api/setup/claim, or an X-Setup-Token header. */
export function setupTokenFromRequest(request: Request): string | null {
	const header = request.headers.get("X-Setup-Token");
	if (header) return header.trim();
	const match = (request.headers.get("Cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${SETUP_TOKEN_COOKIE}=([^;]+)`));
	return match ? decodeURIComponent(match[1]) : null;
}
