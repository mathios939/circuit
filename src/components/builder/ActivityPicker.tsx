"use client";

import { Bike, Footprints, Mountain, Waypoints, Timer, TreePine, MountainSnow } from "lucide-react";
import type { ActivityType } from "@/lib/types";
import { ACTIVITY_LABELS } from "@/lib/activities/profiles";
import { useRouteStore } from "@/store/route-store";

const ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  road_cycling: Bike,
  gravel: Waypoints,
  mtb: Mountain,
  running: Timer,
  trail_running: MountainSnow,
  hiking: TreePine,
  walking: Footprints,
};

const ORDER: ActivityType[] = ["road_cycling", "gravel", "mtb", "running", "trail_running", "hiking", "walking"];

export function ActivityPicker() {
  const activity = useRouteStore((s) => s.activity);
  const setActivity = useRouteStore((s) => s.setActivity);
  return (
    <div role="radiogroup" aria-label="Activité" className="grid grid-cols-4 gap-2">
      {ORDER.map((id) => {
        const Icon = ICONS[id];
        const active = id === activity;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`activity-${id}`}
            onClick={() => setActivity(id)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] font-medium transition-all ${
              active ? "border-ink-900 bg-ink-900 text-white shadow-sm" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="leading-tight">{ACTIVITY_LABELS[id]}</span>
          </button>
        );
      })}
    </div>
  );
}
