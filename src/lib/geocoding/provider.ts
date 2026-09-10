import type { LatLng } from "@/lib/types";

export interface GeocodeResult extends LatLng {
  /** Primary label (e.g. "Annecy"). */
  name: string;
  /** Secondary label (e.g. "Haute-Savoie, France"). */
  label: string;
  /** Coarse type: city, street, poi, ... */
  type?: string;
}

export interface GeocodeOptions {
  limit?: number;
  /** Bias results towards this position (user location / map centre). */
  near?: LatLng;
  /** BCP47 language for labels. */
  lang?: string;
  signal?: AbortSignal;
}

/** Abstraction over geocoding services (Photon, Nominatim, ...). */
export interface GeocodingProvider {
  readonly id: string;
  search(query: string, options?: GeocodeOptions): Promise<GeocodeResult[]>;
  reverse(position: LatLng, options?: { lang?: string; signal?: AbortSignal }): Promise<GeocodeResult | null>;
}
