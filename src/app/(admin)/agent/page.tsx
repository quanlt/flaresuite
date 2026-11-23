"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_CLOUDFLARE_MODEL } from "@/lib/agent/provider-constants";
import { saveAssistantAvailability } from "@/lib/agent/availability-client";
import { parseAgentModelIds, toggleAgentModelId } from "@/lib/agent/model-ids";
import type { AgentModelOption, AgentProviderPreset } from "@/lib/agent/provider-types";
import type { AgentAdminConfig, AgentAdminForm } from "./types";
import { baseUrlForPreset, loadAgentAdminSettings, loadAgentModels, PROVIDER_PRESETS, providerLabel, saveAgentAdminSettings, saveAgentEnabled, updateAgentModelRate } from "./utils";
import { Select } from "@/components/ui/select";

const initialForm: AgentAdminForm = { provider: "compatible", preset: "openai", baseUrl: baseUrlForPreset("openai"), apiKey: "", model: "", rates: {} };

function Step({ number, title, description, children }: { number: number; title: string; description?: string; children: React.ReactNode }) {
	return (
		<Card className="rounded-3xl border-0 bg-white p-6">
			<CardHeader className="py-0">
				<CardTitle className="flex items-center gap-3">
					<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-700">{number}</span>
					{title}
				</CardTitle>
				{description && <CardDescription className="pl-10">{description}</CardDescription>}
			</CardHeader>
			<CardContent className="space-y-5 pt-5 md:pl-16">{children}</CardContent>
		</Card>
	);
}

/**
 * Admin → AI assistant: which AI provider and models the email assistant uses, and whether everyone sees it. The
 * page reads top to bottom as the setup order: provider and key, models, then turning it on.
 */
