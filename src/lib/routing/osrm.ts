import { z } from "zod";
import { AppError } from "@/lib/errors";
import { decodePolyline, nearestPointIndex } from "@/lib/geo";
import { fetchJson, UpstreamHttpError } from "@/lib/server/http";
import { buildRoutingIntent } from "./intent";
import { buildInstructions, countTurns, osrmManeuverType } from "./instructions";
import type { CalculateMatrixInput, CalculateRouteInput, RawRoute, RoutingProfileOptions, RoutingProvider } from "./provider";

export interface OsrmOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Profile names as exposed by the OSRM instance (depends on how it was built). */
  bicycleProfile?: string;
  pedestrianProfile?: string;
}

const routeSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  routes: z
    .array(
      z.object({
        distance: z.number(),
        duration: z.number(),
        geometry: z.string(),
        legs: z
          .array(
            z.object({
              steps: z
                .array(
                  z.object({
                    distance: z.number().optional(),
                    duration: z.number().optional(),
                    name: z.string().optional(),
                    maneuver: z.object({ type: z.string().optional(), modifier: z.string().optional(), location: z.tuple([z.number(), z.number()]).optional() }).optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

const tableSchema = z.object({
  code: z.string(),
  distances: z.array(z.array(z.number().nullable())).optional(),
});

function mapError(e: unknown): AppError {
  if (e instanceof UpstreamHttpError) {
    const body = e.body as { code?: string; message?: string } | null;
    const code = body?.code;
    if (code === "NoRoute") return new AppError("NO_ROUTE", undefined, { details: `osrm: ${body?.message ?? ""}` });
    if (code === "NoSegment" || code === "InvalidValue" || code === "InvalidQuery") {
      return new AppError("NOT_ROUTABLE", undefined, { details: `osrm: ${body?.message ?? ""}` });
    }
    return new AppError("PROVIDER_UNAVAILABLE", undefined, { details: `osrm: HTTP ${e.status}` });
  }
  if (e instanceof AppError) return e;
  return new AppError("PROVIDER_UNAVAILABLE", undefined, { cause: e });
}

/**
 * OSRM does not support costing options: activity nuances are limited to the
 * profile (bike / foot) compiled into the instance. Style differences are
 * therefore only handled by the loop geometry and scoring.
 */
export class OsrmRoutingProvider implements RoutingProvider {
  readonly id = "osrm";
  readonly capabilities = { nativeLoop: false, elevation: false, segments: false, matrix: true };

  constructor(private readonly options: OsrmOptions) {}

  private profileName(profile: RoutingProfileOptions): string {
    const intent = buildRoutingIntent(profile);
    return intent.locomotion === "bicycle" ? (this.options.bicycleProfile ?? "bike") : (this.options.pedestrianProfile ?? "foot");
  }

  async calculateRoute(input: CalculateRouteInput): Promise<RawRoute> {
    if (input.waypoints.length < 2) throw new AppError("INVALID_REQUEST", "Au moins deux points sont nécessaires.");
    const coords = input.waypoints.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${this.options.baseUrl}/route/v1/${this.profileName(input.profile)}/${coords}?overview=full&geometries=polyline6&steps=true&continue_straight=true`;
    let raw: unknown;
    try {
      raw = await fetchJson(url, { timeoutMs: this.options.timeoutMs, signal: input.signal, service: "osrm" });
    } catch (e) {
      throw mapError(e);
    }
    const parsed = routeSchema.safeParse(raw);
    if (!parsed.success) throw new AppError("PROVIDER_UNAVAILABLE", undefined, { details: "osrm: unexpected response" });
    if (parsed.data.code !== "Ok" || !parsed.data.routes?.[0]) {
      throw mapError(new UpstreamHttpError("osrm", 400, parsed.data));
    }
    const route = parsed.data.routes[0];
    const coordinates = decodePolyline(route.geometry, 6);
    if (coordinates.length < 2) throw new AppError("NO_ROUTE");
    const steps = route.legs?.flatMap((leg) => leg.steps ?? []);
    const instructions = steps
      ? buildInstructions(
          coordinates,
          steps.map((st) => {
            const loc = st.maneuver?.location;
            const pointIndex = loc ? nearestIndex(coordinates, { lat: loc[1], lng: loc[0] }) : 0;
            return {
              distanceM: st.distance ?? 0,
              durationS: st.duration,
              type: osrmManeuverType(st.maneuver?.type, st.maneuver?.modifier),
              streetName: st.name,
              pointIndex,
            };
          }),
        )
      : undefined;
    return {
      coordinates,
      distanceM: route.distance,
      durationS: route.duration,
      turnCount: instructions ? countTurns(instructions) : undefined,
      instructions,
    };
  }

  async calculateMatrix(input: CalculateMatrixInput): Promise<number[][]> {
    const all = [...input.sources, ...input.targets];
    const coords = all.map((p) => `${p.lng},${p.lat}`).join(";");
    const sources = input.sources.map((_, i) => i).join(";");
    const targets = input.targets.map((_, i) => i + input.sources.length).join(";");
    const url = `${this.options.baseUrl}/table/v1/${this.profileName(input.profile)}/${coords}?sources=${sources}&destinations=${targets}&annotations=distance`;
    let raw: unknown;
    try {
      raw = await fetchJson(url, { timeoutMs: this.options.timeoutMs, signal: input.signal, service: "osrm" });
    } catch (e) {
      throw mapError(e);
    }
    const parsed = tableSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.distances) throw new AppError("PROVIDER_UNAVAILABLE", undefined, { details: "osrm: unexpected table response" });
    return parsed.data.distances.map((row) => row.map((d) => d ?? Infinity));
  }
}

function nearestIndex(coords: readonly { lat: number; lng: number }[], target: { lat: number; lng: number }): number {
  return nearestPointIndex(coords, target).index;
}
