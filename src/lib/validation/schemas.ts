import { z } from "zod";
import { ACTIVITY_TYPES, ROUTE_STYLES } from "@/lib/types";

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const placeSchema = latLngSchema.extend({
  name: z.string().trim().min(1).max(200),
  label: z.string().trim().max(300).optional(),
});

export const bboxSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const preferencesSchema = z
  .object({
    avoidBusyRoads: z.boolean().optional(),
    avoidMajorRoads: z.boolean().optional(),
    avoidPrivateRoads: z.boolean().optional(),
    avoidFerries: z.boolean().optional(),
    preferNature: z.boolean().optional(),
    preferCycleways: z.boolean().optional(),
    preferTrails: z.boolean().optional(),
    preferSingletracks: z.boolean().optional(),
    preferQuietRoads: z.boolean().optional(),
    scenic: z.boolean().optional(),
    elevationMode: z.enum(["auto", "minimize", "maximize"]).optional(),
    surface: z.enum(["any", "paved", "unpaved"]).optional(),
    avoidAreas: z.array(bboxSchema).max(10).optional(),
  })
  .strict();

export const routeRequestSchema = z
  .object({
    mode: z.enum(["loop", "point_to_point"]),
    activity: z.enum(ACTIVITY_TYPES),
    start: placeSchema,
    end: placeSchema.optional(),
    distanceKm: z.number().positive().max(500).optional(),
    distanceTolerance: z.number().min(0.01).max(0.3).optional(),
    elevationTargetM: z.number().min(0).max(15_000).optional(),
    elevationMaxM: z.number().min(0).max(15_000).optional(),
    difficulty: z.enum(["easy", "moderate", "hard", "expert"]).optional(),
    durationMinutes: z.number().positive().max(24 * 60).optional(),
    preferences: preferencesSchema.optional(),
    styles: z.array(z.enum(ROUTE_STYLES)).min(1).max(3).optional(),
    seed: z.number().int().min(0).max(2 ** 31).optional(),
  })
  .strict()
  .superRefine((req, ctx) => {
    if (req.mode === "loop" && req.distanceKm === undefined && req.durationMinutes === undefined) {
      ctx.addIssue({ code: "custom", path: ["distanceKm"], message: "Une distance (ou une durée) est requise pour une boucle." });
    }
    if (req.mode === "point_to_point" && !req.end) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "Un point d'arrivée est requis." });
    }
  });

export type RouteRequestInput = z.infer<typeof routeRequestSchema>;

export const waypointSchema = latLngSchema.extend({
  id: z.string().max(40).optional(),
  kind: z.enum(["start", "via", "end"]).optional(),
  name: z.string().max(200).optional(),
});

/** Recalculation through explicit waypoints (editor). */
export const calculateRequestSchema = z
  .object({
    activity: z.enum(ACTIVITY_TYPES),
    style: z.enum(ROUTE_STYLES).optional(),
    waypoints: z.array(waypointSchema).min(2).max(30),
    preferences: preferencesSchema.optional(),
    name: z.string().max(120).optional(),
    /** Original request, kept for scoring & adjustments. */
    request: routeRequestSchema.optional(),
  })
  .strict();

export type CalculateRequestInput = z.infer<typeof calculateRequestSchema>;

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(10).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const nlRequestSchema = z.object({ text: z.string().trim().min(3).max(500) });
