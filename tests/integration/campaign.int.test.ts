import { mkdirSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { ChainedElevationProvider } from "@/lib/elevation/fallback";
import { OpenMeteoElevationProvider } from "@/lib/elevation/open-meteo";
import { ValhallaElevationProvider } from "@/lib/elevation/valhalla";
import { PhotonGeocodingProvider } from "@/lib/geocoding/photon";
import { ValhallaRoutingProvider } from "@/lib/routing/valhalla";
import { generateRoutes, routeSimilarity, MAX_VARIANT_SIMILARITY } from "@/lib/route-generator";
import type { ActivityType, RouteRequest } from "@/lib/types";

/**
 * Validation campaign against the real primary engine (Valhalla) — the list
 * of scenarios the product must handle well. It is opt-in (`npm run campaign`,
 * env CIRCUIT_CAMPAIGN=1) because it costs a few hundred routing calls on a
 * shared public instance; it writes a Markdown report under reports/.
 *
 * Every scenario records: requested vs obtained distance, D+, duration,
 * quality score, similarity between variants, routing calls and time.
 */
const ENABLED = process.env.CIRCUIT_CAMPAIGN === "1";
const VALHALLA = process.env.ROUTING_VALHALLA_URL ?? "https://valhalla1.openstreetmap.de";
const UA = process.env.GEOCODING_USER_AGENT ?? "circuit-campaign/0.1 (https://github.com/mathios939/circuit)";

interface Scenario {
  label: string;
  place: string;
  activity: ActivityType;
  distanceKm?: number;
  end?: string;
}

const SCENARIOS: Scenario[] = [
  { label: "Annecy · vélo · 50 km", place: "Annecy", activity: "road_cycling", distanceKm: 50 },
  { label: "Paris · course · 10 km", place: "Paris", activity: "running", distanceKm: 10 },
  { label: "Fontainebleau · VTT · 35 km", place: "Fontainebleau", activity: "mtb", distanceKm: 35 },
  { label: "Lyon · gravel · 70 km", place: "Lyon", activity: "gravel", distanceKm: 70 },
  { label: "Chamonix · trail · 20 km", place: "Chamonix", activity: "trail_running", distanceKm: 20 },
  { label: "La Rochelle · vélo · 40 km", place: "La Rochelle", activity: "road_cycling", distanceKm: 40 },
  { label: "Bordeaux · vélo · 60 km", place: "Bordeaux", activity: "road_cycling", distanceKm: 60 },
  { label: "Paris → Versailles · vélo", place: "Paris", end: "Versailles", activity: "road_cycling" },
  { label: "Annecy · vélo · 10 km", place: "Annecy", activity: "road_cycling", distanceKm: 10 },
  { label: "Annecy · vélo · 25 km", place: "Annecy", activity: "road_cycling", distanceKm: 25 },
  { label: "Annecy · vélo · 100 km", place: "Annecy", activity: "road_cycling", distanceKm: 100 },
];

interface Row {
  label: string;
  ok: boolean;
  error?: string;
  routes: number;
  distances: string;
  ascents: string;
  durations: string;
  scores: string;
  maxSimilarity: string;
  mismatch: string;
  calls: number;
  ms: number;
}

const rows: Row[] = [];
let online = false;

beforeAll(async () => {
  if (!ENABLED) return;
  try {
    const res = await fetch(`${VALHALLA}/status`, { signal: AbortSignal.timeout(8000) });
    online = res.status < 500;
  } catch {
    online = false;
  }
});

const it_ = ENABLED ? it : it.skip;

describe("validation campaign (real Valhalla + Photon + Open-Meteo)", () => {
  const routing = new ValhallaRoutingProvider({ baseUrl: VALHALLA, timeoutMs: 30_000 });
  const elevation = new ChainedElevationProvider([new OpenMeteoElevationProvider("https://api.open-meteo.com/v1/elevation"), new ValhallaElevationProvider(VALHALLA)]);
  const geocoder = new PhotonGeocodingProvider("https://photon.komoot.io", UA);

  for (const scenario of SCENARIOS) {
    it_(
      scenario.label,
      async () => {
        if (!online) {
          rows.push({ label: scenario.label, ok: false, error: "réseau indisponible", routes: 0, distances: "", ascents: "", durations: "", scores: "", maxSimilarity: "", mismatch: "", calls: 0, ms: 0 });
          throw new Error("network unreachable: campaign cannot run in this environment");
        }
        const started = performance.now();
        try {
          const start = (await geocoder.search(scenario.place, { limit: 1 }))[0];
          expect(start, `géocodage de ${scenario.place}`).toBeDefined();
          const end = scenario.end ? (await geocoder.search(scenario.end, { limit: 1 }))[0] : undefined;
          const request: RouteRequest = {
            mode: scenario.end ? "point_to_point" : "loop",
            activity: scenario.activity,
            start: { lat: start!.lat, lng: start!.lng, name: start!.name },
            end: end ? { lat: end.lat, lng: end.lng, name: end.name } : undefined,
            distanceKm: scenario.distanceKm,
            seed: 42,
          };
          const result = await generateRoutes(request, { routing, elevation, concurrency: 2, elevationSamples: 200 });
          let maxSim = 0;
          for (let i = 0; i < result.routes.length; i++) for (let j = i + 1; j < result.routes.length; j++) maxSim = Math.max(maxSim, routeSimilarity(result.routes[i]!.points, result.routes[j]!.points));
          rows.push({
            label: scenario.label,
            ok: true,
            routes: result.routes.length,
            distances: result.routes.map((r) => (r.stats.distanceM / 1000).toFixed(1)).join(" / "),
            ascents: result.routes.map((r) => (r.stats.hasElevation ? `+${Math.round(r.stats.ascentM)}` : "n/d")).join(" / "),
            durations: result.routes.map((r) => `${Math.round(r.stats.durationS / 60)} min`).join(" / "),
            scores: result.routes.map((r) => `${r.score.total}`).join(" / "),
            maxSimilarity: maxSim.toFixed(2),
            mismatch: result.distanceMismatch ? `demandé ${result.distanceMismatch.requestedKm}, obtenu ${result.distanceMismatch.bestKm}` : "–",
            calls: result.routingCalls,
            ms: Math.round(performance.now() - started),
          });
          expect(result.routes.length).toBeGreaterThanOrEqual(1);
          for (const r of result.routes) {
            expect(r.quality?.geometryValid).toBe(true);
            if (scenario.distanceKm && !result.distanceMismatch) expect(Math.abs(r.stats.distanceM - scenario.distanceKm * 1000) / (scenario.distanceKm * 1000)).toBeLessThanOrEqual(0.1);
          }
          expect(maxSim).toBeLessThan(MAX_VARIANT_SIMILARITY);
        } catch (e) {
          if (!rows.some((r) => r.label === scenario.label)) {
            rows.push({ label: scenario.label, ok: false, error: (e as Error).message, routes: 0, distances: "", ascents: "", durations: "", scores: "", maxSimilarity: "", mismatch: "", calls: 0, ms: Math.round(performance.now() - started) });
          }
          throw e;
        }
      },
      300_000,
    );
  }

  it_("writes the campaign report", () => {
    mkdirSync("reports", { recursive: true });
    const lines = [
      `# Campagne de validation Circuit — ${new Date().toISOString()}`,
      "",
      `Moteur : Valhalla (${VALHALLA}) · Géocodage : Photon · Altitude : Open-Meteo → Valhalla`,
      "",
      "| Scénario | OK | Propositions | Distances (km) | D+ (m) | Durées | Scores | Similarité max | Écart distance | Appels | Temps (ms) |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...rows.map((r) => `| ${r.label} | ${r.ok ? "✅" : `❌ ${r.error ?? ""}`} | ${r.routes} | ${r.distances} | ${r.ascents} | ${r.durations} | ${r.scores} | ${r.maxSimilarity} | ${r.mismatch} | ${r.calls} | ${r.ms} |`),
      "",
      "Les distances sont celles renvoyées par le moteur de routing ; « Écart distance » signale les cas où aucune boucle n'a été trouvée dans ±10 % (proposition la plus proche affichée avec avertissement).",
    ];
    writeFileSync("reports/campaign.md", lines.join("\n"));
    console.info(lines.join("\n"));
  });
});
