"use client";

import type { RouteAdjustment, RouteResult } from "@/lib/types";
import { ADJUSTMENT_LABELS } from "@/lib/route-generator/adjust";
import { getActivityProfile } from "@/lib/activities/profiles";
import { useRouteStore } from "@/store/route-store";

const ORDER: RouteAdjustment[] = ["distance_plus", "distance_minus", "easier", "harder", "more_nature", "more_rolling", "less_elevation", "more_elevation", "more_quiet"];

/** Quick "keep the character, tweak one thing" regeneration buttons. */
export function AdjustButtons({ route }: { route: RouteResult }) {
  const adjust = useRouteStore((s) => s.adjust);
  const status = useRouteStore((s) => s.status);
  if (!route.request || route.provider === "gpx-import" || route.provider === "shared-link") return null;
  const profile = getActivityProfile(route.activity);
  const km = route.stats.distanceM / 1000;
  const disabled = (a: RouteAdjustment): boolean => {
    if (status === "loading") return true;
    if (a === "distance_plus" || a === "harder") return km + 5 > profile.maxDistanceKm;
    if (a === "distance_minus" || a === "easier") return km - 5 < profile.minDistanceKm;
    if (a === "less_elevation" || a === "more_elevation") return !route.stats.hasElevation;
    if (a === "more_nature") return route.activity === "road_cycling";
    return false;
  };
  return (
    <div className="space-y-2" data-testid="adjust-buttons">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Ajuster ce parcours</p>
      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((a) => (
          <button
            key={a}
            type="button"
            disabled={disabled(a)}
            onClick={() => adjust(a)}
            className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-ink-900 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ADJUSTMENT_LABELS[a]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-500">Le parcours est recalculé en conservant sa direction générale.</p>
    </div>
  );
}
