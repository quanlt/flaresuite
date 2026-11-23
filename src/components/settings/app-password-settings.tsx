"use client";

import { useEffect, useState } from "react";
import { confirmDestructive } from "@/components/ui/confirm-dialog";
import { Check, Copy, KeyRound, Plus } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUserDate } from "@/lib/time/utils";
import type { AppPassword, AppPasswordList, CreatedAppPassword, MailAppServer } from "./app-password-settings-types";
import { appleProfileUrl, createAppPassword, groupPassword, loadAppPasswords, revokeAppPassword } from "./app-password-settings-utils";

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
	const { t } = useLanguage();
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex items-center gap-3 py-1.5 text-sm">
			<span className="w-36 shrink-0 text-neutral-500">{label}</span>
			<code className="min-w-0 flex-1 break-all font-mono text-neutral-900">{display ?? value}</code>
			<button type="button" className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label={copied ? t("devices.copied") : t("devices.copy")}
				onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
				{copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
			</button>
		</div>
	);
}

/** IMAP and SMTP settings for mail apps that do not configure themselves. */
export function MailServerSettings({ server, username, password }: { server: MailAppServer; username: string; password?: string }) {
	const { t } = useLanguage();
	return (
		<div className="rounded-xl border border-neutral-200 p-3" data-testid="mail-server-settings">
			<CopyRow label={t("devices.username")} value={username} />
			{password && <CopyRow label={t("devices.password")} value={password} display={groupPassword(password)} />}
			<CopyRow label={t("devices.imapServer")} value={server.host} />
			<p className="pb-1 pl-36 text-xs text-neutral-500">{t("devices.imapPort", { port: server.imapPort })}</p>
			<CopyRow label={t("devices.smtpServer")} value={server.host} />
			<p className="pl-36 text-xs text-neutral-500">{t("devices.smtpPort", { port: server.smtpPort, submission: server.submissionPort })}</p>
			<p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
				{t("devices.autoSetup")}{" "}
				<a className="font-medium text-neutral-900 underline underline-offset-2" href={appleProfileUrl(server.host, username)} data-testid="apple-profile">{t("devices.appleProfile")}</a>
			</p>
		</div>
	);
}

