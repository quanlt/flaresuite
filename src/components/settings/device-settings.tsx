"use client";

import { useEffect, useState } from "react";
import { confirmDestructive } from "@/components/ui/confirm-dialog";
import { Bell, Check, Copy, Mail, Plus, Smartphone } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUserDate } from "@/lib/time/utils";
import type { CreatedAppPassword, DeviceList, MailAppServer, MobileDevice } from "./device-settings-types";
import { appleProfileUrl, createAppPassword, groupPassword, loadDevices, signOutDevice } from "./device-settings-utils";

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

function AppPasswordDialog({ open, onClose, onCreated, list }: { open: boolean; onClose: () => void; onCreated: () => void; list: DeviceList | null }) {
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
						<p className="text-xs text-neutral-500">{t("devices.appPasswordRevoke")}</p>
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

/**
 * Settings > Security card listing phones and tablets signed in with the mobile app, and mail apps (Outlook,
 * Apple Mail…) using an app password. Each holds a device key; signing one out revokes it.
 */
export function DeviceSettings() {
	const { t } = useLanguage();
	const [list, setList] = useState<DeviceList | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);

	const refresh = () => loadDevices().then(setList).catch((err) => setError(err instanceof Error ? err.message : t("devices.loadFailed")));
	useEffect(() => { void refresh(); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

	async function remove(device: MobileDevice) {
		if (!await confirmDestructive(t("devices.signOutConfirm", { name: device.name }))) return;
		setBusy(device.id);
		try {
			await signOutDevice(device.id);
			setList((current) => current ? { ...current, devices: current.devices.filter((item) => item.id !== device.id) } : current);
		} catch (err) {
			setError(err instanceof Error ? err.message : t("devices.loadFailed"));
		} finally {
			setBusy(null);
		}
	}

	if (!list) return <p className="text-sm text-neutral-500">{error ?? t("devices.loading")}</p>;
	const { devices } = list;

	return (
		<div className="space-y-3">
			{error ? <p className="text-sm text-red-600">{error}</p> : null}
			<div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 p-4">
				<div className="flex min-w-0 items-start gap-3">
					<Mail className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" />
					<div className="min-w-0">
						<p className="text-sm font-medium text-neutral-900">{t("devices.mailAppsTitle")}</p>
						<p className="text-sm text-neutral-500">{t("devices.mailAppsBody")}</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{list.mailServer && list.username ? (
						<Button variant="ghost" size="sm" asChild><a href={appleProfileUrl(list.mailServer.host, list.username)} data-testid="apple-profile-card">{t("devices.appleProfileShort")}</a></Button>
					) : null}
					<Button variant="outline" size="sm" onClick={() => setCreating(true)} data-testid="new-app-password"><Plus className="mr-1 h-4 w-4" />{t("devices.newAppPassword")}</Button>
				</div>
			</div>
			{devices.length === 0 ? <p className="text-sm text-neutral-500">{t("devices.empty")}</p> : (
				<ul className="divide-y divide-neutral-100 rounded-2xl bg-neutral-50">
					{devices.map((device) => (
						<li key={device.id} className="flex items-center gap-3 p-4">
							<Smartphone className="h-5 w-5 shrink-0 text-neutral-500" />
							<div className="min-w-0 flex-1">
								<p className="flex items-center gap-2 truncate text-sm font-medium text-neutral-900">
									{device.name}
									{device.pushEnabled ? <Bell className="h-3.5 w-3.5 text-neutral-400" aria-label={t("devices.push")} /> : null}
								</p>
								<p className="truncate text-sm text-neutral-500">
									{t("devices.signedIn", { date: formatUserDate(device.createdAt, { dateStyle: "short" }) })} ·{" "}
									{device.lastUsedAt ? t("apiKeys.lastUsed", { date: formatUserDate(device.lastUsedAt, { dateStyle: "short" }) }) : t("apiKeys.neverUsed")}
								</p>
							</div>
							<Button variant="outline" size="sm" disabled={busy === device.id} onClick={() => remove(device)}>
								{t("devices.signOut")}
							</Button>
						</li>
					))}
				</ul>
			)}
			<AppPasswordDialog open={creating} onClose={() => setCreating(false)} onCreated={() => void refresh()} list={list} />
		</div>
	);
}
