"use client";

import type { RouteResult } from "@/lib/types";
import { ACTIVITY_LABELS } from "@/lib/activities/profiles";
import { DIFFICULTY_LABELS } from "@/lib/stats/difficulty";
import { formatDistance, formatDurationApprox, formatElevation } from "@/lib/utils/format";

/** Headline strip: distance · D+ · duration · activity, plus difficulty. */
export function RouteSummary({ route }: { route: RouteResult }) {
  const s = route.stats;
  return (
    <div className="rounded-2xl bg-ink-900 p-4 text-white" data-testid="route-summary">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-bold tabular-nums" data-testid="stat-distance">
          {formatDistance(s.distanceM)}
        </span>
        <span className="text-lg font-semibold tabular-nums text-white/90" data-testid="stat-ascent">
          {s.hasElevation ? formatElevation(s.ascentM, "+") : "D+ indisponible"}
        </span>
        <span className="text-lg font-semibold tabular-nums text-white/90">{formatDurationApprox(s.durationS)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/70">
        <span>{ACTIVITY_LABELS[route.activity]}</span>
        <span aria-hidden>·</span>
        <span>{route.mode === "loop" ? "Boucle" : "Point à point"}</span>
        <span aria-hidden>·</span>
        <span>{DIFFICULTY_LABELS[s.difficulty]}</span>
        <span aria-hidden>·</span>
        <span>
          Score Circuit <strong className="text-white">{route.score.total}</strong>/100
        </span>
      </div>
    </div>
  );
}
