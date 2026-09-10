import { z } from "zod";
import { AppError } from "@/lib/errors";
import { fetchJson, UpstreamHttpError } from "@/lib/server/http";
import type { SurfaceType, WayType } from "@/lib/types";
import { buildRoutingIntent } from "./intent";
import { buildInstructions, countTurns, orsStepType } from "./instructions";
import type {
  CalculateLoopInput,
  CalculateRouteInput,
  RawRoute,
  RoutingProfileOptions,
  RoutingProvider,
} from "./provider";
import { segmentsFromIntervals } from "./snap";

export interface OpenRouteServiceOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

const extraSchema = z.object({ values: z.array(z.tuple([z.number(), z.number(), z.number()])) }).partial();

const responseSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.array(z.array(z.number()).min(2)) }),
      properties: z.object({
        summary: z.object({ distance: z.number(), duration: z.number().optional() }),
        segments: z
          .array(
            z.object({
              steps: z
                .array(
                  z.object({
                    distance: z.number().optional(),
                    duration: z.number().optional(),
                    type: z.number().optional(),
                    instruction: z.string().optional(),
                    name: z.string().optional(),
                    way_points: z.tuple([z.number(), z.number()]).optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
        extras: z.object({ surface: extraSchema.optional(), waytypes: extraSchema.optional() }).partial().optional(),
      }),
    }),
  ),
});

/** openrouteservice surface codes → SurfaceType. */
const ORS_SURFACE: Record<number, SurfaceType> = {
  0: "unknown",
  1: "paved",
  2: "gravel",
  3: "paved",
  4: "paved",
  5: "paved",
  6: "paved",
  7: "paved",
  8: "gravel",
  9: "gravel",
  10: "gravel",
  11: "trail",
  12: "trail",
  13: "trail",
  14: "paved",
  15: "trail",
  16: "trail",
  17: "trail",
  18: "trail",
};

/** openrouteservice waytype codes → WayType. */
const ORS_WAYTYPE: Record<number, WayType> = {
  0: "other",
  1: "major_road",
  2: "road",
  3: "residential",
  4: "path",
  5: "track",
  6: "cycleway",
  7: "footway",
  8: "footway",
  9: "ferry",
  10: "other",
};

function orsProfile(profile: RoutingProfileOptions): string {
  switch (profile.activity) {
    case "road_cycling":
      return "cycling-road";
    case "gravel":
      return "cycling-regular";
    case "mtb":
      return "cycling-mountain";
    case "trail_running":
    case "hiking":
      return "foot-hiking";
    default:
      return "foot-walking";
  }
}

function mapUpstreamError(e: unknown): AppError {
  if (e instanceof UpstreamHttpError) {
    const body = e.body as { error?: { code?: number; message?: string } | string } | null;
    const err = typeof body?.error === "object" ? body.error : undefined;
    const code = err?.code;
    if (e.status === 401 || e.status === 403) return new AppError("NOT_CONFIGURED", undefined, { details: "openrouteservice: invalid API key" });
    if (code === 2010) return new AppError("NOT_ROUTABLE", undefined, { details: `openrouteservice: ${err?.message ?? ""}` });
    if (code === 2009 || code === 2099) return new AppError("NO_ROUTE", undefined, { details: `openrouteservice: ${err?.message ?? ""}` });
    if (code === 2004) return new AppError("DISTANCE_UNREALISTIC", undefined, { details: `openrouteservice: ${err?.message ?? ""}` });
    if (e.status === 400 || e.status === 404) return new AppError("NO_ROUTE", undefined, { details: `openrouteservice: ${err?.message ?? "bad request"}` });
    return new AppError("PROVIDER_UNAVAILABLE", undefined, { details: `openrouteservice: HTTP ${e.status}` });
  }
  if (e instanceof AppError) return e;
  return new AppError("PROVIDER_UNAVAILABLE", undefined, { cause: e });
}

export class OpenRouteServiceRoutingProvider implements RoutingProvider {
  readonly id = "openrouteservice";
  readonly capabilities = { nativeLoop: true, elevation: true, segments: true, matrix: false };

  constructor(private readonly options: OpenRouteServiceOptions) {}

  private buildBody(profile: RoutingProfileOptions): Record<string, unknown> {
    const intent = buildRoutingIntent(profile);
    const avoid: string[] = [];
    if (intent.avoidFerries) avoid.push("ferries");
    if (intent.locomotion === "pedestrian" && intent.useTrails < 0.3) avoid.push("steps");
    const areas = profile.preferences?.avoidAreas ?? [];
    return {
      elevation: true,
      instructions: true,
      language: "fr",
      extra_info: ["surface", "waytype"],
      preference: intent.shortest ? "shortest" : "recommended",
      options: {
        ...(avoid.length > 0 ? { avoid_features: avoid } : {}),
        ...(areas.length > 0
          ? {
              avoid_polygons: {
                type: "MultiPolygon",
                coordinates: areas.map(([w, s, e, n]) => [
                  [
                    [w, s],
                    [e, s],
                    [e, n],
                    [w, n],
                    [w, s],
                  ],
                ]),
              },
            }
          : {}),
      },
    };
  }

  private async request(profile: RoutingProfileOptions, body: Record<string, unknown>, signal?: AbortSignal): Promise<RawRoute> {
    let raw: unknown;
    try {
      raw = await fetchJson(`${this.options.baseUrl}/v2/directions/${orsProfile(profile)}/geojson`, {
        method: "POST",
        body,
        headers: { Authorization: this.options.apiKey },
        timeoutMs: this.options.timeoutMs,
        signal,
        service: "openrouteservice",
      });
    } catch (e) {
      throw mapUpstreamError(e);
    }
    const parsed = responseSchema.safeParse(raw);
    const feature = parsed.success ? parsed.data.features[0] : undefined;
    if (!feature) throw new AppError("PROVIDER_UNAVAILABLE", undefined, { details: "openrouteservice: unexpected response shape" });

    const coordinates = feature.geometry.coordinates.map((c) => ({
      lng: c[0]!,
      lat: c[1]!,
      ...(typeof c[2] === "number" ? { ele: c[2] } : {}),
    }));
    if (coordinates.length < 2) throw new AppError("NO_ROUTE");

    const toIntervals = (values: [number, number, number][] | undefined): [number, number, string][] =>
      (values ?? []).map(([a, b, code]) => [a, b, String(code)]);
    const segments = segmentsFromIntervals(
      coordinates,
      toIntervals(feature.properties.extras?.surface?.values),
      toIntervals(feature.properties.extras?.waytypes?.values),
      (v) => ORS_SURFACE[Number(v)] ?? "unknown",
      (v) => ORS_WAYTYPE[Number(v)] ?? "other",
    );
    const steps = feature.properties.segments?.flatMap((s) => s.steps ?? []);
    const instructions = steps
      ? buildInstructions(
          coordinates,
          steps.map((st) => ({
            distanceM: st.distance ?? 0,
            durationS: st.duration,
            type: orsStepType(st.type),
            streetName: st.name && st.name !== "-" ? st.name : undefined,
            pointIndex: st.way_points?.[0] ?? 0,
            text: st.instruction,
          })),
        )
      : undefined;

    return {
      coordinates,
      distanceM: feature.properties.summary.distance,
      durationS: feature.properties.summary.duration,
      turnCount: instructions ? countTurns(instructions) : undefined,
      segments,
      instructions,
    };
  }

  async calculateRoute(input: CalculateRouteInput): Promise<RawRoute> {
    if (input.waypoints.length < 2) throw new AppError("INVALID_REQUEST", "Au moins deux points sont nécessaires.");
    return this.request(
      input.profile,
      { ...this.buildBody(input.profile), coordinates: input.waypoints.map((p) => [p.lng, p.lat]), continue_straight: true },
      input.signal,
    );
  }

  async calculateLoop(input: CalculateLoopInput): Promise<RawRoute> {
    const body = this.buildBody(input.profile);
    const options = (body.options ?? {}) as Record<string, unknown>;
    return this.request(
      input.profile,
      {
        ...body,
        coordinates: [[input.start.lng, input.start.lat]],
        options: { ...options, round_trip: { length: Math.round(input.distanceM), points: 3, seed: input.seed } },
      },
      input.signal,
    );
  }
}
