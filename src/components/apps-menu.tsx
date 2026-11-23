"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { More01 } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { useDismissible } from "@/components/use-dismissible";
import { visibleApps } from "@/lib/apps/registry";
import type { AppsMenuProps } from "./mailbox-selector-types";

export function AppsMenu({ user }: AppsMenuProps) {
	const { t } = useLanguage();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	useDismissible(open, () => setOpen(false), ref);

	const items = visibleApps(user).map((app) => ({ href: app.href, label: t(app.labelKey), icon: app.icon }));

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-200"
				aria-label={t("account.openApps")}
				aria-expanded={open}
			>
				<More01 size={20} />
			</button>
			{open && (
				<div className="absolute right-0 top-12 z-90 w-56 rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl shadow-neutral-900/20">
					{items.map(({ href, label, icon: Icon }) => (
						<Link
							key={href}
							href={href}
							onClick={() => setOpen(false)}
							className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-[#f2f6fc]"
						>
							<Icon size={18} className="text-neutral-600" />
							{label}
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
