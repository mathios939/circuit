"use client";

import { create } from "zustand";
import type { ActivityType, GenerationProgress, LatLng, Place, RouteAdjustment, RouteMode, RoutePreferences, RouteRequest, RouteResult, RouteWaypoint } from "@/lib/types";
import { getActivityProfile } from "@/lib/activities/profiles";
import { calculateRouteApi, errorHint, errorMessage, generateRoutesApi, reverseGeocodeApi } from "@/lib/client/api";
import { importGpxText } from "@/lib/client/import-gpx";
import { cutBetween, insertWaypoint, moveWaypoint as moveWp, removeWaypoint as removeWp, reverseWaypoints, setEnd as setEndWp, setStart as setStartWp } from "@/lib/editor/waypoints";
import { toAppError, USER_HINTS } from "@/lib/errors";
import type { RouteIntent } from "@/lib/nl/parser";
import { adjustRequest } from "@/lib/route-generator/adjust";
import { getRouteRepository } from "@/lib/storage/local";
import type { SavedRoute } from "@/lib/storage/repository";

export type GenerationStatus = "idle" | "loading" | "success" | "error";
export type EditorTool = "move" | "add" | "cut";
export type PanelTab = "create" | "results" | "library";
export type PickTarget = "start" | "end" | null;

export interface AdvancedOptions {
  distanceTolerance: number;
  elevationTargetM?: number;
  elevationMaxM?: number;
  durationMinutes?: number;
  preferences: RoutePreferences;
}

const GPX_MAX_BYTES_CLIENT = 10 * 1024 * 1024;

export interface RouteStore {
  // ----- form
  activity: ActivityType;
  mode: RouteMode;
  start: Place | null;
  end: Place | null;
  distanceKm: number | null;
  /** In point-to-point mode, whether the distance target applies. */
  p2pDistanceEnabled: boolean;
  advanced: AdvancedOptions;
  showAdvanced: boolean;
  setActivity(activity: ActivityType): void;
  setP2pDistanceEnabled(enabled: boolean): void;
  setMode(mode: RouteMode): void;
  setStart(place: Place | null): void;
  setEnd(place: Place | null): void;
  setDistanceKm(km: number | null): void;
  setAdvanced(patch: Partial<AdvancedOptions>): void;
  setPreferences(patch: RoutePreferences): void;
  toggleAdvanced(): void;
  applyIntent(intent: RouteIntent, resolved: { start?: Place; end?: Place }): void;

  // ----- generation
  status: GenerationStatus;
  error: string | null;
  /** Actionable hint attached to `error`, when one exists. */
  errorHint: string | null;
  routes: RouteResult[];
  notes: string[];
  /** Set when no proposal matched the requested distance within tolerance. */
  distanceMismatch: { requestedKm: number; bestKm: number } | null;
  selectedId: string | null;
  lastRequest: RouteRequest | null;
  /** Current stage of the running generation (streamed by the server). */
  progress: GenerationProgress | null;
  /** Stages already completed, in order (for the progress list). */
  progressHistory: GenerationProgress[];
  /** Timings of the last generation, for the debug panel. */
  lastTimings: Record<string, number> | null;
  generate(options?: { surprise?: boolean; request?: RouteRequest }): Promise<void>;
  adjust(adjustment: RouteAdjustment): Promise<void>;
  cancelGeneration(): void;
  selectRoute(id: string): void;
  clearResults(): void;

  // ----- editor
  editing: boolean;
  tool: EditorTool;
  cutBuffer: LatLng[];
  undoStack: RouteResult[];
  recalcStatus: "idle" | "loading" | "error";
  recalcError: string | null;
  setEditing(editing: boolean): void;
  setTool(tool: EditorTool): void;
  applyWaypoints(waypoints: RouteWaypoint[]): Promise<void>;
  moveWaypoint(id: string, position: LatLng): Promise<void>;
  addWaypointAt(position: LatLng): Promise<void>;
  removeWaypoint(id: string): Promise<void>;
  reverseRoute(): Promise<void>;
  cutAt(position: LatLng): Promise<void>;
  undo(): void;
  replaceStart(position: LatLng): Promise<void>;
  replaceEnd(position: LatLng): Promise<void>;

  // ----- map
  basemapId: string | null;
  setBasemap(id: string): void;
  pickTarget: PickTarget;
  setPickTarget(target: PickTarget): void;
  hoverDist: number | null;
  setHoverDist(dist: number | null): void;
  fitRequestId: number;
  requestFit(): void;
  pickFromMap(position: LatLng): Promise<void>;

