export const DEFAULT_APP_NAME = "FlareSuite";
/** The name older migrations seed into app_settings; it means "not customised". */
const LEGACY_DEFAULT_APP_NAME = "Mailflare";

export function resolveAppName(stored: string | null | undefined): string {
	const name = stored?.trim();
	return name && name !== LEGACY_DEFAULT_APP_NAME ? name : DEFAULT_APP_NAME;
}
