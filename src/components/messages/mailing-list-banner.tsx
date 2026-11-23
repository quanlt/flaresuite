"use client";

import { Mail, X } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { MessageUnsubscribeButton } from "./unsubscribe-button";

/**
 * Gmail-style notice pinned to the top of an open message that carries a
 * List-Unsubscribe header. Closing it hides the banner for that message; the
 * small inline unsubscribe button next to the sender takes its place.
 */
export function MailingListBanner({ messageId, onDismiss }: { messageId: string; onDismiss: () => void }) {
	const { t } = useLanguage();
	return (
		<div className="mx-4 mb-3 flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-100 px-4 py-2.5 text-sm text-neutral-700 sm:mx-0 sm:ml-4">
			<Mail className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
			<span className="min-w-0 flex-1">{t("message.mailingListNotice")}</span>
			<MessageUnsubscribeButton messageId={messageId} variant="row" />
			<button
				type="button"
				aria-label={t("navigation.close")}
				onClick={onDismiss}
				className="shrink-0 rounded-full p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700"
			>
				<X className="h-4 w-4" aria-hidden="true" />
			</button>
		</div>
	);
}
