import { describe, expect, it } from "vitest";
import { toRoutePoints } from "@/lib/geo";
import { AppError } from "@/lib/errors";
import { buildGpx } from "./build";
import { parseGpx } from "./parse";

const points = toRoutePoints([
  { lat: 45.8992, lng: 6.1294, ele: 448.2 },
  { lat: 45.9, lng: 6.13, ele: 452 },
  { lat: 45.91, lng: 6.15, ele: 470.55 },
]);

describe("buildGpx", () => {
  const gpx = buildGpx({
    name: "Annecy <VTT> & co",
    description: 'Boucle "test"',
    activityType: "VTT",
    points,
    waypoints: [{ id: "a", kind: "start", lat: 45.8992, lng: 6.1294, name: "Départ" }],
    time: "2026-01-01T10:00:00.000Z",
  });

  it("produces a GPX 1.1 document with metadata, a track and elevations", () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(gpx).toContain("<metadata>");
    expect(gpx).toContain("<time>2026-01-01T10:00:00.000Z</time>");
    expect(gpx).toContain("<trk>");
    expect(gpx).toContain("<trkseg>");
    expect(gpx).toContain('<trkpt lat="45.899200" lon="6.129400"><ele>448.2</ele></trkpt>');
    expect(gpx).toContain("<type>VTT</type>");
    expect(gpx).toContain('<wpt lat="45.899200" lon="6.129400">');
    expect((gpx.match(/<trkpt /g) ?? []).length).toBe(3);
  });

  it("escapes XML special characters", () => {
    expect(gpx).toContain("<name>Annecy &lt;VTT&gt; &amp; co</name>");
    expect(gpx).toContain("<desc>Boucle &quot;test&quot;</desc>");
    expect(gpx).not.toContain("<VTT>");
  });

  it("omits <ele> when elevation is unknown", () => {
    const out = buildGpx({ name: "x", points: toRoutePoints([{ lat: 1, lng: 2 }, { lat: 1.1, lng: 2 }]) });
    expect(out).toContain('<trkpt lat="1.000000" lon="2.000000"/>');
    expect(out).not.toContain("<ele>");
  });

  it("round-trips through the parser", () => {
    const parsed = parseGpx(gpx);
    expect(parsed.name).toBe("Annecy <VTT> & co");
    expect(parsed.points).toHaveLength(3);
    expect(parsed.points[2]!.ele).toBeCloseTo(470.6, 1);
    expect(parsed.hasElevation).toBe(true);
    expect(parsed.waypoints).toHaveLength(1);
    expect(parsed.waypoints[0]!.name).toBe("Départ");
  });
});

describe("parseGpx", () => {
  it("reads a minimal Garmin-like file without namespace prefix issues", () => {
    const xml = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Garmin"><trk><name>Sortie</name><trkseg>
<trkpt lat="45.1" lon="6.1"><ele>1000</ele><time>2024-01-01T00:00:00Z</time></trkpt>
<trkpt lat="45.2" lon="6.2"><ele>1100</ele></trkpt>
</trkseg></trk></gpx>`;
    const parsed = parseGpx(xml);
    expect(parsed.name).toBe("Sortie");
    expect(parsed.points).toHaveLength(2);
    expect(parsed.points[1]!.dist).toBeGreaterThan(13_000);
  });

  it("falls back to <rte> when no track exists", () => {
    const xml = `<gpx version="1.0"><rte><name>R</name><rtept lat="45" lon="6"/><rtept lat="45.01" lon="6"/></rte></gpx>`;
    expect(parseGpx(xml).points).toHaveLength(2);
  });

  it("skips invalid coordinates", () => {
    const xml = `<gpx><trk><trkseg><trkpt lat="95" lon="6"/><trkpt lat="45" lon="6"/><trkpt lat="45.1" lon="abc"/><trkpt lat="45.2" lon="6"/></trkseg></trk></gpx>`;
    expect(parseGpx(xml).points).toHaveLength(2);
  });

  it("rejects non-GPX, empty and oversized content", () => {
    expect(() => parseGpx("<html></html>")).toThrow(AppError);
    expect(() => parseGpx("<gpx></gpx>")).toThrow(/invalide/);
    expect(() => parseGpx("<gpx>" + "x".repeat(100) + "</gpx>", { maxBytes: 50 })).toThrow(/volumineux/);
  });

  it("does not expand entities or execute anything", () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<gpx><trk><name>&xxe;</name><trkseg><trkpt lat="45" lon="6"/><trkpt lat="45.1" lon="6"/></trkseg></trk></gpx>`;
    const parsed = parseGpx(xml);
    expect(parsed.name ?? "").not.toContain("root:");
    expect(parsed.points).toHaveLength(2);
  });

  it("downsamples very long tracks", () => {
    const pts = Array.from({ length: 5000 }, (_, i) => `<trkpt lat="${45 + i * 0.0001}" lon="6"/>`).join("");
    const parsed = parseGpx(`<gpx><trk><trkseg>${pts}</trkseg></trk></gpx>`, { maxPoints: 500 });
    expect(parsed.points.length).toBeLessThanOrEqual(502);
    expect(parsed.points[parsed.points.length - 1]!.lat).toBeCloseTo(45 + 4999 * 0.0001, 6);
  });
});
