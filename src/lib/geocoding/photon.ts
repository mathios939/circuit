import { z } from "zod";
import type { LatLng } from "@/lib/types";
import { fetchJson } from "@/lib/server/http";
import type { GeocodeOptions, GeocodeResult, GeocodingProvider } from "./provider";

const featureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z
    .object({
      name: z.string().optional(),
      street: z.string().optional(),
      housenumber: z.string().optional(),
      postcode: z.string().optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      county: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      osm_key: z.string().optional(),
      osm_value: z.string().optional(),
      type: z.string().optional(),
    })
    .partial(),
});

const schema = z.object({ features: z.array(featureSchema) });

function toResult(f: z.infer<typeof featureSchema>): GeocodeResult {
  const p = f.properties;
  const primary = p.name ?? [p.housenumber, p.street].filter(Boolean).join(" ") ?? "";
  const parts = [p.street && p.name ? p.street : undefined, p.postcode, p.city ?? p.district, p.state, p.country]
    .filter((s): s is string => Boolean(s) && s !== primary);
  return {
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    name: primary || parts[0] || "Lieu",
    label: [...new Set(parts)].join(", "),
    type: p.osm_value ?? p.type,
  };
}

/** Photon (komoot) geocoder — OSM based, autocomplete friendly, no key. */
export class PhotonGeocodingProvider implements GeocodingProvider {
  readonly id = "photon";

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly timeoutMs = 8_000,
  ) {}

  async search(query: string, options: GeocodeOptions = {}): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({ q: query, limit: String(options.limit ?? 6) });
    const lang = (options.lang ?? "fr").slice(0, 2);
    if (["fr", "en", "de"].includes(lang)) params.set("lang", lang);
    if (options.near) {
      params.set("lat", options.near.lat.toFixed(4));
      params.set("lon", options.near.lng.toFixed(4));
    }
    const raw = await fetchJson(`${this.baseUrl}/api/?${params.toString()}`, {
      headers: { "User-Agent": this.userAgent },
      timeoutMs: this.timeoutMs,
      signal: options.signal,
      service: "photon",
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return [];
    return parsed.data.features.map(toResult);
  }

  async reverse(position: LatLng, options: { lang?: string; signal?: AbortSignal } = {}): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({ lat: position.lat.toFixed(6), lon: position.lng.toFixed(6), limit: "1" });
    const lang = (options.lang ?? "fr").slice(0, 2);
    if (["fr", "en", "de"].includes(lang)) params.set("lang", lang);
    const raw = await fetchJson(`${this.baseUrl}/reverse?${params.toString()}`, {
      headers: { "User-Agent": this.userAgent },
      timeoutMs: this.timeoutMs,
      signal: options.signal,
      service: "photon",
    });
    const parsed = schema.safeParse(raw);
    const first = parsed.success ? parsed.data.features[0] : undefined;
    return first ? toResult(first) : null;
  }
}