  // ----- library
  saved: SavedRoute[];
  refreshSaved(): Promise<void>;
  saveCurrent(name?: string): Promise<void>;
  renameSaved(id: string, name: string): Promise<void>;
  duplicateSaved(id: string): Promise<void>;
  removeSaved(id: string): Promise<void>;
  loadSaved(id: string): Promise<void>;
  loadRoute(route: RouteResult): void;

  // ----- import
  importGpx(file: File): Promise<void>;

  // ----- ui
  panelTab: PanelTab;
  setPanelTab(tab: PanelTab): void;
  toast: string | null;
  setToast(message: string | null): void;
}

let generationAbort: AbortController | null = null;
let recalcAbort: AbortController | null = null;

export const useRouteStore = create<RouteStore>()((set, get) => ({
  // ----- form
  activity: "road_cycling",
  mode: "loop",
  start: null,
  end: null,
  distanceKm: 50,
  p2pDistanceEnabled: false,
  advanced: { distanceTolerance: 0.05, preferences: {} },
  showAdvanced: false,
  setP2pDistanceEnabled: (p2pDistanceEnabled) => set({ p2pDistanceEnabled }),
  setActivity: (activity) => {
    const profile = getActivityProfile(activity);
    const km = get().distanceKm;
    set({ activity, distanceKm: km === null || km < profile.minDistanceKm || km > profile.maxDistanceKm ? profile.defaultDistanceKm : km });
  },
  setMode: (mode) => set({ mode }),
  setStart: (start) => set({ start }),
  setEnd: (end) => set({ end }),
  setDistanceKm: (distanceKm) => set({ distanceKm }),
  setAdvanced: (patch) => set({ advanced: { ...get().advanced, ...patch } }),
  setPreferences: (patch) => set({ advanced: { ...get().advanced, preferences: { ...get().advanced.preferences, ...patch } } }),
  toggleAdvanced: () => set({ showAdvanced: !get().showAdvanced }),
  applyIntent: (intent, resolved) => {
    const patch: Partial<RouteStore> = {};
    if (intent.activity) patch.activity = intent.activity;
    if (intent.mode) patch.mode = intent.mode;
    if (resolved.start) patch.start = resolved.start;
    if (resolved.end) patch.end = resolved.end;
    if (intent.distanceKm) patch.distanceKm = intent.distanceKm;
    const advanced = { ...get().advanced };
    if (intent.elevationTargetM !== undefined) advanced.elevationTargetM = intent.elevationTargetM;
    if (intent.elevationMaxM !== undefined) advanced.elevationMaxM = intent.elevationMaxM;
    if (intent.durationMinutes !== undefined && !intent.distanceKm) advanced.durationMinutes = intent.durationMinutes;
    if (intent.preferences) advanced.preferences = { ...advanced.preferences, ...intent.preferences };
    patch.advanced = advanced;
    if (intent.preferences || intent.elevationTargetM !== undefined) patch.showAdvanced = true;
    set(patch);
  },

  // ----- generation
  status: "idle",
  error: null,
  errorHint: null,
  routes: [],
  notes: [],
  distanceMismatch: null,
  selectedId: null,
  lastRequest: null,
  progress: null,
  progressHistory: [],
  lastTimings: null,
  generate: async (options = {}) => {
    const s = get();
    const request = options.request ?? buildRequest(s, options.surprise ?? false);
    if (!request) return;
    generationAbort?.abort();
    generationAbort = new AbortController();
    const initial: GenerationProgress = { stage: "candidates", message: "Création des variantes" };
    set({ status: "loading", error: null, errorHint: null, distanceMismatch: null, editing: false, cutBuffer: [], undoStack: [], panelTab: "results", lastRequest: request, progress: initial, progressHistory: [], lastTimings: null });
    try {
      const result = await generateRoutesApi(request, {
        signal: generationAbort.signal,
        onProgress: (progress) => {
          const current = get().progress;
          const history = current && current.stage !== progress.stage ? [...get().progressHistory, current] : get().progressHistory;
          set({ progress, progressHistory: history });
        },
      });
      const first = result.routes[0];
      set({
        status: "success",
        routes: result.routes,
        notes: result.notes,
        distanceMismatch: result.distanceMismatch ?? null,
        selectedId: first?.id ?? null,
        fitRequestId: get().fitRequestId + 1,
        progress: null,
        progressHistory: [],
        lastTimings: { ...result.timings, routingCalls: result.routingCalls, candidatesEvaluated: result.candidatesEvaluated },
      });
      if (first) void getRouteRepository().recordHistory(first).then(() => get().refreshSaved());
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      set({ status: "error", error: errorMessage(e), errorHint: errorHint(e), routes: [], notes: [], distanceMismatch: null, selectedId: null, progress: null, progressHistory: [] });
    }
  },
  adjust: async (adjustment) => {
    const route = selectedRoute(get());
    if (!route?.request) return;
    const request = adjustRequest(route, adjustment);
    set({ distanceKm: request.distanceKm ?? get().distanceKm, advanced: { ...get().advanced, elevationTargetM: request.elevationTargetM, elevationMaxM: request.elevationMaxM, preferences: request.preferences ?? {} } });
    await get().generate({ request });
  },
  cancelGeneration: () => {
    generationAbort?.abort();
    set({ status: get().routes.length > 0 ? "success" : "idle", progress: null, progressHistory: [] });
  },
  selectRoute: (id) => set({ selectedId: id, editing: false, cutBuffer: [], undoStack: [], fitRequestId: get().fitRequestId + 1 }),
  clearResults: () => set({ routes: [], notes: [], distanceMismatch: null, selectedId: null, status: "idle", error: null, errorHint: null, editing: false, undoStack: [] }),

  // ----- editor
  editing: false,
  tool: "move",
  cutBuffer: [],
  undoStack: [],
  recalcStatus: "idle",
  recalcError: null,
  setEditing: (editing) => set({ editing, tool: "move", cutBuffer: [], pickTarget: null }),
  setTool: (tool) => set({ tool, cutBuffer: [] }),
  applyWaypoints: async (waypoints) => {
    const route = selectedRoute(get());
    if (!route) return;
    recalcAbort?.abort();
    recalcAbort = new AbortController();
    set({ recalcStatus: "loading", recalcError: null });
    try {
      const updated = await calculateRouteApi(
        { activity: route.activity, style: route.style, waypoints, preferences: route.request?.preferences, name: route.name, request: route.request },
        recalcAbort.signal,
      );
      const merged: RouteResult = { ...updated, id: route.id, name: route.name };
      set({
        routes: get().routes.map((r) => (r.id === route.id ? merged : r)),
        undoStack: [...get().undoStack.slice(-19), route],
        recalcStatus: "idle",
        cutBuffer: [],
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      set({ recalcStatus: "error", recalcError: errorMessage(e) });
    }
  },
  moveWaypoint: async (id, position) => {
    const route = selectedRoute(get());
    if (route) await get().applyWaypoints(moveWp(route.waypoints, id, position));
  },
  addWaypointAt: async (position) => {
    const route = selectedRoute(get());
    if (route) await get().applyWaypoints(insertWaypoint(route, position));
  },
  removeWaypoint: async (id) => {
    const route = selectedRoute(get());
    if (route) await get().applyWaypoints(removeWp(route.waypoints, id));
  },
  reverseRoute: async () => {
    const route = selectedRoute(get());
    if (route) await get().applyWaypoints(reverseWaypoints(route.waypoints));
  },
  cutAt: async (position) => {
    const route = selectedRoute(get());
    if (!route) return;
    const buffer = [...get().cutBuffer, position];
    if (buffer.length < 2) {
      set({ cutBuffer: buffer });
      return;
    }
    await get().applyWaypoints(cutBetween(route, buffer[0]!, buffer[1]!));
    set({ cutBuffer: [], tool: "move" });
  },
  undo: () => {
    const stack = get().undoStack;
    const previous = stack[stack.length - 1];
    if (!previous) return;
    set({ routes: get().routes.map((r) => (r.id === previous.id ? previous : r)), undoStack: stack.slice(0, -1), recalcStatus: "idle", recalcError: null });
  },
  replaceStart: async (position) => {
    const route = selectedRoute(get());
    if (!route) return;
    const named = await nameFor(position);
    await get().applyWaypoints(setStartWp(route.waypoints, named));
  },
  replaceEnd: async (position) => {
    const route = selectedRoute(get());
    if (!route) return;
    const named = await nameFor(position);
    await get().applyWaypoints(setEndWp(route.waypoints, named));
  },

  // ----- map
  basemapId: null,
  setBasemap: (basemapId) => set({ basemapId }),
  pickTarget: null,
  setPickTarget: (pickTarget) => set({ pickTarget }),
  hoverDist: null,
  setHoverDist: (hoverDist) => set({ hoverDist }),
  fitRequestId: 0,
  requestFit: () => set({ fitRequestId: get().fitRequestId + 1 }),
  pickFromMap: async (position) => {
    const target = get().pickTarget;
    if (!target) return;
    set({ pickTarget: null });
    const place = await nameFor(position);
    if (target === "start") set({ start: place });
    else set({ end: place, mode: "point_to_point" });
  },

  // ----- library
  saved: [],
  refreshSaved: async () => set({ saved: await getRouteRepository().list() }),
  saveCurrent: async (name) => {
    const route = selectedRoute(get());
    if (!route) return;
    await getRouteRepository().save(route, { name: name ?? route.name, kind: "favorite" });
    await get().refreshSaved();
    get().setToast("Parcours enregistré.");
  },
  renameSaved: async (id, name) => {
    const entry = await getRouteRepository().rename(id, name);
    if (entry) set({ routes: get().routes.map((r) => (r.id === entry.route.id ? { ...r, name: entry.name } : r)) });
    await get().refreshSaved();
  },
  duplicateSaved: async (id) => {
    await getRouteRepository().duplicate(id);
    await get().refreshSaved();
  },
  removeSaved: async (id) => {
    await getRouteRepository().remove(id);
    await get().refreshSaved();
  },
  loadSaved: async (id) => {
    const entry = await getRouteRepository().get(id);
    if (entry) get().loadRoute({ ...entry.route, name: entry.name });
  },
  loadRoute: (route) => {
    const req = route.request;
    set({
      routes: [route],
      notes: [],
      distanceMismatch: null,
      selectedId: route.id,
      status: "success",
      error: null,
      errorHint: null,
      editing: false,
      undoStack: [],
      panelTab: "results",
      lastRequest: req ?? null,
      fitRequestId: get().fitRequestId + 1,
      ...(req ? { activity: req.activity, mode: req.mode, start: req.start, end: req.end ?? null, distanceKm: req.distanceKm ?? get().distanceKm } : {}),
    });
  },

  // ----- import
  importGpx: async (file) => {
    if (file.size > GPX_MAX_BYTES_CLIENT) {
      set({ status: "error", error: "Ce fichier GPX est trop volumineux (10 Mo maximum).", errorHint: USER_HINTS.GPX_TOO_LARGE ?? null, panelTab: "results" });
      return;
    }
    try {
      const text = await file.text();
      const route = importGpxText(text, get().activity, GPX_MAX_BYTES_CLIENT);
      get().loadRoute(route);
      get().setToast("Trace GPX importée.");
    } catch (e) {
      const err = toAppError(e);
      set({ status: "error", error: err.message, errorHint: USER_HINTS[err.code] ?? null, routes: [], selectedId: null, panelTab: "results" });
    }
  },

  // ----- ui
  panelTab: "create",
  setPanelTab: (panelTab) => set({ panelTab }),
  toast: null,
  setToast: (toast) => {
    set({ toast });
    if (toast) setTimeout(() => get().toast === toast && set({ toast: null }), 3000);
  },
}));

export function selectedRoute(state: Pick<RouteStore, "routes" | "selectedId">): RouteResult | undefined {
  return state.routes.find((r) => r.id === state.selectedId);
}

export const useSelectedRoute = () => useRouteStore((s) => s.routes.find((r) => r.id === s.selectedId));

function buildRequest(s: RouteStore, surprise: boolean): RouteRequest | null {
  if (!s.start) return null;
  const profile = getActivityProfile(s.activity);
  const distanceKm = s.distanceKm ?? profile.defaultDistanceKm;
  const mode: RouteMode = surprise ? "loop" : s.mode;
  const request: RouteRequest = {
    mode,
    activity: s.activity,
    start: s.start,
    end: mode === "point_to_point" ? (s.end ?? undefined) : undefined,
    distanceKm: mode === "point_to_point" && !s.p2pDistanceEnabled ? undefined : distanceKm,
    distanceTolerance: s.advanced.distanceTolerance,
    elevationTargetM: s.advanced.elevationTargetM,
    elevationMaxM: s.advanced.elevationMaxM,
    durationMinutes: s.advanced.durationMinutes,
    preferences: Object.keys(s.advanced.preferences).length > 0 ? s.advanced.preferences : undefined,
    seed: surprise ? Math.floor(Math.random() * 100_000) : undefined,
  };
  if (mode === "loop" && request.distanceKm === undefined && request.durationMinutes === undefined) request.distanceKm = distanceKm;
  return request;
}

async function nameFor(position: LatLng): Promise<Place> {
  const fallback = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
  try {
    const result = await reverseGeocodeApi(position.lat, position.lng);
    return { lat: position.lat, lng: position.lng, name: result?.name ?? fallback, label: result?.label };
  } catch {
    return { lat: position.lat, lng: position.lng, name: fallback };
  }
}
