import type { Translator } from "@/lib/i18n/utils";
import { escapeHtml } from "@/lib/auth/password-reset-utils";
import { officeEditorPath, officeKindFromContentType } from "@/lib/office/utils";
import type { DriveShareRole } from "./types";

/** Where the recipient lands: the editor for Docs, Sheets and Slides, the folder or Shared with me otherwise. */
export function sharedItemPath(item: { id: string; kind: "file" | "folder"; contentType: string }): string {
	const office = item.kind === "file" ? officeKindFromContentType(item.contentType) : null;
	if (office) return officeEditorPath(office, item.id);
	if (item.kind === "folder") return `/drive?folder=${encodeURIComponent(item.id)}&view=shared`;
	return "/drive?view=shared";
}

/** "Alex shared 'Q3 plan' with you" mail. `link` is null when the server has no trusted public origin. */
export function buildShareEmail(
	t: Translator,
	input: { sharerName: string; sharerEmail: string; itemName: string; role: DriveShareRole; appName: string; link: string | null; message?: string },
): { subject: string; text: string; html: string } {
	const subject = t("share.mail.subject", { name: input.sharerName, item: input.itemName });
	const intro = t(input.role === "edit" ? "share.mail.introEdit" : "share.mail.introView", { name: input.sharerName, email: input.sharerEmail, item: input.itemName });
	const open = t("share.mail.open");
	const footer = t("share.mail.footer", { appName: input.appName });
	const note = input.message?.trim().slice(0, 1000);
	const text = [intro, ...(note ? ["", `"${note}"`] : []), ...(input.link ? ["", `${open}: ${input.link}`] : []), "", footer].join("\n");
	const html = [
		`<p>${escapeHtml(intro)}</p>`,
		note ? `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #dadce0;color:#3c4043">${escapeHtml(note).replace(/\n/g, "<br>")}</blockquote>` : "",
		input.link ? `<p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:10px 20px;border-radius:20px;background:#1a73e8;color:#fff;text-decoration:none">${escapeHtml(open)}</a></p>` : "",
		`<p style="color:#5f6368;font-size:12px">${escapeHtml(footer)}</p>`,
	].join("");
	return { subject, text, html };
}
