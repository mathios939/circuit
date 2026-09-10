"use client";

import { LocateFixed, MapPin, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "@/lib/types";
import type { GeocodeResult } from "@/lib/geocoding/provider";
import { geocodeApi, reverseGeocodeApi } from "@/lib/client/api";
import { inputClass } from "@/components/ui/Field";

export interface PlaceSearchProps {
  value: Place | null;
  onChange(place: Place | null): void;
  placeholder?: string;
  /** Called when the user asks to pick the place on the map. */
  onPickOnMap?(): void;
  picking?: boolean;
  allowGeolocation?: boolean;
  testId?: string;
}

/**
 * Address / place autocomplete. Requests are debounced and stale responses
 * are cancelled with an AbortController.
 */
export function PlaceSearch({ value, onChange, placeholder = "Ville, adresse, lieu…", onPickOnMap, picking, allowGeolocation, testId }: PlaceSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  // Cancel pending timers / requests on unmount.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  /** Debounced search: scheduled from the input handler, cancelling stale requests. */
  const scheduleSearch = (raw: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    const q = raw.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      setError(null);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      geocodeApi(q, { signal: controller.signal })
        .then((r) => {
          if (controller.signal.aborted) return;
          setResults(r);
          setHighlight(0);
          setOpen(true);
          if (r.length === 0) setError("Aucun lieu trouvé.");
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setError(e instanceof Error ? e.message : "Recherche indisponible.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
  };

  const select = (r: GeocodeResult) => {
    onChange({ lat: r.lat, lng: r.lng, name: r.name, label: r.label });
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const r = await reverseGeocodeApi(lat, lng);
          onChange({ lat, lng, name: r?.name ?? "Ma position", label: r?.label });
        } catch {
          onChange({ lat, lng, name: "Ma position" });
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setError("Géolocalisation refusée ou indisponible.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  if (value) {
    return (
      <div className="flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 text-sm" data-testid={testId ? `${testId}-selected` : undefined}>
        <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-ink-900">{value.name}</span>
          {value.label ? <span className="text-ink-500"> · {value.label}</span> : null}
        </span>
        <button type="button" aria-label="Effacer le lieu" onClick={() => onChange(null)} className="rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          data-testid={testId}
          className={`${inputClass} pl-9 pr-20`}
          placeholder={picking ? "Cliquez sur la carte…" : placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            scheduleSearch(e.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const r = results[highlight];
              if (r) select(r);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {loading ? <span className="mr-1 h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden /> : null}
          {allowGeolocation ? (
            <button type="button" onClick={locate} title="Utiliser ma position" aria-label="Utiliser ma position" className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
              <LocateFixed className="h-4 w-4" />
            </button>
          ) : null}
          {onPickOnMap ? (
            <button
              type="button"
              onClick={onPickOnMap}
              title="Choisir sur la carte"
              aria-label="Choisir sur la carte"
              aria-pressed={picking}
              className={`rounded-md p-1.5 ${picking ? "bg-brand-100 text-brand-700" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"}`}
            >
              <MapPin className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      {open && results.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-ink-200 bg-white py-1 shadow-panel">
          {results.map((r, i) => (
            <li
              key={`${r.lat},${r.lng},${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(r)}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === highlight ? "bg-ink-100" : ""}`}
            >
              <span className="block font-medium text-ink-900">{r.name}</span>
              {r.label ? <span className="block truncate text-xs text-ink-500">{r.label}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error && !open ? <p className="mt-1 text-xs text-ink-500">{error}</p> : null}
    </div>
  );
}
