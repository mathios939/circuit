"use client";

import { useMemo, useRef } from "react";
import type { RouteResult } from "@/lib/types";
import { pointAtDistance, samplePath } from "@/lib/geo";
import { formatDistance, formatElevation } from "@/lib/utils/format";
import { useRouteStore } from "@/store/route-store";

const W = 600;
const H = 150;
const PAD = { top: 10, right: 8, bottom: 22, left: 40 };

/**
 * Interactive elevation profile (SVG). Hovering synchronises with the map
 * through the store's `hoverDist`; map hover moves the cursor here too.
 */
export function ElevationProfile({ route }: { route: RouteResult }) {
  const hoverDist = useRouteStore((s) => s.hoverDist);
  const setHoverDist = useRouteStore((s) => s.setHoverDist);
  const svgRef = useRef<SVGSVGElement>(null);

  const model = useMemo(() => buildModel(route), [route]);
  if (!model) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-xs text-ink-500" data-testid="elevation-profile-empty">
        Altitude indisponible pour ce parcours.
      </div>
    );
  }

  const { samples, total, minEle, maxEle, areaPath, linePath, segments } = model;
  const xOf = (dist: number) => PAD.left + (dist / total) * (W - PAD.left - PAD.right);
  const yOf = (ele: number) => PAD.top + (1 - (ele - minEle) / Math.max(1, maxEle - minEle)) * (H - PAD.top - PAD.bottom);
  const hover = hoverDist !== null ? pointAtDistance(route.points, hoverDist) : undefined;

  const onMove = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const dist = ((x - PAD.left) / (W - PAD.left - PAD.right)) * total;
    setHoverDist(Math.max(0, Math.min(total, dist)));
  };

  const ticks = niceTicks(minEle, maxEle, 3);
  const kmTicks = kmTickValues(total);

  return (
    <div className="space-y-1" data-testid="elevation-profile">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Profil altimétrique</p>
        <p className="h-4 text-xs tabular-nums text-ink-700" aria-live="polite">
          {hover && typeof hover.ele === "number" ? `${formatDistance(hover.dist)} · ${formatElevation(hover.ele)}${gradientAt(samples, hover.dist)}` : ""}
        </p>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full touch-none select-none rounded-lg bg-white"
        role="img"
        aria-label={`Profil altimétrique, altitude de ${Math.round(minEle)} à ${Math.round(maxEle)} m`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHoverDist(null)}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) onMove(t.clientX);
        }}
        onTouchEnd={() => setHoverDist(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(t)} y2={yOf(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD.left - 4} y={yOf(t) + 3} textAnchor="end" fontSize={9} fill="#6b7280">
              {Math.round(t)} m
            </text>
          </g>
        ))}
        {segments.map((seg, i) => (
          <path key={i} d={seg.d} fill={seg.color} opacity={0.85} />
        ))}
        <path d={areaPath} fill="url(#elev-fill)" opacity={0.15} />
        <path d={linePath} fill="none" stroke="#111827" strokeWidth={1.2} />
        {kmTicks.map((km) => (
          <text key={km} x={xOf(km * 1000)} y={H - 6} textAnchor="middle" fontSize={9} fill="#6b7280">
            {km} km
          </text>
        ))}
        {hover && typeof hover.ele === "number" ? (
          <g>
            <line x1={xOf(hover.dist)} x2={xOf(hover.dist)} y1={PAD.top} y2={H - PAD.bottom} stroke="#ff5a1f" strokeWidth={1} strokeDasharray="3 2" />
            <circle cx={xOf(hover.dist)} cy={yOf(hover.ele)} r={4} fill="#ff5a1f" stroke="#fff" strokeWidth={1.5} />
          </g>
        ) : null}
        <defs>
          <linearGradient id="elev-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#111827" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

interface ProfileModel {
  samples: { dist: number; ele: number }[];
  total: number;
  minEle: number;
  maxEle: number;
  areaPath: string;
  linePath: string;
  segments: { d: string; color: string }[];
}

function buildModel(route: RouteResult): ProfileModel | null {
  if (!route.stats.hasElevation || route.points.length < 2) return null;
  const total = route.points[route.points.length - 1]!.dist;
  const raw = samplePath(route.points, 25, 240).filter((p): p is typeof p & { ele: number } => typeof p.ele === "number");
  if (raw.length < 2) return null;
  const samples = raw.map((p) => ({ dist: p.dist, ele: p.ele }));
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (const s of samples) {
    if (s.ele < minEle) minEle = s.ele;
    if (s.ele > maxEle) maxEle = s.ele;
  }
  const span = Math.max(50, maxEle - minEle);
  minEle = Math.floor((minEle - span * 0.1) / 10) * 10;
  maxEle = Math.ceil((maxEle + span * 0.05) / 10) * 10;

  const xOf = (dist: number) => PAD.left + (dist / total) * (W - PAD.left - PAD.right);
  const yOf = (ele: number) => PAD.top + (1 - (ele - minEle) / Math.max(1, maxEle - minEle)) * (H - PAD.top - PAD.bottom);
  const baseline = H - PAD.bottom;

  const linePath = samples.map((s, i) => `${i === 0 ? "M" : "L"}${xOf(s.dist).toFixed(1)},${yOf(s.ele).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xOf(total).toFixed(1)},${baseline} L${xOf(0).toFixed(1)},${baseline} Z`;

  const segments: { d: string; color: string }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const grad = ((b.ele - a.ele) / Math.max(1, b.dist - a.dist)) * 100;
    segments.push({
      d: `M${xOf(a.dist).toFixed(1)},${yOf(a.ele).toFixed(1)} L${xOf(b.dist).toFixed(1)},${yOf(b.ele).toFixed(1)} L${xOf(b.dist).toFixed(1)},${baseline} L${xOf(a.dist).toFixed(1)},${baseline} Z`,
      color: gradientColor(grad),
    });
  }
  return { samples, total, minEle, maxEle, areaPath, linePath, segments };
}

function gradientColor(grad: number): string {
  const g = Math.abs(grad);
  if (g < 3) return "#d1fae5";
  if (g < 6) return "#fde68a";
  if (g < 10) return "#fdba74";
  return "#fca5a5";
}

function gradientAt(samples: { dist: number; ele: number }[], dist: number): string {
  let i = 1;
  while (i < samples.length - 1 && samples[i]!.dist < dist) i++;
  const a = samples[i - 1]!;
  const b = samples[i]!;
  const run = b.dist - a.dist;
  if (run <= 0) return "";
  const grad = ((b.ele - a.ele) / run) * 100;
  return ` · ${grad >= 0 ? "+" : ""}${grad.toFixed(1)} %`;
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rawStep = span / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

function kmTickValues(totalM: number): number[] {
  const km = totalM / 1000;
  const step = km <= 6 ? 1 : km <= 15 ? 2 : km <= 40 ? 5 : km <= 100 ? 10 : 25;
  const out: number[] = [];
  for (let v = step; v < km - step * 0.3; v += step) out.push(v);
  return out;
}
