"use client";

import { Field, inputClass } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { PlaceSearch } from "@/components/builder/PlaceSearch";
import { getActivityProfile } from "@/lib/activities/profiles";
import { useRouteStore } from "@/store/route-store";

export function ModeAndDistance() {
  const mode = useRouteStore((s) => s.mode);
  const setMode = useRouteStore((s) => s.setMode);
  const activity = useRouteStore((s) => s.activity);
  const start = useRouteStore((s) => s.start);
  const setStart = useRouteStore((s) => s.setStart);
  const end = useRouteStore((s) => s.end);
  const setEnd = useRouteStore((s) => s.setEnd);
  const distanceKm = useRouteStore((s) => s.distanceKm);
  const setDistanceKm = useRouteStore((s) => s.setDistanceKm);
  const p2pDistanceEnabled = useRouteStore((s) => s.p2pDistanceEnabled);
  const setP2pDistanceEnabled = useRouteStore((s) => s.setP2pDistanceEnabled);
  const pickTarget = useRouteStore((s) => s.pickTarget);
  const setPickTarget = useRouteStore((s) => s.setPickTarget);
  const profile = getActivityProfile(activity);

  return (
    <div className="space-y-4">
      <Field label="Départ" htmlFor="start-search">
        <PlaceSearch
          value={start}
          onChange={setStart}
          testId="start-search"
          allowGeolocation
          picking={pickTarget === "start"}
          onPickOnMap={() => setPickTarget(pickTarget === "start" ? null : "start")}
          placeholder="Annecy, Tour Eiffel, 10 rue de Rivoli Paris…"
        />
      </Field>

      <Field label="Type de parcours">
        <Segmented
          ariaLabel="Type de parcours"
          value={mode}
          onChange={setMode}
          options={[
            { value: "loop", label: "Boucle", title: "Retour au point de départ" },
            { value: "point_to_point", label: "A → B", title: "D'un point à un autre" },
          ]}
        />
      </Field>

      {mode === "point_to_point" ? (
        <Field label="Arrivée">
          <PlaceSearch
            value={end}
            onChange={setEnd}
            testId="end-search"
            picking={pickTarget === "end"}
            onPickOnMap={() => setPickTarget(pickTarget === "end" ? null : "end")}
            placeholder="Destination"
          />
        </Field>
      ) : null}

      <Field
        label={mode === "loop" ? "Distance cible" : "Distance cible (optionnel)"}
        htmlFor="distance-input"
        hint={`Entre ${profile.minDistanceKm} et ${profile.maxDistanceKm} km pour cette activité.`}
        action={
          mode === "point_to_point" ? (
            <label className="flex items-center gap-1.5 text-xs text-ink-500">
              <input type="checkbox" checked={p2pDistanceEnabled} onChange={(e) => setP2pDistanceEnabled(e.target.checked)} className="accent-brand-600" />
              Imposer
            </label>
          ) : undefined
        }
      >
        <div className="relative">
          <input
            id="distance-input"
            data-testid="distance-input"
            type="number"
            inputMode="decimal"
            min={profile.minDistanceKm}
            max={profile.maxDistanceKm}
            step={1}
            disabled={mode === "point_to_point" && !p2pDistanceEnabled}
            className={`${inputClass} pr-12 disabled:bg-ink-50 disabled:text-ink-300`}
            value={distanceKm ?? ""}
            onChange={(e) => setDistanceKm(e.target.value === "" ? null : Number(e.target.value))}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">km</span>
        </div>
      </Field>
    </div>
  );
}
