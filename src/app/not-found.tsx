"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";

/** Any unknown URL: the app's own colours and a way back, instead of the framework's bare black page. */
export default function NotFound() {
	const { t } = useLanguage();
	return (
		<main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4 text-neutral-900">
			<div className="max-w-sm text-center">
				<p className="font-mono text-sm text-neutral-500">404</p>
				<h1 className="mt-2 text-2xl font-semibold">{t("notFound.title")}</h1>
				<p className="mt-2 text-sm text-neutral-600">{t("notFound.body")}</p>
				<Link href="/inbox" className="mt-6 inline-flex h-9 items-center rounded-full bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">
					{t("notFound.home")}
				</Link>
			</div>
		</main>
	);
}