export default function AdminAgentPage() {
	const { t } = useLanguage();
	const [form, setForm] = useState<AgentAdminForm>(initialForm);
	const [saved, setSaved] = useState<AgentAdminConfig | null>(null);
	const [assistantEnabled, setAssistantEnabled] = useState(true);
	const [enabledSaving, setEnabledSaving] = useState(false);
	const [enabledStatus, setEnabledStatus] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [cloudflareAvailable, setCloudflareAvailable] = useState(false);
	const [modelResult, setModelResult] = useState<{ key: string; models: AgentModelOption[]; source: "catalog" | "suggested" | null; error: string | null } | null>(null);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let active = true;
		void loadAgentAdminSettings().then((data) => {
			if (!active) return;
			// A saved Workers AI choice on an installation without the binding cannot work: start from a provider that can.
			const unusable = data.config.provider === "cloudflare" && !data.cloudflareAvailable;
			setForm(unusable
				? { ...initialForm, rates: data.config.rates }
				: { provider: data.config.provider, preset: data.config.preset, baseUrl: data.config.baseUrl, apiKey: "", model: data.config.models.join(", "), rates: data.config.rates });
			setSaved(data.config);
			setAssistantEnabled(data.assistantEnabled);
			setCloudflareAvailable(data.cloudflareAvailable);
			setLoaded(true);
		}).catch((error) => { if (active) setStatus(error instanceof Error ? error.message : t("agentAdmin.loadFailed")); });
		return () => { active = false; };
	}, [t]);

	const configured = !!saved?.configured;
	const canUseSavedKey = !!saved?.hasApiKey && saved.provider === "compatible" && `${saved.preset}|${saved.baseUrl}` === `${form.preset}|${form.baseUrl}`;
	const selectedModelIds = parseAgentModelIds(form.model);
	const missingEndpoint = form.provider === "compatible" && (!form.baseUrl || (!form.apiKey.trim() && !canUseSavedKey));
	// Results belong to the endpoint they were loaded for; changing it hides them until the next load.
	const modelsKey = `${form.provider}|${form.preset}|${form.baseUrl}|${form.apiKey}|${canUseSavedKey}`;
	const currentModels = loaded && !missingEndpoint && modelResult?.key === modelsKey ? modelResult : null;
	const models = currentModels?.models ?? [];
	const modelSource = currentModels?.source ?? null;
	const modelError = loaded && missingEndpoint
		? form.preset === "custom" && !form.baseUrl ? t("agentAdmin.enterUrl") : t("agentAdmin.enterKey")
		: currentModels?.error ?? null;
	useEffect(() => {
		if (!loaded || missingEndpoint) return;
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			setModelResult(null);
			setModelsLoading(true);
			void loadAgentModels(form, controller.signal).then((data) => {
				setModelResult({ key: modelsKey, models: data.models, source: data.source, error: null });
				const published = Object.fromEntries(data.models.flatMap((item) => item.rates ? [[item.id, item.rates]] : []));
				if (Object.keys(published).length) setForm((current) => ({ ...current, rates: { ...current.rates, ...published } }));
			}).catch((error) => {
				if (!controller.signal.aborted) setModelResult({ key: modelsKey, models: [], source: null, error: error instanceof Error ? error.message : t("agentAdmin.modelsFailed") });
			}).finally(() => { if (!controller.signal.aborted) setModelsLoading(false); });
		}, form.provider === "cloudflare" ? 0 : 500);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [loaded, missingEndpoint, modelsKey, form.provider, form.preset, form.baseUrl, form.apiKey, canUseSavedKey, t]);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setStatus(null);
		try {
			const data = await saveAgentAdminSettings(form);
			setForm((current) => ({ ...current, apiKey: "", model: data.config.models.join(", "), rates: data.config.rates }));
			setSaved(data.config);
			saveAssistantAvailability(data.assistantEnabled && data.config.configured);
			setStatus(t("agentAdmin.saved"));
		} catch (error) {
			setStatus(error instanceof Error ? error.message : t("agentAdmin.saveFailed"));
		} finally { setSaving(false); }
	}

	function setEnabled(checked: boolean) {
		setEnabledSaving(true);
		setEnabledStatus(null);
		void saveAgentEnabled(checked)
			.then((data) => { setAssistantEnabled(data.assistantEnabled); saveAssistantAvailability(data.assistantEnabled && configured); })
			.catch((error) => setEnabledStatus(error instanceof Error ? error.message : t("agentAdmin.availabilityFailed")))
			.finally(() => setEnabledSaving(false));
	}

	const canSave = loaded && !saving && selectedModelIds.length > 0
		&& !(form.provider === "cloudflare" && !cloudflareAvailable)
		&& !(form.provider === "compatible" && (!form.baseUrl || (!form.apiKey.trim() && !canUseSavedKey)));
	const statusTone = !loaded ? null : !configured ? "missing" : assistantEnabled ? "ready" : "off";

	return <div className="space-y-6">
		<div className="flex items-start justify-between gap-4">
			<div>
				<h1 className="text-2xl md:text-3xl font-medium text-neutral-900">{t("agentAdmin.title")}</h1>
				<p className="mt-2 max-w-2xl text-sm text-neutral-500">{t("agentAdmin.description")}</p>
			</div>
			<Link href="/ai-usage" className="shrink-0 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">{t("agentAdmin.viewUsage")}</Link>
		</div>

		{statusTone && (
			<div role="status" data-testid="agent-status" className={statusTone === "ready" ? "flex items-start gap-3 rounded-2xl bg-green-50 p-4 text-sm text-green-800" : "flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800"}>
				{statusTone === "ready" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
				<p>{statusTone === "ready" && saved
					? t("agentAdmin.statusReady", { provider: providerLabel(saved), model: saved.model })
					: statusTone === "off" ? t("agentAdmin.statusOff") : t("agentAdmin.statusMissing")}</p>
			</div>
		)}

		<form onSubmit={submit} className="space-y-6">
			<Step number={1} title={t("agentAdmin.provider")} description={t("agentAdmin.providerWarning")}>
				<div className="space-y-2">
					<Label htmlFor="agent-provider">{t("agentAdmin.providerLabel")}</Label>
					<Select id="agent-provider" containerClassName="h-10 w-full rounded-md px-0 shadow-sm shadow-neutral-200/50" className="px-3 text-sm" value={form.provider} disabled={!loaded}
						onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value as AgentAdminForm["provider"], baseUrl: event.target.value === "compatible" ? baseUrlForPreset(current.preset, current.baseUrl) : "", model: event.target.value === "cloudflare" ? DEFAULT_CLOUDFLARE_MODEL : "" }))}>
						<option value="compatible">{t("agentAdmin.openaiCompatible")}</option>
						<option value="cloudflare" disabled={!cloudflareAvailable}>{cloudflareAvailable ? t("agentAdmin.cloudflareAi") : t("agentAdmin.cloudflareUnavailable")}</option>
					</Select>
				</div>
				{form.provider === "compatible" && <>
					<div className="space-y-2">
						<Label htmlFor="agent-preset">{t("agentAdmin.template")}</Label>
						<Select id="agent-preset" containerClassName="h-10 w-full rounded-md px-0 shadow-sm shadow-neutral-200/50" className="px-3 text-sm" value={form.preset}
							onChange={(event) => { const preset = event.target.value as AgentProviderPreset; setForm((current) => ({ ...current, preset, baseUrl: baseUrlForPreset(preset), apiKey: "", model: "" })); }}>
							{PROVIDER_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
						</Select>
					</div>
					{form.preset === "custom" && (
						<div className="space-y-2">
							<Label htmlFor="agent-url">{t("agentAdmin.baseUrl")}</Label>
							<Input id="agent-url" type="url" value={form.baseUrl} placeholder="https://provider.example/v1" onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value, model: "" }))} required />
						</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="agent-key">{t("agentAdmin.apiKey")}</Label>
						<Input id="agent-key" type="password" value={form.apiKey} autoComplete="new-password" placeholder={canUseSavedKey ? t("agentAdmin.savedKeyPlaceholder") : t("agentAdmin.enterKeyPlaceholder")} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} />
						<p className="text-xs text-neutral-500">{canUseSavedKey ? t("agentAdmin.keySaved") : t("agentAdmin.keyNote")}</p>
					</div>
				</>}
			</Step>

			<Step number={2} title={t("agentAdmin.models")} description={t("agentAdmin.toolCalling")}>
				<div className="space-y-2">
					<div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-neutral-200 p-3">
						{modelsLoading && <p className="text-sm text-neutral-500">{t("agentAdmin.loadingModels")}</p>}
						{!modelsLoading && !models.length && <p className="text-sm text-neutral-500">{modelError ?? t("agentAdmin.modelsUnavailable")}</p>}
						{models.map((item) => <label key={item.id} className="flex items-start gap-2 text-sm"><Checkbox checked={selectedModelIds.includes(item.id)} onChange={(event) => setForm((current) => ({ ...current, model: toggleAgentModelId(current.model, item.id, event.target.checked) }))} /><span>{item.name === item.id ? item.id : `${item.name} · ${item.id}`}</span></label>)}
					</div>
					{modelSource === "suggested" && <p className="text-xs text-neutral-500">{t("agentAdmin.suggested")}</p>}
					{modelError && models.length > 0 && <p className="text-xs text-amber-700">{modelError}</p>}
					<Label htmlFor="agent-model-id" className="block pt-2 text-xs text-neutral-500">{t("agentAdmin.orEnterIds")}</Label>
					<Input id="agent-model-id" value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder={form.provider === "cloudflare" ? DEFAULT_CLOUDFLARE_MODEL : "gpt-4.1-mini, provider/another-model"} required />
				</div>
				{selectedModelIds.length > 0 && (
					<details className="group rounded-xl border border-neutral-200 p-3">
						<summary className="cursor-pointer text-sm font-medium text-neutral-800">{t("agentAdmin.advanced")}</summary>
						<div className="mt-3 space-y-3">
							<p className="text-xs text-neutral-500">{t("agentAdmin.ratesHint")}</p>
							{selectedModelIds.map((model) => models.find((item) => item.id === model)?.rates
								? <div key={model} className="grid gap-2 rounded-xl border border-neutral-200 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"><span className="min-w-0 break-all">{model}</span><span className="text-neutral-500">{t("agentAdmin.rateLine", { input: form.rates[model]?.input, output: form.rates[model]?.output })} <span className="text-xs">{t("agentAdmin.fromProvider")}</span></span></div>
								: <div key={model} className="grid gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]"><span className="min-w-0 break-all text-sm">{model}</span><label className="text-xs text-neutral-500">{t("agentAdmin.input")} <Input type="number" min="0" step="any" value={form.rates[model]?.input ?? ""} onChange={(event) => setForm((current) => updateAgentModelRate(current, model, "input", event.target.value))} placeholder={t("agentAdmin.usdPerM")} /></label><label className="text-xs text-neutral-500">{t("agentAdmin.output")} <Input type="number" min="0" step="any" value={form.rates[model]?.output ?? ""} onChange={(event) => setForm((current) => updateAgentModelRate(current, model, "output", event.target.value))} placeholder={t("agentAdmin.usdPerM")} /></label></div>)}
						</div>
					</details>
				)}
				<div className="flex flex-wrap items-center gap-3">
					<Button type="submit" disabled={!canSave}>{saving ? t("common.saving") : t("agentAdmin.save")}</Button>
					{status && <p role="status" className="text-sm text-neutral-700">{status}</p>}
				</div>
			</Step>
		</form>

		<Step number={3} title={t("agentAdmin.enable")}>
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm text-neutral-500">{configured ? t("agentAdmin.enableHint") : t("agentAdmin.enableNeedsProvider")}</p>
				<Switch checked={configured && assistantEnabled} disabled={!loaded || enabledSaving || !configured} onCheckedChange={setEnabled} aria-label={t("agentAdmin.enable")} />
			</div>
			{enabledStatus && <p role="status" className="text-sm text-red-700">{enabledStatus}</p>}
		</Step>
	</div>;
}
