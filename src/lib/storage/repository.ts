import type { RouteResult } from "@/lib/types";

/** A stored route with user-facing metadata. */
export interface SavedRoute {
  id: string;
  name: string;
  route: RouteResult;
  savedAt: string;
  updatedAt: string;
  /** "history" entries are automatic; "favorite" entries were explicitly saved. */
  kind: "history" | "favorite";
}

/**
 * Persistence abstraction for routes. The MVP ships a localStorage
 * implementation; a server-backed implementation (per authenticated user)
 * can replace it without touching the UI.
 */
export interface RouteRepository {
  list(): Promise<SavedRoute[]>;
  get(id: string): Promise<SavedRoute | null>;
  save(route: RouteResult, options?: { name?: string; kind?: SavedRoute["kind"] }): Promise<SavedRoute>;
  rename(id: string, name: string): Promise<SavedRoute | null>;
  duplicate(id: string): Promise<SavedRoute | null>;
  remove(id: string): Promise<void>;
  /** Adds to the history (deduplicated by route id, bounded). */
  recordHistory(route: RouteResult): Promise<void>;
}
