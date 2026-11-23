"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, LoaderCircle } from "@/components/icons";
import { authFetch } from "@/lib/auth/client";

type CloudMailRecord = { type: string; name: string; value: string; priority: number | null; status: string | null };
export type CloudMailState = {
  enabled: boolean;
  domain: string | null;
  setUp: boolean;
  status: string | null;
  records: CloudMailRecord[];
  /** Optional records that let mail apps configure themselves (absent before the Cloud sent them). */
  appRecords?: { type: string; name: string; value: string; found: boolean }[];
  checkedAt: number | null;
  error: string | null;
  autoConnect: boolean;
  providerName: string | null;
  cloudflareUrl: string | null;
};

/** Resend's statuses grouped for people. */
export function cloudMailState(status: string | null): "verified" | "waiting" | "failed" | "none" {
  if (!status) return "none";
  if (status === "verified") return "verified";
  if (status === "failed" || status === "temporary_failure" || status === "partially_failed") return "failed";
  return "waiting";
}

const STATE_KEY = { verified: "domains.cloudMailStateVerified", waiting: "domains.cloudMailStateWaiting", failed: "domains.cloudMailStateFailed", none: "domains.cloudMailStateNone" } as const;
const STATE_CLASS = {
  verified: "bg-emerald-50 text-emerald-700",
  waiting: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  none: "bg-neutral-100 text-neutral-600",
} as const;

