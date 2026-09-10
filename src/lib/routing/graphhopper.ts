import { z } from "zod";
import { AppError } from "@/lib/errors";
import { fetchJson, UpstreamHttpError } from "@/lib/server/http";
import { normaliseSurface, normaliseWay } from "./attributes";
import { buildInstructions, countTurns, graphhopperSignType } from "./instructions";
import { buildRoutingIntent } from "./intent";
import type {
  CalculateLoopInput,
  CalculateRouteInput,
  RawRoute,
  RoutingProfileOptions,
  RoutingProvider,
} from "./provider";
import { segmentsFromIntervals } from "./snap";

export interface GraphHopperOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

const detailInterval = z.tuple([z.number(), z.number(), z.union([z.string(), z.number(), z.null()])]);

const responseSchema = z.object({
  paths: z.array(
    z.object({
      distance: z.number(),
      time: z.number().optional(),
      points: z.object({ coordinates: z.array(z.array(z.number()).min(2)) }),
      instructions: z
        .array(
          z.object({
            sign: z.number().optional(),
            text: z.string().optional(),
            street_name: z.string().optional(),
            distance: z.number().optional(),
            time: z.number().optional(),
            interval: z.tuple([z.number(), z.number()]).optional(),
          }),
        )
        .optional(),
      details: z
        .object({
          surface: z.array(detailInterval).optional(),
          road_class: z.array(detailInterval).optional(),
        })
        .partial()
        .optional(),
    }),
  ),
});

/** GraphHopper profile for each activity. */
function ghProfile(profile: RoutingProfileOptions): string {
  switch (profile.activity) {
    case "road_cycling":
      return "racingbike";
    case "gravel":
      return "bike";
    case "mtb":
      return "mtb";
    case "trail_running":
    case "hiking":
      return "hike";
    default:
      return "foot";
  }
}

/** Custom model (priority rules) expressing the routing intent. Requires ch.disable=true. */
function ghCustomModel(profile: RoutingProfileOptions): Record<string, unknown> | undefined {
  const intent = buildRoutingIntent(profile);
  const priority: Record<string, unknown>[] = [];
  if (intent.avoidMajorRoads) {
    priority.push({ if: "road_class == PRIMARY || road_class == TRUNK", multiply_by: 0.3 });
    priority.push({ if: "road_class == SECONDARY", multiply_by: 0.7 });
  } else if (intent.useRoads < 0.4) {
    priority.push({ if: "road_class == PRIMARY", multiply_by: 0.6 });
  }
  if (intent.useTrails > 0.7) {
    priority.push({ if: "road_class == TRACK || road_class == PATH", multiply_by: 1 });
    priority.push({ if: "road_class == RESIDENTIAL || road_class == TERTIARY", multiply_by: 0.8 });
  } else if (intent.useTrails < 0.2) {
    priority.push({ if: "road_class == TRACK || road_class == PATH", multiply_by: 0.2 });
  }
  if (intent.useUnpaved < 0.2) {
    priority.push({ if: "surface == GRAVEL || surface == DIRT || surface == GROUND", multiply_by: 0.3 });
  }
  if (intent.avoidFerries) priority.push({ if: "road_environment == FERRY", multiply_by: 0 });
  return priority.length > 0 ? { priority } : undefined;
}

function mapUpstreamError(e: unknown): AppError {
  if (e instanceof UpstreamHttpError) {
    const body = e.body as { message?: string } | null;
    const msg = body?.message ?? "";
    if (e.status === 401 || e.status === 403) return new AppError("NOT_CONFIGURED", undefined, { details: "graphhopper: invalid API key" });
    if (/cannot find point|out of bounds|snap/i.test(msg)) return new AppError("NOT_ROUTABLE", undefined, { details: `graphhopper: ${msg}` });
    if (/connection between locations not found|no route/i.test(msg)) return new AppError("NO_ROUTE", undefined, { details: `graphhopper: ${msg}` });
    if (e.status === 400) return new AppError("NO_ROUTE", undefined, { details: `graphhopper: ${msg}` });
    return new AppError("PROVIDER_UNAVAILABLE", undefined, { details: `graphhopper: HTTP ${e.status}` });
  }
  if (e instanceof AppError) return e;
  return new AppError("PROVIDER_UNAVAILABLE", undefined, { cause: e });
}

