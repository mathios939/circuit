import type { RouteResult } from "@/lib/types";
import { shortId } from "@/lib/utils/id";
import type { RouteRepository, SavedRoute } from "./repository";

const STORAGE_KEY = "circuit.routes.v1";
const MAX_HISTORY = 20;
const MAX_FAVORITES = 200;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage-backed repository. Safe to instantiate on the server (no-op storage). */
export class LocalStorageRouteRepository implements RouteRepository {
  constructor(private readonly storage: StorageLike | null = typeof window !== "undefined" ? window.localStorage : null) {}

  private read(): SavedRoute[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSavedRoute);
    } catch {
      return [];
    }
  }

  private write(entries: SavedRoute[]): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Quota exceeded or private mode: drop the oldest history entries and retry once.
      const trimmed = entries.filter((e) => e.kind === "favorite").slice(0, 50);
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        /* give up silently: persistence is best-effort */
      }
    }
  }

  async list(): Promise<SavedRoute[]> {
    return this.read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<SavedRoute | null> {
    return this.read().find((e) => e.id === id) ?? null;
  }

  async save(route: RouteResult, options: { name?: string; kind?: SavedRoute["kind"] } = {}): Promise<SavedRoute> {
    const entries = this.read();
    const now = new Date().toISOString();
    const kind = options.kind ?? "favorite";
    const existing = entries.find((e) => e.route.id === route.id && e.kind === kind);
    if (existing) {
      existing.route = route;
      existing.name = options.name ?? existing.name;
      existing.updatedAt = now;
      this.write(entries);
      return existing;
    }
    const entry: SavedRoute = {
      id: shortId(),
      name: options.name ?? route.name,
      route,
      savedAt: now,
      updatedAt: now,
      kind,
    };
    entries.unshift(entry);
    this.write(bound(entries));
    return entry;
  }

  async rename(id: string, name: string): Promise<SavedRoute | null> {
    const entries = this.read();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return null;
    entry.name = name.trim().slice(0, 120) || entry.name;
    entry.route = { ...entry.route, name: entry.name };
    entry.updatedAt = new Date().toISOString();
    this.write(entries);
    return entry;
  }

  async duplicate(id: string): Promise<SavedRoute | null> {
    const entries = this.read();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return null;
    const now = new Date().toISOString();
    const copy: SavedRoute = {
      id: shortId(),
      name: `${entry.name} (copie)`,
      route: { ...entry.route, id: shortId(), name: `${entry.name} (copie)` },
      savedAt: now,
      updatedAt: now,
      kind: "favorite",
    };
    entries.unshift(copy);
    this.write(bound(entries));
    return copy;
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((e) => e.id !== id));
  }

  async recordHistory(route: RouteResult): Promise<void> {
    const entries = this.read().filter((e) => !(e.kind === "history" && e.route.id === route.id));
    const now = new Date().toISOString();
    entries.unshift({ id: shortId(), name: route.name, route, savedAt: now, updatedAt: now, kind: "history" });
    this.write(bound(entries));
  }
}

function bound(entries: SavedRoute[]): SavedRoute[] {
  const favorites = entries.filter((e) => e.kind === "favorite").slice(0, MAX_FAVORITES);
  const history = entries.filter((e) => e.kind === "history").slice(0, MAX_HISTORY);
  return [...favorites, ...history];
}

function isSavedRoute(value: unknown): value is SavedRoute {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.route === "object" && v.route !== null && (v.kind === "history" || v.kind === "favorite");
}

let repository: RouteRepository | undefined;

export function getRouteRepository(): RouteRepository {
  repository ??= new LocalStorageRouteRepository();
  return repository;
}
