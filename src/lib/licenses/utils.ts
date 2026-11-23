import type { LicensePlan, LicenseState, LicenseServerResponse } from "./types";
import { LICENSE_PRODUCT_IDS } from "./constants";

export async function hashLicenseKey(licenseKey: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(licenseKey));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function parseFeatures(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((feature): feature is string => typeof feature === "string") : [];
	} catch {
		return [];
	}
}

export function parseLicenseServerResponse(value: unknown): LicenseServerResponse {
	if (!value || typeof value !== "object") throw new Error("The license server returned an invalid license response");
	const response = value as Record<string, unknown>;
	const states: LicenseState[] = ["active", "invalid", "expired", "deactivated"];

	if (typeof response.valid !== "boolean" || !states.includes(response.state as LicenseState)) {
		throw new Error("The license server returned an invalid license response");
	}

	return {
		valid: response.valid,
		state: response.state as LicenseServerResponse["state"],
		instanceId: typeof response.instanceId === "string" ? response.instanceId : undefined,
		productId: typeof response.productId === "string" ? response.productId : undefined,
		plan: typeof response.plan === "string" ? response.plan : undefined,
		features: Array.isArray(response.features)
			? response.features.filter((feature): feature is string => typeof feature === "string")
			: undefined,
		seatLimit: response.seatLimit === null ? null : typeof response.seatLimit === "number" && Number.isInteger(response.seatLimit) && response.seatLimit >= 0 ? response.seatLimit : undefined,
	};
}

export function normalizeLicensePlan(productId: string | undefined, plan: string | undefined): LicensePlan | null {
	if (productId) {
		if (productId === LICENSE_PRODUCT_IDS.pro) return "pro";
		if (productId === LICENSE_PRODUCT_IDS.team) return "team";
		return null;
	}

	const normalized = plan?.trim().toLowerCase();
	return normalized === "pro" || normalized === "team" ? normalized : null;
}

/**
 * A plan granted by the hosting provider instead of a license key: FlareSuite Cloud starts each workspace with
 * MANAGED_PLAN (pro or team) and MANAGED_SEAT_LIMIT (accounts; empty or 0 means unlimited). Only whoever controls
 * the server environment can set these, the same trust as the database itself.
 */
export function readManagedPlan(env: { MANAGED_PLAN?: string; MANAGED_SEAT_LIMIT?: string }): { plan: "pro" | "team"; seatLimit: number | null } | null {
	const plan = env.MANAGED_PLAN?.trim().toLowerCase();
	if (plan !== "pro" && plan !== "team") return null;
	const seats = Number.parseInt(env.MANAGED_SEAT_LIMIT ?? "", 10);
	return { plan, seatLimit: Number.isFinite(seats) && seats > 0 ? seats : null };
}
