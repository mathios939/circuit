import { z } from "zod";
import type { LatLng, RouteSegment } from "@/lib/types";
import { AppError } from "@/lib/errors";
import { decodePolyline, encodePolyline } from "@/lib/geo";
import { fetchJson, UpstreamHttpError } from "@/lib/server/http";
import { normaliseSurface, normaliseWay } from "./attributes";
import { buildRoutingIntent, type RoutingIntent } from "./intent";
import type {
  CalculateMatrixInput,
  CalculateRouteInput,
  RawRoute,
  RoutingProfileOptions,
  RoutingProvider,
} from "./provider";

export interface ValhallaOptions {
  baseUrl: string;
  timeoutMs: number;
}

const tripSchema = z.object({
  trip: z.object({
    legs: z.array(
      z.object({
        shape: z.string(),
        summary: z.object({ length: z.number(), time: z.number() }).partial(),
        maneuvers: z.array(z.object({ type: z.number().optional() })).optional(),
      }),
    ),
    summary: z.object({ length: z.number(), time: z.number() }),
    units: z.string().optional(),
  }),
});

const traceSchema = z.object({
  edges: z
    .array(
      z.object({
        length: z.number().optional(),
        surface: z.string().optional(),
        road_class: z.string().optional(),
        use: z.string().optional(),
        begin_shape_index: z.number().optional(),
        end_shape_index: z.number().optional(),
        names: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

const matrixSchema = z.object({
  sources_to_targets: z.array(z.array(z.object({ distance: z.number().nullable().optional() }))),
});

/** Valhalla error codes that mean "point cannot be routed" rather than "service broken". */
const NOT_ROUTABLE_CODES = new Set([150, 151, 152, 153, 154, 170, 171, 172]);
const NO_ROUTE_CODES = new Set([440, 441, 442, 443, 444, 445]);

function costingName(intent: RoutingIntent): "bicycle" | "pedestrian" {
  return intent.locomotion === "bicycle" ? "bicycle" : "pedestrian";
}

/** Maps the engine-agnostic intent to Valhalla costing options. */
export function buildValhallaCosting(profile: RoutingProfileOptions): {
  costing: "bicycle" | "pedestrian";
  costing_options: Record<string, Record<string, unknown>>;
  exclude_polygons?: number[][][];
} {
  const intent = buildRoutingIntent(profile);
  const costing = costingName(intent);
  const shared = {
    use_ferry: intent.avoidFerries ? 0 : 0.5,
    use_living_streets: intent.useQuietStreets,
    use_hills: intent.useHills,
    use_tracks: intent.useTrails,
    shortest: intent.shortest,
  };
  const options =
    costing === "bicycle"
      ? {
          ...shared,
          bicycle_type: intent.bicycleType,
          use_roads: intent.useRoads,
          avoid_bad_surfaces: 1 - intent.useUnpaved,
          cycling_speed: intent.speedKmh,
        }
      : {
          ...shared,
          walking_speed: intent.speedKmh,
          max_hiking_difficulty: intent.maxHikingDifficulty,
          step_penalty: 15,
        };

  const avoidAreas = profile.preferences?.avoidAreas ?? [];
  const exclude_polygons = avoidAreas.map(([w, s, e, n]) => [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ]);

  return {
    costing,
    costing_options: { [costing]: options },
    ...(exclude_polygons.length > 0 ? { exclude_polygons } : {}),
  };
}

function mapUpstreamError(e: unknown): AppError {
  if (e instanceof UpstreamHttpError) {
    const body = e.body as { error_code?: number; error?: string } | null;
    const code = body?.error_code;
    if (code !== undefined && NOT_ROUTABLE_CODES.has(code)) {
      return new AppError("NOT_ROUTABLE", undefined, { details: `valhalla ${code}: ${body?.error ?? ""}` });
    }
    if (code !== undefined && NO_ROUTE_CODES.has(code)) {
      return new AppError("NO_ROUTE", undefined, { details: `valhalla ${code}: ${body?.error ?? ""}` });
    }
    if (e.status === 400) {
      return new AppError("NO_ROUTE", undefined, { details: `valhalla: ${body?.error ?? "bad request"}` });
    }
    return new AppError("PROVIDER_UNAVAILABLE", undefined, { details: `valhalla: HTTP ${e.status}` });
  }
  if (e instanceof AppError) return e;
  return new AppError("PROVIDER_UNAVAILABLE", undefined, { cause: e });
}

export class ValhallaRoutingProvider implements RoutingProvider {
  readonly id = "valhalla";
  readonly capabilities = { nativeLoop: false, elevation: false, segments: true, matrix: true };

  constructor(private readonly options: ValhallaOptions) {}

  async calculateRoute(input: CalculateRouteInput): Promise<RawRoute> {
    if (input.waypoints.length < 2) throw new AppError("INVALID_REQUEST", "Au moins deux points sont nécessaires.");
    const costing = buildValhallaCosting(input.profile);
    const last = input.waypoints.length - 1;
    const body = {
      locations: input.waypoints.map((p, i) => ({
        lat: p.lat,
        lon: p.lng,
        // "through" lets the engine pass intermediate points without stopping or U-turning.
        type: i === 0 || i === last ? "break" : "through",
        radius: i === 0 || i === last ? 0 : 150,
      })),
      ...costing,
      units: "kilometers",
      shape_format: "polyline6",
      directions_type: "maneuvers",
      language: "fr-FR",
    };

    let raw: unknown;
    try {
      raw = await fetchJson(`${this.options.baseUrl}/route`, {
        method: "POST",
        body,
        timeoutMs: this.options.timeoutMs,
        signal: input.signal,
        service: "valhalla",
      });
    } catch (e) {
      throw mapUpstreamError(e);
    }

    const parsed = tripSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("PROVIDER_UNAVAILABLE", undefined, { details: "valhalla: unexpected response shape" });
    }
    const trip = parsed.data.trip;
    const coordinates: LatLng[] = [];
    let turnCount = 0;
    for (const leg of trip.legs) {
      const pts = decodePolyline(leg.shape, 6);
      // Legs share their boundary point; skip duplicates.
      const start = coordinates.length > 0 ? 1 : 0;
      for (let i = start; i < pts.length; i++) coordinates.push(pts[i]!);
      turnCount += leg.maneuvers?.length ?? 0;
    }
    if (coordinates.length < 2) throw new AppError("NO_ROUTE");

    return {
      coordinates,
      distanceM: trip.summary.length * 1000,
      durationS: trip.summary.time,
      turnCount: Math.max(0, turnCount - 2), // minus depart + arrive
    };
  }

  async calculateMatrix(input: CalculateMatrixInput): Promise<number[][]> {
    const costing = buildValhallaCosting(input.profile);
    const body = {
      sources: input.sources.map((p) => ({ lat: p.lat, lon: p.lng })),
      targets: input.targets.map((p) => ({ lat: p.lat, lon: p.lng })),
      ...costing,
      units: "kilometers",
    };
    let raw: unknown;
    try {
      raw = await fetchJson(`${this.options.baseUrl}/sources_to_targets`, {
        method: "POST",
        body,
        timeoutMs: this.options.timeoutMs,
        signal: input.signal,
        service: "valhalla",
      });
    } catch (e) {
      throw mapUpstreamError(e);
    }
    const parsed = matrixSchema.safeParse(raw);
    if (!parsed.success) throw new AppError("PROVIDER_UNAVAILABLE", undefined, { details: "valhalla: unexpected matrix response" });
    return parsed.data.sources_to_targets.map((row) => row.map((cell) => (cell.distance ?? Infinity) * 1000));
  }

  /**
   * Uses /trace_attributes with `edge_walk` on the route's own shape to fetch
   * per-edge surface / road class / use. Falls back to map matching, then to
   * "no data" — surface information is an enrichment, never a hard failure.
   */
  async getRouteDetails(route: RawRoute, profile: RoutingProfileOptions, signal?: AbortSignal): Promise<RouteSegment[]> {
    const costing = buildValhallaCosting(profile);
    const encoded = encodePolyline(route.coordinates, 6);
    const attempt = async (shapeMatch: "edge_walk" | "map_snap") => {
      const raw = await fetchJson(`${this.options.baseUrl}/trace_attributes`, {
        method: "POST",
        body: {
          encoded_polyline: encoded,
          shape_match: shapeMatch,
          costing: costing.costing,
          costing_options: costing.costing_options,
          units: "kilometers",
          filters: {
            attributes: [
              "edge.length",
              "edge.surface",
              "edge.road_class",
              "edge.use",
              "edge.begin_shape_index",
              "edge.end_shape_index",
              "edge.names",
            ],
            action: "include",
          },
        },
        timeoutMs: this.options.timeoutMs,
        signal,
        service: "valhalla",
      });
      const parsed = traceSchema.safeParse(raw);
      return parsed.success ? (parsed.data.edges ?? []) : [];
    };

    let edges: z.infer<typeof traceSchema>["edges"] = [];
    try {
      edges = await attempt("edge_walk");
    } catch {
      try {
        edges = await attempt("map_snap");
      } catch {
        return [];
      }
    }

    return (edges ?? [])
      .filter((e) => (e.length ?? 0) > 0)
      .map((e) => ({
        startIndex: e.begin_shape_index ?? 0,
        endIndex: e.end_shape_index ?? 0,
        lengthM: (e.length ?? 0) * 1000,
        surface: normaliseSurface(e.surface),
        way: normaliseWay(e.road_class, e.use),
        name: e.names?.[0],
      }));
  }
}
