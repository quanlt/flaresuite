import type { LicensePlan } from "./types";

/** Products on the FlareSuite license server; must equal LICENSE_PRODUCT_IDS in flaresuite-cloud/src/licenses.ts. */
export const LICENSE_PRODUCT_IDS: Record<Exclude<LicensePlan, "community">, string> = {
	pro: "a48777ce-1ef9-4c59-b976-0e66bfa913d9",
	team: "ead97201-8e9b-4fe1-bee1-ed3a730e6598",
};

export const LICENSE_STATUS_CHANGED_EVENT = "mailflare:license-status-changed";
