"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { ComposeProvider } from "@/components/compose/compose-context";
import { MailSearchProvider } from "@/components/mail-search/mail-search-context";
import { MailboxProvider } from "@/components/mailbox-provider";
import { ShortcutsProvider } from "@/components/shortcuts";
import { SidebarProvider } from "@/components/sidebar-state";
import { SkipToContent } from "@/components/skip-to-content";

/**
 * Docs, Sheets and Slides. Documents are Drive files, so the apps follow the account's Drive switch. The same
 * providers as Drive keep the account menu and app launcher in the header working.
 */
export default function OfficeLayout({ children }: { children: React.ReactNode }) {
	return (
		<AuthGuard requireFeature="drive">
			<SidebarProvider>
				<MailboxProvider>
					<ComposeProvider>
						<MailSearchProvider>
							<ShortcutsProvider>
								<SkipToContent />
								<div id="main-content" tabIndex={-1} className="safe-area focus:outline-none">{children}</div>
							</ShortcutsProvider>
						</MailSearchProvider>
					</ComposeProvider>
				</MailboxProvider>
			</SidebarProvider>
		</AuthGuard>
	);
}
