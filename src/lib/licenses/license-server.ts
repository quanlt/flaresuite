import type { LicenseActivationInput, LicenseDeactivationInput, LicenseServerAction, LicenseServerResponse } from "./types";
import { parseLicenseServerResponse } from "./utils";

/** FlareSuite's license server (flaresuite-cloud: src/licenses.ts), where Pro and Team keys are sold and checked. */
export const LICENSE_SERVER_URL = "https://flaresuite.ai";

export async function callLicenseServer(
	action: LicenseServerAction,
	input: LicenseActivationInput | LicenseDeactivationInput,
): Promise<LicenseServerResponse> {
	let response: Response;

	try {
		response = await fetch(`${LICENSE_SERVER_URL}/api/v1/licenses/${action}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
			signal: AbortSignal.timeout(15_000),
		});
	} catch {
		throw new Error("Unable to reach the FlareSuite license server. Try again later.");
	}

	if (!response.ok) {
		if (response.status === 409) {
			throw new Error("This license is active on another installation. Deactivate it there before retrying.");
		}
		if (response.status === 401 || response.status === 403) {
			throw new Error("The license server rejected this license key.");
		}
		if (response.status >= 500) {
			throw new Error("The license server is temporarily unavailable. Try again later.");
		}
		throw new Error("The license server could not process this license request.");
	}

	try {
		return parseLicenseServerResponse(await response.json());
	} catch {
		throw new Error("The license server returned an invalid license response");
	}
}