export class GraphHopperRoutingProvider implements RoutingProvider {
  readonly id = "graphhopper";
  readonly capabilities = { nativeLoop: true, elevation: true, segments: true, matrix: false };

  constructor(private readonly options: GraphHopperOptions) {}

  private async request(body: Record<string, unknown>, signal?: AbortSignal): Promise<RawRoute> {
    let raw: unknown;
    try {
      raw = await fetchJson(`${this.options.baseUrl}/route?key=${encodeURIComponent(this.options.apiKey)}`, {
        method: "POST",
        body,
        timeoutMs: this.options.timeoutMs,
        signal,
        service: "graphhopper",
      });
    } catch (e) {
      throw mapUpstreamError(e);
    }
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success || parsed.data.paths.length === 0) {
      throw new AppError("PROVIDER_UNAVAILABLE", undefined, { details: "graphhopper: unexpected response shape" });
    }
    const path = parsed.data.paths[0]!;
    const coordinates = path.points.coordinates.map((c) => ({
      lng: c[0]!,
      lat: c[1]!,
      ...(typeof c[2] === "number" ? { ele: c[2] } : {}),
    }));
    if (coordinates.length < 2) throw new AppError("NO_ROUTE");

    const toIntervals = (arr: z.infer<typeof detailInterval>[] | undefined): [number, number, string][] =>
      (arr ?? []).map(([a, b, v]) => [a, b, v === null ? "" : String(v)]);
    const segments = segmentsFromIntervals(
      coordinates,
      toIntervals(path.details?.surface),
      toIntervals(path.details?.road_class),
      normaliseSurface,
      (v) => normaliseWay(v),
    );

    const instructions = path.instructions
      ? buildInstructions(
          coordinates,
          path.instructions.map((i) => ({
            distanceM: i.distance ?? 0,
            durationS: i.time !== undefined ? i.time / 1000 : undefined,
            type: graphhopperSignType(i.sign),
            streetName: i.street_name,
            pointIndex: i.interval?.[0] ?? 0,
            text: i.text,
          })),
        )
      : undefined;

    return {
      coordinates,
      distanceM: path.distance,
      durationS: path.time !== undefined ? path.time / 1000 : undefined,
      turnCount: instructions ? countTurns(instructions) : undefined,
      segments,
      instructions,
    };
  }

  private baseBody(profile: RoutingProfileOptions): Record<string, unknown> {
    const customModel = ghCustomModel(profile);
    return {
      profile: ghProfile(profile),
      elevation: true,
      points_encoded: false,
      instructions: true,
      locale: "fr",
      details: ["surface", "road_class"],
      ...(customModel ? { "ch.disable": true, custom_model: customModel } : {}),
    };
  }

  async calculateRoute(input: CalculateRouteInput): Promise<RawRoute> {
    if (input.waypoints.length < 2) throw new AppError("INVALID_REQUEST", "Au moins deux points sont nécessaires.");
    return this.request(
      {
        ...this.baseBody(input.profile),
        points: input.waypoints.map((p) => [p.lng, p.lat]),
        // Pass-through waypoints (no U-turn at intermediate points) need the flexible mode.
        ...(input.waypoints.length > 2 ? { pass_through: true, "ch.disable": true } : {}),
      },
      input.signal,
    );
  }

  async calculateLoop(input: CalculateLoopInput): Promise<RawRoute> {
    return this.request(
      {
        ...this.baseBody(input.profile),
        points: [[input.start.lng, input.start.lat]],
        algorithm: "round_trip",
        "round_trip.distance": Math.round(input.distanceM),
        "round_trip.seed": input.seed,
        "ch.disable": true,
      },
      input.signal,
    );
  }
}
