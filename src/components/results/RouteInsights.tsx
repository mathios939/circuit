"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { RouteInsight, RouteScore } from "@/lib/types";

/** Why this route was recommended, and what to watch out for. */
export function RouteInsights({ insights, score }: { insights: RouteInsight[]; score: RouteScore }) {
  return (
    <div className="space-y-2" data-testid="route-insights">
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
      <details className="text-xs text-ink-500">
        <summary className="cursor-pointer select-none hover:text-ink-900">Détail du score ({score.total}/100)</summary>
        <ul className="mt-1.5 space-y-1">
          {score.components.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-ink-700">{c.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.round(c.value * 100)}%` }} />
              </span>
              <span className="w-8 text-right tabular-nums">{Math.round(c.value * 100)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
