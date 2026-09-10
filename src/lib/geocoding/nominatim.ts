import { z } from "zod";
import type { LatLng } from "@/lib/types";
import { fetchJson } from "@/lib/server/http";
import type { GeocodeOptions, GeocodeResult, GeocodingProvider } from "./provider";

const itemSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  address: z.record(z.string(), z.string()).optional(),
});

const searchSchema = z.array(itemSchema);

function toResult(item: z.infer<typeof itemSchema>): GeocodeResult {
  const parts = item.display_name.split(",").map((s) => s.trim());
  const name = item.name && item.name.length > 0 ? item.name : (parts[0] ?? "Lieu");
  const a = item.address ?? {};
  const label = [a.postcode, a.city ?? a.town ?? a.village ?? a.municipality, a.state, a.country]
    .filter((s): s is string => Boolean(s) && s !== name)
    .join(", ");
  return {
    lat: Number(item.lat),
    lng: Number(item.lon),
    name,
    label: label || parts.slice(1, 4).join(", "),
    type: item.type,
  };
}

/**
 * Nominatim (OpenStreetMap). The public instance requires a valid User-Agent,
 * allows at most 1 request per second and forbids autocomplete-style
 * hammering — keep the client debounce high when using it.
 */
export class NominatimGeocodingProvider implements GeocodingProvider {
  readonly id = "nominatim";

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly timeoutMs = 8_000,
  ) {}

  async search(query: string, options: GeocodeOptions = {}): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: String(options.limit ?? 6),
      addressdetails: "1",
      "accept-language": options.lang ?? "fr",
    });
    const raw = await fetchJson(`${this.baseUrl}/search?${params.toString()}`, {
      headers: { "User-Agent": this.userAgent },
      timeoutMs: this.timeoutMs,
      signal: options.signal,
      service: "nominatim",
    });
    const parsed = searchSchema.safeParse(raw);
    if (!parsed.success) return [];
    return parsed.data.map(toResult).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  }

  async reverse(position: LatLng, options: { lang?: string; signal?: AbortSignal } = {}): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({
      lat: position.lat.toFixed(6),
      lon: position.lng.toFixed(6),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "16",
      "accept-language": options.lang ?? "fr",
    });
    const raw = await fetchJson(`${this.baseUrl}/reverse?${params.toString()}`, {
      headers: { "User-Agent": this.userAgent },
      timeoutMs: this.timeoutMs,
      signal: options.signal,
      service: "nominatim",
    });
    const parsed = itemSchema.safeParse(raw);
    return parsed.success ? toResult(parsed.data) : null;
  }
}
