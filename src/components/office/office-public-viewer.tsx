"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "@/components/icons";
import { useBranding } from "@/components/branding-provider";
import { useLanguage } from "@/components/language-provider";
import type { OfficeContentMap, OfficeKind } from "@/lib/office/types";
import { parseEnvelope } from "@/lib/office/utils";
import { officeApp } from "./office-apps";

/**
 * Read-only view of a Docs, Sheets or Slides file opened from a public link. Uses the same editors as the apps in
 * read-only mode; nothing here needs a signed-in user.
 */
export function OfficePublicViewer<K extends OfficeKind>({ kind, name, contentUrl }: { kind: K; name: string; contentUrl: string }) {
	const { t } = useLanguage();
	const { appName } = useBranding();
	const app = officeApp(kind);
	const [content, setContent] = useState<OfficeContentMap[K] | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let active = true;
		void fetch(contentUrl, { cache: "no-store" })
			.then((response) => (response.ok ? response.text() : Promise.reject(new Error())))
			.then((text) => {
				const envelope = parseEnvelope(kind, text);
				if (!active) return;
				if (envelope) setContent(envelope.content);
				else setFailed(true);
			})
			.catch(() => { if (active) setFailed(true); });
		return () => { active = false; };
	}, [contentUrl, kind]);

	useEffect(() => {
		document.title = `${name} - ${t(app.nameKey)}`;
	}, [name, app.nameKey, t]);

	const AppIcon = app.icon;
	const Editor = app.Editor;
	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-[#f8f9fa] print:block print:h-auto print:overflow-visible print:bg-white">
			<header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 print:hidden">
				<AppIcon size={26} style={{ color: app.color }} />
				<h1 className="min-w-0 flex-1 truncate text-lg text-neutral-900">{name}</h1>
				<span className="shrink-0 text-xs text-neutral-500">{t("office.sharedLinkFooter", { appName })}</span>
			</header>
			<div className="relative min-h-0 flex-1 print:static">
				{failed ? <p className="p-10 text-center text-sm text-neutral-600">{t("office.loadFailed")}</p>
					: content === null ? <div className="flex h-full items-center justify-center" aria-busy="true"><Loader2 size={28} className="animate-spin text-neutral-400" /></div>
					: <Editor content={content} contentKey={1} onChange={() => undefined} readOnly name={name} />}
			</div>
		</div>
	);
}
