"use client";

import type { RouteDNA as DNA } from "@/lib/types";

const ROWS: { key: keyof Omit<DNA, "estimated">; label: string }[] = [
  { key: "nature", label: "Nature" },
  { key: "calm", label: "Calme" },
  { key: "difficulty", label: "Difficulté" },
  { key: "technical", label: "Technique" },
  { key: "panorama", label: "Panorama" },
];

/** Visual summary of the character of a route. */
export function RouteDNA({ dna }: { dna: DNA }) {
  return (
    <div className="space-y-2" data-testid="route-dna">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Route DNA</p>
        {dna.estimated ? <span className="text-[10px] text-ink-500">Estimations (données partielles)</span> : <span className="text-[10px] text-ink-500">Estimations</span>}
      </div>
      <dl className="space-y-1.5">
        {ROWS.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-[80px_1fr_32px] items-center gap-2 text-xs">
            <dt className="text-ink-700">{label}</dt>
            <dd className="h-2 overflow-hidden rounded-full bg-ink-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={dna[key]} aria-label={label}>
              <div className="h-full rounded-full bg-ink-900 transition-all" style={{ width: `${dna[key]}%` }} />
            </dd>
            <dd className="text-right font-semibold tabular-nums text-ink-900">{dna[key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
