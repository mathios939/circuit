import type { LatLng } from "@/lib/types";
import { haversineDistance } from "@/lib/geo";
import type { GeocodeOptions, GeocodeResult, GeocodingProvider } from "./provider";

/** Small deterministic gazetteer used by tests and `GEOCODING_PROVIDER=mock`. */
const PLACES: GeocodeResult[] = [
  { name: "Annecy", label: "Haute-Savoie, France", lat: 45.8992, lng: 6.1294, type: "city" },
  { name: "Lac d'Annecy", label: "Haute-Savoie, France", lat: 45.8575, lng: 6.1738, type: "water" },
  { name: "Lyon", label: "Rhône, France", lat: 45.764, lng: 4.8357, type: "city" },
  { name: "Paris", label: "Île-de-France, France", lat: 48.8566, lng: 2.3522, type: "city" },
  { name: "Tour Eiffel", label: "Paris, France", lat: 48.8584, lng: 2.2945, type: "attraction" },
  { name: "10 Rue de Rivoli", label: "75004 Paris, France", lat: 48.8555, lng: 2.3615, type: "house" },
  { name: "Fontainebleau", label: "Seine-et-Marne, France", lat: 48.4047, lng: 2.7016, type: "city" },
  { name: "Grenoble", label: "Isère, France", lat: 45.1885, lng: 5.7245, type: "city" },
  { name: "Chamonix-Mont-Blanc", label: "Haute-Savoie, France", lat: 45.9237, lng: 6.8694, type: "city" },
  { name: "Bordeaux", label: "Gironde, France", lat: 44.8378, lng: -0.5792, type: "city" },
  { name: "Océan Atlantique", label: "Au large", lat: 30, lng: -40, type: "water" },
];

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export class MockGeocodingProvider implements GeocodingProvider {
  readonly id = "mock";

  async search(query: string, options: GeocodeOptions = {}): Promise<GeocodeResult[]> {
    const q = fold(query.trim());
    if (!q) return [];
    return PLACES.filter((p) => fold(p.name).includes(q) || fold(p.label).includes(q)).slice(0, options.limit ?? 6);
  }

  async reverse(position: LatLng): Promise<GeocodeResult | null> {
    let best: GeocodeResult | null = null;
    let bestDist = Infinity;
    for (const p of PLACES) {
      const d = haversineDistance(p, position);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (!best) return null;
    return { ...best, lat: position.lat, lng: position.lng, label: `${best.label} (à ${Math.round(bestDist / 1000)} km de ${best.name})` };
  }
}