function CopyValue({ value }: { value: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex max-w-full items-start gap-1.5">
      <code className="break-all font-mono text-xs">{value}</code>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-700"
        aria-label={copied ? t("domains.cloudMailCopied") : t("domains.cloudMailCopy")}
        title={copied ? t("domains.cloudMailCopied") : t("domains.cloudMailCopy")}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

/** DNS setup for a workspace whose mail FlareSuite Cloud runs: records, checks and the provider's automatic setup. */
export default function CloudMailPanel() {
  const { t, locale } = useLanguage();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const returned = useRef(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cloud-mail"],
    queryFn: async () => {
      const res = await authFetch("/api/cloud-mail");
      if (!res.ok) throw new Error("unavailable");
      return (await res.json()) as CloudMailState;
    },
    // While waiting for DNS, follow what the Cloud finds (its webhook and sweep update it).
    refetchInterval: (query) => (cloudMailState(query.state.data?.status ?? null) === "verified" ? false : 30_000),
  });

  const check = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/cloud-mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check" }) });
      if (!res.ok) throw new Error("unavailable");
      return (await res.json()) as CloudMailState;
    },
    onSuccess: (next) => {
      qc.setQueryData(["cloud-mail"], next);
      setMessage(cloudMailState(next.status) === "verified" ? null : t("domains.cloudMailCheckPending"));
    },
    onError: () => setMessage(t("domains.cloudMailUnavailable")),
  });

  const connect = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/cloud-mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect" }) });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "unavailable");
      return body.url;
    },
    onSuccess: (url) => { window.location.href = url; },
    onError: (error) => setMessage(error instanceof Error ? error.message : t("domains.cloudMailUnavailable")),
  });

  // Back from the DNS provider's automatic setup: check right away.
  useEffect(() => {
    if (returned.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("dns") !== "connected") return;
    returned.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    check.mutate();
  }, [check]);

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />;
  if (isError || !data) return <p className="text-sm text-red-600">{t("domains.cloudMailUnavailable")}</p>;

  const state = cloudMailState(data.status);
  const domain = data.domain ?? "";
  return (
    <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5" data-testid="cloud-mail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">{domain}</h2>
          <p className="mt-1 text-sm text-neutral-500">{t("domains.cloudMailBody")}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATE_CLASS[state]}`} data-testid="cloud-mail-state">{t(STATE_KEY[state])}</span>
      </div>

      {!data.setUp ? (
        <p className="text-sm text-neutral-600">{t("domains.cloudMailNotSetUp")}</p>
      ) : (
        <>
          {state === "verified" ? (
            <p className="text-sm text-emerald-700">{t("domains.cloudMailVerified", { domain })}</p>
          ) : (
            <div className="space-y-3 rounded-lg bg-neutral-50 p-4">
              {data.autoConnect && data.providerName ? (
                <>
                  <p className="text-sm text-neutral-600">{t("domains.cloudMailAutoHint", { provider: data.providerName })}</p>
                  <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                    {connect.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                    {t("domains.cloudMailAuto", { provider: data.providerName })}
                  </Button>
                </>
              ) : (
                data.providerName && <p className="text-sm text-neutral-600">{t("domains.cloudMailManualProvider", { provider: data.providerName })}</p>
              )}
              {data.cloudflareUrl && (
                <div>
                  <Button asChild variant="outline">
                    <a href={data.cloudflareUrl} target="_blank" rel="noopener noreferrer" data-testid="cloud-mail-cloudflare">{t("domains.cloudMailOpenCloudflare")}</a>
                  </Button>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium">{t("domains.cloudMailRecords")}</h3>
            <p className="mt-1 text-xs text-neutral-500">{t("domains.cloudMailRecordsHint", { domain })}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="cloud-mail-records">
                <thead className="text-xs text-neutral-500">
                  <tr className="border-b border-neutral-200">
                    <th className="py-2 pr-3 font-medium">{t("domains.cloudMailType")}</th>
                    <th className="py-2 pr-3 font-medium">{t("domains.cloudMailName")}</th>
                    <th className="py-2 pr-3 font-medium">{t("domains.cloudMailValue")}</th>
                    <th className="py-2 pr-3 font-medium">{t("domains.cloudMailPriority")}</th>
                    <th className="py-2 font-medium">{t("domains.cloudMailStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record, index) => (
                    <tr key={`${record.type}-${record.name}-${index}`} className="border-b border-neutral-100 align-top">
                      <td className="py-2.5 pr-3 font-mono text-xs">{record.type}</td>
                      <td className="min-w-[8rem] py-2.5 pr-3"><CopyValue value={record.name} /></td>
                      <td className="min-w-[14rem] py-2.5 pr-3"><CopyValue value={record.value} /></td>
                      <td className="py-2.5 pr-3 text-xs">{record.priority ?? ""}</td>
                      <td className={`py-2.5 text-xs ${record.status === "verified" ? "text-emerald-600" : "text-neutral-500"}`}>
                        {record.status === "verified" ? t("domains.cloudMailFound") : t("domains.cloudMailMissing")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!!data.appRecords?.length && (
            <div>
              <h3 className="text-sm font-medium">{t("domains.cloudMail.appsTitle")}</h3>
              <p className="mt-1 text-xs text-neutral-500">{t("domains.cloudMail.appsBody")}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="cloud-mail-app-records">
                  <thead className="text-xs text-neutral-500">
                    <tr className="border-b border-neutral-200">
                      <th className="py-2 pr-3 font-medium">{t("domains.cloudMailType")}</th>
                      <th className="py-2 pr-3 font-medium">{t("domains.cloudMailName")}</th>
                      <th className="py-2 pr-3 font-medium">{t("domains.cloudMailValue")}</th>
                      <th className="py-2 font-medium">{t("domains.cloudMailStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.appRecords.map((record) => (
                      <tr key={`${record.type}-${record.name}`} className="border-b border-neutral-100 align-top">
                        <td className="py-2.5 pr-3 font-mono text-xs">{record.type}</td>
                        <td className="min-w-[8rem] py-2.5 pr-3"><CopyValue value={record.name} /></td>
                        <td className="min-w-[14rem] py-2.5 pr-3"><CopyValue value={record.value} /></td>
                        <td className={`py-2.5 text-xs ${record.found ? "text-emerald-600" : "text-neutral-500"}`}>
                          {record.found ? t("domains.cloudMailFound") : t("domains.cloudMail.appsMissing")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state === "verified" && data.autoConnect && data.providerName && !data.appRecords.every((record) => record.found) && (
                <Button className="mt-3" variant="outline" onClick={() => connect.mutate()} disabled={connect.isPending}>
                  {connect.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                  {t("domains.cloudMailAuto", { provider: data.providerName })}
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant={state === "verified" ? "outline" : "default"} onClick={() => check.mutate()} disabled={check.isPending}>
              {check.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              {check.isPending ? t("domains.cloudMailChecking") : t("domains.cloudMailCheck")}
            </Button>
            {data.checkedAt && (
              <span className="text-xs text-neutral-500">
                {t("domains.cloudMailLastChecked", { date: new Date(data.checkedAt).toLocaleString(locale) })}
              </span>
            )}
          </div>
        </>
      )}
      {message && <p className="text-sm text-neutral-600" role="status">{message}</p>}
    </section>
  );
}
