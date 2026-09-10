"use client";

import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/Feedback";

interface Probe {
  category: "routing" | "geocoding" | "elevation" | "maps";
  provider: string;
  role: "primary" | "fallback";
  status: "ok" | "error" | "skipped";
  latencyMs?: number;
  httpStatus?: number;
  errorType?: string;
  message?: string;
}

interface HealthResponse {
  status: "ok" | "degraded" | "misconfigured";
  message?: string;
  configuration?: Record<string, unknown>;
  probes?: Probe[];
  error?: { message?: string };
}

const CATEGORY_LABELS: Record<Probe["category"], string> = { routing: "Routing", geocoding: "Geocoding", elevation: "Elevation", maps: "Maps" };

async function probeHealth(): Promise<{ data?: HealthResponse; error?: string }> {
  try {
    const res = await fetch("/api/health?probe=1", { cache: "no-store" });
    const json = (await res.json()) as HealthResponse;
    return { data: json, error: res.ok ? undefined : (json.error?.message ?? json.message ?? `HTTP ${res.status}`) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Diagnostic impossible." };
  }
}

/** Provider health screen (development). Never displays a key. */
export function DiagnosticsView() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = (outcome: { data?: HealthResponse; error?: string }) => {
    if (outcome.data) setData(outcome.data);
    setError(outcome.error ?? null);
    setLoading(false);
  };

  const run = () => {
    setLoading(true);
    setError(null);
    void probeHealth().then(apply);
  };

  // Initial probe: state is only touched from the promise callbacks.
  useEffect(() => {
    let cancelled = false;
    void probeHealth().then((outcome) => {
      if (!cancelled) apply(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const probes = data?.probes ?? [];
  const warnings = Array.isArray(data?.configuration?.warnings) ? (data.configuration.warnings as string[]) : [];
  const byCategory = (["routing", "geocoding", "elevation", "maps"] as const).map((c) => ({ category: c, items: probes.filter((p) => p.category === c) }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Diagnostic des services</h1>
          <p className="text-sm text-ink-500">
            Statut global :{" "}
            <span className={`font-semibold ${data?.status === "ok" ? "text-brand-700" : data?.status === "degraded" ? "text-amber-700" : "text-red-700"}`}>{data?.status ?? "…"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={run} loading={loading} icon={<RefreshCw className="h-4 w-4" />}>
            Relancer
          </Button>
          <Link href="/" className="inline-flex h-10 items-center rounded-xl border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 hover:bg-ink-50">
            Retour à l&apos;application
          </Link>
        </div>
      </header>

      {error ? <ErrorBanner message={error} /> : null}

      {warnings.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="config-warnings">
          <h2 className="font-semibold">Avertissements de configuration</h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {byCategory.map(({ category, items }) => (
        <section key={category} className="rounded-xl border border-ink-200 bg-white" aria-labelledby={`diag-${category}`}>
          <h2 id={`diag-${category}`} className="border-b border-ink-100 px-4 py-2 text-sm font-semibold text-ink-900">
            {CATEGORY_LABELS[category]}
          </h2>
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-500">{loading ? "Test en cours…" : "Aucune sonde."}</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {items.map((p, i) => (
                <li key={`${p.provider}-${i}`} className="flex items-start gap-3 px-4 py-3 text-sm" data-testid="probe-row">
                  {p.status === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-label="OK" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Erreur" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">
                      {p.provider} <span className="text-xs font-normal text-ink-500">({p.role === "primary" ? "principal" : "secours"})</span>
                    </p>
                    {p.status === "ok" ? (
                      <p className="text-xs text-ink-500">OK · latence {p.latencyMs} ms</p>
                    ) : (
                      <p className="text-xs text-red-700">
                        {p.errorType ?? "erreur"}
                        {p.httpStatus ? ` · HTTP ${p.httpStatus}` : ""} · {p.latencyMs} ms{p.message ? ` · ${p.message}` : ""}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {data?.configuration ? (
        <details className="rounded-xl border border-ink-200 bg-white p-4 text-xs">
          <summary className="cursor-pointer font-semibold text-ink-900">Configuration (sans secret)</summary>
          <pre className="mt-2 overflow-x-auto text-[11px] text-ink-700">{JSON.stringify(data.configuration, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}
