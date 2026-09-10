import { describe, expect, it } from "vitest";
import { parseRouteIntent } from "./parser";

describe("parseRouteIntent", () => {
  it("understands the reference sentence (gravel loop around Lyon)", () => {
    const intent = parseRouteIntent("Fais-moi une boucle gravel de 70 km autour de Lyon avec environ 1000 m de D+, en évitant les grosses routes.");
    expect(intent.activity).toBe("gravel");
    expect(intent.startQuery).toBe("Lyon");
    expect(intent.distanceKm).toBe(70);
    expect(intent.elevationTargetM).toBe(1000);
    expect(intent.preferences?.avoidBusyRoads).toBe(true);
    expect(intent.mode).toBe("loop");
  });

  it("understands the MTB example with an apostrophe", () => {
    const intent = parseRouteIntent("Je veux une boucle VTT de 35 km au départ d'Annecy avec environ 800 m de D+.");
    expect(intent.activity).toBe("mtb");
    expect(intent.startQuery).toBe("Annecy");
    expect(intent.distanceKm).toBe(35);
    expect(intent.elevationTargetM).toBe(800);
    expect(intent.mode).toBe("loop");
  });

  it("detects point-to-point requests", () => {
    const intent = parseRouteIntent("Vélo de route de Grenoble vers Chambéry, 60 km, plat");
    expect(intent.activity).toBe("road_cycling");
    expect(intent.startQuery).toBe("Grenoble");
    expect(intent.endQuery).toBe("Chambery");
    expect(intent.mode).toBe("point_to_point");
    expect(intent.preferences?.elevationMode).toBe("minimize");
  });

  it("extracts durations, max elevation and preferences", () => {
    const intent = parseRouteIntent("Trail de 2h30 depuis Chamonix, max 600 m de D+, en forêt et calme");
    expect(intent.activity).toBe("trail_running");
    expect(intent.durationMinutes).toBe(150);
    expect(intent.elevationMaxM).toBe(600);
    expect(intent.startQuery).toBe("Chamonix");
    expect(intent.preferences?.preferNature).toBe(true);
    expect(intent.preferences?.preferQuietRoads).toBe(true);
  });

  it("handles English", () => {
    const intent = parseRouteIntent("A 10 km running loop from Paris with 200 m of climbing, quiet");
    expect(intent.activity).toBe("running");
    expect(intent.distanceKm).toBe(10);
    expect(intent.startQuery).toBe("Paris");
    expect(intent.elevationTargetM).toBe(200);
    expect(intent.mode).toBe("loop");
  });

  it("returns an empty intent for unrelated text", () => {
    const intent = parseRouteIntent("bonjour tout le monde");
    expect(intent.matched).toHaveLength(0);
    expect(intent.activity).toBeUndefined();
  });
});