function NewAppPasswordDialog({ open, onClose, onCreated, list }: { open: boolean; onClose: () => void; onCreated: () => void; list: AppPasswordList | null }) {
	const { t } = useLanguage();
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [created, setCreated] = useState<CreatedAppPassword | null>(null);
	const [error, setError] = useState<string | null>(null);

	function close() {
		setName(""); setCreated(null); setError(null);
		onClose();
	}

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true); setError(null);
		try {
			setCreated(await createAppPassword(name.trim()));
			onCreated();
		} catch (err) {
			setError(err instanceof Error ? err.message : t("devices.createFailed"));
		} finally { setBusy(false); }
	}

	return (
		<Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
			<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{created ? t("devices.appPasswordReady") : t("devices.newAppPassword")}</DialogTitle>
					<DialogDescription>{created ? t("devices.appPasswordOnce") : t("devices.appPasswordHint")}</DialogDescription>
				</DialogHeader>
				{created ? (
					<div className="space-y-4">
						{created.mailServer
							? <MailServerSettings server={created.mailServer} username={created.username} password={created.password} />
							: <CopyRow label={t("devices.password")} value={created.password} display={groupPassword(created.password)} />}
						<p className="text-xs text-neutral-500">{t("appPasswords.revokeNote")}</p>
						<div className="flex justify-end"><Button onClick={close}>{t("devices.done")}</Button></div>
					</div>
				) : (
					<form onSubmit={submit} className="space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="app-password-name">{t("devices.appName")}</Label>
							<Input id="app-password-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("devices.appNamePlaceholder")} maxLength={100} autoFocus />
						</div>
						{error && <p className="text-sm text-red-600">{error}</p>}
						{list?.mailServer == null && <p className="text-xs text-neutral-500">{t("devices.noGateway")}</p>}
						<div className="flex justify-end gap-2">
							<Button type="button" variant="outline" onClick={close}>{t("devices.cancel")}</Button>
							<Button type="submit" disabled={busy || !name.trim()}>{t("devices.create")}</Button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Step-by-step setup for the common mail apps, with the server settings to type when an app asks. */
function MailAppGuide({ server, username }: { server: MailAppServer; username: string }) {
	const { t } = useLanguage();
	const apps: { title: string; steps: string[] }[] = [
		{ title: t("mailGuide.outlook"), steps: [t("mailGuide.outlook1"), t("mailGuide.outlook2"), t("mailGuide.outlook3")] },
		{ title: t("mailGuide.apple"), steps: [t("mailGuide.apple1"), t("mailGuide.apple2")] },
		{ title: t("mailGuide.thunderbird"), steps: [t("mailGuide.thunderbird1")] },
		{ title: t("mailGuide.other"), steps: [t("mailGuide.other1")] },
	];
	return (
		<section className="space-y-4" data-testid="mail-app-guide">
			<div>
				<h2 className="text-lg font-semibold text-neutral-900">{t("mailGuide.title")}</h2>
				<p className="mt-1 text-sm text-neutral-500">{t("mailGuide.intro")}</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				{apps.map((app) => (
					<div key={app.title} className="rounded-2xl border border-neutral-200 p-4">
						<h3 className="text-sm font-semibold text-neutral-900">{app.title}</h3>
						<ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-neutral-600">
							{app.steps.map((step) => <li key={step}>{step}</li>)}
						</ol>
					</div>
				))}
			</div>
			<div className="space-y-2">
				<h3 className="text-sm font-semibold text-neutral-900">{t("mailGuide.settings")}</h3>
				<MailServerSettings server={server} username={username} />
			</div>
		</section>
	);
}

/**
 * Settings > App passwords: the passwords mail apps (Outlook, Apple Mail, Thunderbird) sign in with, and how to
 * set those apps up. App passwords are not API keys; they only work for mail and are revoked with the sessions.
 */
export function AppPasswordSettings() {
	const { t } = useLanguage();
	const [list, setList] = useState<AppPasswordList | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);

	const refresh = () => loadAppPasswords().then(setList).catch((err) => setError(err instanceof Error ? err.message : t("appPasswords.loadFailed")));
	useEffect(() => { void refresh(); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

	async function remove(item: AppPassword) {
		if (!await confirmDestructive(t("appPasswords.revokeConfirm", { name: item.name }))) return;
		setBusy(item.id);
		try {
			await revokeAppPassword(item.id);
			setList((current) => current ? { ...current, appPasswords: current.appPasswords.filter((entry) => entry.id !== item.id) } : current);
		} catch (err) {
			setError(err instanceof Error ? err.message : t("appPasswords.loadFailed"));
		} finally {
			setBusy(null);
		}
	}

	if (!list) return <p className="text-sm text-neutral-500">{error ?? t("appPasswords.loading")}</p>;

	return (
		<div className="space-y-8">
			<div className="space-y-3">
				{error ? <p className="text-sm text-red-600">{error}</p> : null}
				<div className="flex justify-end">
					<Button onClick={() => setCreating(true)} data-testid="new-app-password"><Plus className="mr-1 h-4 w-4" />{t("devices.newAppPassword")}</Button>
				</div>
				{list.appPasswords.length === 0 ? <p className="text-sm text-neutral-500">{t("appPasswords.empty")}</p> : (
					<ul className="divide-y divide-neutral-100 rounded-2xl bg-neutral-50" data-testid="app-password-list">
						{list.appPasswords.map((item) => (
							<li key={item.id} className="flex items-center gap-3 p-4">
								<KeyRound className="h-5 w-5 shrink-0 text-neutral-500" />
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium text-neutral-900">{item.name}</p>
									<p className="truncate text-sm text-neutral-500">
										{t("appPasswords.created", { date: formatUserDate(item.createdAt, { dateStyle: "short" }) })} ·{" "}
										{item.lastUsedAt ? t("apiKeys.lastUsed", { date: formatUserDate(item.lastUsedAt, { dateStyle: "short" }) }) : t("apiKeys.neverUsed")}
									</p>
								</div>
								<Button variant="outline" size="sm" disabled={busy === item.id} onClick={() => remove(item)}>
									{t("appPasswords.revoke")}
								</Button>
							</li>
						))}
					</ul>
				)}
			</div>
			{list.mailServer ? <MailAppGuide server={list.mailServer} username={list.username} /> : null}
			<NewAppPasswordDialog open={creating} onClose={() => setCreating(false)} onCreated={() => void refresh()} list={list} />
		</div>
	);
}
