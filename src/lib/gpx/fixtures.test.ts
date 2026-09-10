import { readFileSync } from "node:fs";
import path from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { toRoutePoints } from "@/lib/geo";
import { AppError } from "@/lib/errors";
import { buildGpx } from "./build";
import { parseGpx } from "./parse";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

describe("GPX import — real-world shaped fixtures", () => {
  it("reads a Garmin Connect track with extensions and namespaces", () => {
    const parsed = parseGpx(fixture("garmin-connect-track.gpx"));
    expect(parsed.name).toBe("Sortie vélo Annecy");
    expect(parsed.points).toHaveLength(4);
    expect(parsed.points[0]!.ele).toBeCloseTo(447.6, 1);
    expect(parsed.hasElevation).toBe(true);
  });
  it("reads a Strava export", () => {
    const parsed = parseGpx(fixture("strava-export.gpx"));
    expect(parsed.name).toBe("Morning Run");
    expect(parsed.points).toHaveLength(3);
    expect(parsed.points[2]!.dist).toBeGreaterThan(150);
  });
  it("reads a Komoot planned tour (single quotes prolog, metadata name)", () => {
    const parsed = parseGpx(fixture("komoot-route.gpx"));
    expect(parsed.name).toBe("Tour du lac – VTT");
    expect(parsed.points).toHaveLength(3);
    expect(parsed.hasElevation).toBe(true);
  });
  it("merges several <trkseg> and accepts tracks without elevation", () => {
    const parsed = parseGpx(fixture("wahoo-multiseg-no-ele.gpx"));
    expect(parsed.points).toHaveLength(5);
    expect(parsed.hasElevation).toBe(false);
    expect(parsed.points.every((p) => p.ele === undefined)).toBe(true);
  });
  it("falls back to <rte> for GPX 1.0 routes", () => {
    const parsed = parseGpx(fixture("route-only.gpx"));
    expect(parsed.name).toBe("Itinéraire planifié");
    expect(parsed.points).toHaveLength(3);
    expect(parsed.points[0]!.ele).toBe(80);
  });
  it("rejects malformed XML with a readable error", () => {
    expect(() => parseGpx(fixture("malformed.gpx"))).toThrow(AppError);
    try {
      parseGpx(fixture("malformed.gpx"));
    } catch (e) {
      expect((e as AppError).code).toBe("GPX_INVALID");
      expect((e as AppError).message).toMatch(/invalide/);
    }
  });
  it("handles a large track (50 000 points) within the size limit by downsampling", () => {
    const pts = Array.from({ length: 50_000 }, (_, i) => `<trkpt lat="${(45 + i * 0.00002).toFixed(6)}" lon="${(6 + Math.sin(i / 50) * 0.001).toFixed(6)}"><ele>${400 + Math.sin(i / 300) * 50}</ele></trkpt>`).join("\n");
    const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Big</name><trkseg>${pts}</trkseg></trk></gpx>`;
    const parsed = parseGpx(xml);
    expect(parsed.points.length).toBeLessThanOrEqual(20_002);
    expect(parsed.points.length).toBeGreaterThan(10_000);
    expect(parsed.hasElevation).toBe(true);
  });
});

describe("GPX export — structural compatibility", () => {
  const points = toRoutePoints([
    { lat: 45.8992, lng: 6.1294, ele: 447.6 },
    { lat: 45.9001, lng: 6.1301, ele: 448.2 },
    { lat: 45.9012, lng: 6.1315, ele: 451 },
  ]);
  const gpx = buildGpx({
    name: "Annecy · Vélo 50 km",
    description: "Test",
    activityType: "Vélo de route",
    points,
    waypoints: [
      { id: "a", kind: "start", lat: 45.8992, lng: 6.1294, name: "Départ" },
      { id: "b", kind: "end", lat: 45.9012, lng: 6.1315, name: "Arrivée" },
    ],
    time: "2026-01-01T10:00:00.000Z",
  });

  it("is well-formed XML declared as GPX 1.1 / UTF-8 with the standard namespace and schema location", () => {
    expect(XMLValidator.validate(gpx)).toBe(true);
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toMatch(/<gpx version="1\.1" creator="[^"]+" xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1"/);
    expect(gpx).toContain('xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"');
  });

  it("orders elements as the GPX schema requires (metadata, wpt, trk; name before trkseg; ele inside trkpt)", () => {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", preserveOrder: true });
    const doc = parser.parse(gpx) as { gpx?: unknown; [k: string]: unknown }[];
    const root = doc.find((n) => "gpx" in n)!.gpx as { [k: string]: unknown }[];
    const rootOrder = root.map((n) => Object.keys(n)[0]);
    expect(rootOrder).toEqual(["metadata", "wpt", "wpt", "trk"]);
    const metadata = root[0]!.metadata as { [k: string]: unknown }[];
    expect(metadata.map((n) => Object.keys(n)[0])).toEqual(["name", "desc", "time", "keywords", "bounds"].filter((k) => metadata.some((n) => k in n)));
    const trk = root[3]!.trk as { [k: string]: unknown }[];
    const trkOrder = trk.map((n) => Object.keys(n)[0]);
    expect(trkOrder.indexOf("name")).toBeLessThan(trkOrder.indexOf("trkseg"));
    expect(trkOrder.indexOf("desc")).toBeLessThan(trkOrder.indexOf("type"));
    expect(trkOrder.indexOf("type")).toBeLessThan(trkOrder.indexOf("trkseg"));
    const wpt = root[1]!.wpt as { [k: string]: unknown }[];
    expect(wpt.map((n) => Object.keys(n)[0])).toEqual(["name", "sym"]);
  });

  it("writes every track point with lat/lon attributes and an <ele> child, and round-trips", () => {
    expect((gpx.match(/<trkpt lat="-?\d+\.\d{6}" lon="-?\d+\.\d{6}"><ele>-?\d+\.\d<\/ele><\/trkpt>/g) ?? []).length).toBe(3);
    const parsed = parseGpx(gpx);
    expect(parsed.points).toHaveLength(3);
    expect(parsed.name).toBe("Annecy · Vélo 50 km");
    expect(parsed.waypoints.map((w) => w.name)).toEqual(["Départ", "Arrivée"]);
    expect(parsed.hasElevation).toBe(true);
  });

  it("uses only ASCII-safe structure while keeping UTF-8 text intact", () => {
    expect(gpx).toContain("Vélo");
    expect(gpx).not.toContain("&#");
    expect(Buffer.from(gpx, "utf8").toString("utf8")).toBe(gpx);
  });
});
