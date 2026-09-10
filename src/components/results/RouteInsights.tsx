"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { RouteInsight, RouteScore, RouteScoreSummary } from "@/lib/types";

const SUMMARY_ROWS: { key: keyof RouteScoreSummary; label: string }[] = [
  { key: "distance", label: "Distance" },
  { key: "nature", label: "Nature" },
  { key: "calm", label: "Tranquillité" },
  { key: "difficulty", label: "Difficulté" },
  { key: "variety", label: "Variété" },
];

/** "Score Circuit" with its sub-scores, then why this route was recommended. */
export function RouteInsights({ insights, score }: { insights: RouteInsight[]; score: RouteScore }) {
  return (
    <div className="space-y-3" data-testid="route-insights">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Score Circuit</p>
          <p className="text-sm font-bold tabular-nums text-ink-900" data-testid="score-total">
            {score.total}
            <span className="text-xs font-normal text-ink-500">/100</span>
          </p>
        </div>
        <ul className="space-y-1">
          {SUMMARY_ROWS.map(({ key, label }) => (
            <li key={key} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-ink-700">{label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.summary[key]} aria-label={label}>
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${score.summary[key]}%` }} />
              </span>
              <span className="w-8 text-right tabular-nums text-ink-900">{score.summary[key]}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-ink-500">Estimations calculées à partir des attributs OpenStreetMap et du relief : elles orientent le choix, elles ne remplacent pas une reconnaissance.</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Pourquoi ce parcours</p>
        <ul className="space-y-1.5">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-ink-700">
              {insight.tone === "positive" ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
              ) : insight.tone === "warning" ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              ) : (
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden />
              )}
              <span>{insight.message}</span>
            </li>
          ))}
        </ul>
      </div>

      <details className="text-xs text-ink-500">
        <summary className="cursor-pointer select-none hover:text-ink-900">Détail du calcul</summary>
        <ul className="mt-1.5 space-y-1">
          {score.components.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-ink-700">{c.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                <span className="block h-full rounded-full bg-ink-400" style={{ width: `${Math.round(c.value * 100)}%` }} />
              </span>
              <span className="w-8 text-right tabular-nums">{Math.round(c.value * 100)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
