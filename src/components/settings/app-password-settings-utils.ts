import { authFetch } from "@/lib/auth/client";
import type { AppPasswordList, CreatedAppPassword } from "./app-password-settings-types";

export async function loadAppPasswords(): Promise<AppPasswordList> {
	const res = await authFetch("/api/app-passwords");
	const data = (await res.json()) as Partial<AppPasswordList> & { error?: string };
	if (!res.ok) throw new Error(data.error ?? "Failed to load app passwords");
	return { appPasswords: data.appPasswords ?? [], mailServer: data.mailServer ?? null, username: data.username ?? "" };
}

export async function createAppPassword(name: string): Promise<CreatedAppPassword> {
	const res = await authFetch("/api/app-passwords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
	const data = (await res.json().catch(() => ({}))) as Partial<CreatedAppPassword> & { error?: string };
	if (!res.ok || !data.password) throw new Error(data.error ?? "Failed to create the app password");
	return data as CreatedAppPassword;
}

export async function revokeAppPassword(id: string): Promise<void> {
	const res = await authFetch(`/api/app-passwords/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(data.error ?? "Failed to revoke the app password");
	}
}

/** "abcd efgh ijkl mnop": easier to read and type; mail apps accept it with or without the spaces. */
export function groupPassword(password: string): string {
	return password.replace(/(.{4})(?=.)/g, "$1 ");
}

/** The gateway's Apple configuration profile for an address (adds the account to Mail on iPhone, iPad or Mac). */
export function appleProfileUrl(host: string, address: string): string {
	return `https://${host}/apple/mail.mobileconfig?email=${encodeURIComponent(address)}`;
}
