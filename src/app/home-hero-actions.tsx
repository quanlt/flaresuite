"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { useHomeAuth } from "./home-auth";

export function HomeHeroActions({ canSetup = false }: { canSetup?: boolean }) {
	const { t } = useLanguage();
	const hasUser = !!useHomeAuth();
	const primary = hasUser
		? { href: "/inbox", label: t("home.openDashboard") }
		: canSetup
			? { href: "/setup", label: t("home.createAccount") }
			: { href: "/login", label: t("home.logIn") };

	return (
		<div className="mt-8 flex flex-col gap-3 sm:flex-row">
			<Button size="lg" asChild className="rounded-full px-6">
				<Link href={primary.href}>
					{primary.label}
					<ArrowRight className="h-4 w-4" />
				</Link>
			</Button>
			{(hasUser || canSetup) && (
				<Button size="lg" variant="outline" asChild className="rounded-full border-neutral-200 bg-white px-6">
					<Link href={hasUser ? "/inbox" : "/login"}>
						{hasUser ? t("home.viewInbox") : t("home.logIn")}
					</Link>
				</Button>
			)}
		</div>
	);
}
