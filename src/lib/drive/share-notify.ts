import { getBranding } from "@/lib/branding/service";
import { sendSystemEmail } from "@/lib/email/system-mail";
import { trustedResetOrigin } from "@/lib/auth/password-reset-utils";
import type { Translator } from "@/lib/i18n/utils";
import { buildShareEmail, sharedItemPath } from "./share-notify-utils";
import type { DriveRow, DriveShareRole } from "./types";

/**
 * Tells someone a file or folder was shared with them. Best effort: sharing has already succeeded, so a server
 * that cannot send mail only logs. The link uses the trusted public origin (APP_URL, or the Worker's own origin),
 * never a Host header, so a sharer cannot make the mail point elsewhere.
 */
export async function notifyShare(
	env: CloudflareEnv,
	t: Translator,
	input: { item: DriveRow; role: DriveShareRole; recipientEmail: string; sharer: { name: string | null; email: string }; message?: string; requestUrl: string },
): Promise<boolean> {
	try {
		const origin = trustedResetOrigin(env, input.requestUrl);
		const { appName } = await getBranding(env);
		const mail = buildShareEmail(t, {
			sharerName: input.sharer.name || input.sharer.email,
			sharerEmail: input.sharer.email,
			itemName: input.item.name,
			role: input.role,
			appName,
			link: origin ? `${origin}${sharedItemPath(input.item)}` : null,
			message: input.message,
		});
		const sent = await sendSystemEmail(env, { to: input.recipientEmail, ...mail });
		if (!sent) console.warn("Share notification skipped: no domain can send mail");
		return sent;
	} catch (error) {
		console.warn("Share notification failed", error instanceof Error ? error.message : error);
		return false;
	}
}
