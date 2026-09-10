"use client";

import { ChevronDown } from "lucide-react";
import { Field, Toggle, inputClass } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { getActivityProfile } from "@/lib/activities/profiles";
import { useRouteStore } from "@/store/route-store";

/** "Mode D": constraints beyond distance and place. */
export function AdvancedOptions() {
  const show = useRouteStore((s) => s.showAdvanced);
  const toggle = useRouteStore((s) => s.toggleAdvanced);
  const advanced = useRouteStore((s) => s.advanced);
  const setAdvanced = useRouteStore((s) => s.setAdvanced);
  const setPreferences = useRouteStore((s) => s.setPreferences);
  const activity = useRouteStore((s) => s.activity);
  const profile = getActivityProfile(activity);
  const p = advanced.preferences;
  const isBike = profile.locomotion === "bicycle";

  const numberField = (label: string, value: number | undefined, onChange: (v: number | undefined) => void, unit: string, id: string, step = 50) => (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={step}
          className={`${inputClass} pr-12`}
          value={value ?? ""}
          placeholder="—"
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">{unit}</span>
      </div>
    </Field>
  );

  return (
    <div className="rounded-xl border border-ink-200 bg-white">
      <button type="button" onClick={toggle} aria-expanded={show} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-ink-900">
        Options avancées
        <ChevronDown className={`h-4 w-4 text-ink-500 transition-transform ${show ? "rotate-180" : ""}`} />
      </button>
      {show ? (
        <div className="space-y-4 border-t border-ink-100 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            {numberField("D+ souhaité", advanced.elevationTargetM, (v) => setAdvanced({ elevationTargetM: v }), "m", "elevation-target")}
            {numberField("D+ maximal", advanced.elevationMaxM, (v) => setAdvanced({ elevationMaxM: v }), "m", "elevation-max")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tolérance distance" htmlFor="tolerance">
              <select id="tolerance" className={inputClass} value={advanced.distanceTolerance} onChange={(e) => setAdvanced({ distanceTolerance: Number(e.target.value) })}>
                <option value={0.03}>± 3 %</option>
                <option value={0.05}>± 5 %</option>
                <option value={0.1}>± 10 %</option>
                <option value={0.15}>± 15 %</option>
              </select>
            </Field>
            {numberField("Durée visée", advanced.durationMinutes, (v) => setAdvanced({ durationMinutes: v }), "min", "duration", 15)}
          </div>

          <Field label="Dénivelé">
            <Segmented
              size="sm"
              ariaLabel="Dénivelé"
              value={p.elevationMode ?? "auto"}
              onChange={(v) => setPreferences({ elevationMode: v })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "minimize", label: "Minimiser" },
                { value: "maximize", label: "Maximiser" },
              ]}
            />
          </Field>

          <Field label="Surface">
            <Segmented
              size="sm"
              ariaLabel="Surface"
              value={p.surface ?? "any"}
              onChange={(v) => setPreferences({ surface: v })}
              options={[
                { value: "any", label: "Indifférent" },
                { value: "paved", label: "Route" },
                { value: "unpaved", label: "Chemins" },
              ]}
            />
          </Field>

          <div className="space-y-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Préférences</p>
            <Toggle id="pref-busy" label="Éviter les routes fréquentées" checked={Boolean(p.avoidBusyRoads)} onChange={(v) => setPreferences({ avoidBusyRoads: v })} />
            <Toggle id="pref-major" label="Éviter les grands axes" checked={Boolean(p.avoidMajorRoads)} onChange={(v) => setPreferences({ avoidMajorRoads: v })} />
            <Toggle id="pref-quiet" label="Privilégier les routes calmes" checked={Boolean(p.preferQuietRoads)} onChange={(v) => setPreferences({ preferQuietRoads: v })} />
            <Toggle id="pref-nature" label="Privilégier la nature" checked={Boolean(p.preferNature)} onChange={(v) => setPreferences({ preferNature: v })} />
            {isBike ? <Toggle id="pref-cycleways" label="Privilégier les pistes cyclables" checked={Boolean(p.preferCycleways)} onChange={(v) => setPreferences({ preferCycleways: v })} /> : null}
            {activity !== "road_cycling" ? (
              <Toggle id="pref-trails" label="Privilégier les chemins" checked={Boolean(p.preferTrails)} onChange={(v) => setPreferences({ preferTrails: v })} />
            ) : null}
            {activity === "mtb" ? (
              <Toggle id="pref-single" label="Privilégier les singles" checked={Boolean(p.preferSingletracks)} onChange={(v) => setPreferences({ preferSingletracks: v })} />
            ) : null}
            <Toggle id="pref-scenic" label="Parcours panoramique" checked={Boolean(p.scenic)} onChange={(v) => setPreferences({ scenic: v })} />
            <Toggle id="pref-ferry" label="Éviter les ferries" checked={p.avoidFerries ?? true} onChange={(v) => setPreferences({ avoidFerries: v })} />
            <Toggle id="pref-private" label="Éviter les routes privées" checked={p.avoidPrivateRoads ?? true} onChange={(v) => setPreferences({ avoidPrivateRoads: v })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
