import { describe, expect, it } from "vitest";
import { toRoutePoints } from "@/lib/geo";
import { decodeInts, decodeSharedRoute, encodeInts, encodeSharedRoute } from "./encode";

describe("encodeInts / decodeInts", () => {
  it("round-trips signed integers", () => {
    const values = [450, 452, 449, 500, -12, 0, 1200];
    expect(decodeInts(encodeInts(values))).toEqual(values);
  });
});

describe("encodeSharedRoute / decodeSharedRoute", () => {
  const points = toRoutePoints(
    Array.from({ length: 2000 }, (_, i) => ({
      lat: 45.9 + 0.02 * Math.sin((i / 2000) * Math.PI * 2),
      lng: 6.13 + 0.03 * Math.cos((i / 2000) * Math.PI * 2),
      ele: 450 + 50 * Math.sin(i / 100),
    })),
  );

  it("produces a compact URL-safe payload that decodes to a similar route", () => {
    const encoded = encodeSharedRoute({ name: "Boucle d'Annecy", activity: "mtb", mode: "loop", points });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(8000);
    const decoded = decodeSharedRoute(encoded)!;
    expect(decoded).not.toBeNull();
    expect(decoded.name).toBe("Boucle d'Annecy");
    expect(decoded.activity).toBe("mtb");
    expect(decoded.mode).toBe("loop");
    expect(decoded.points.length).toBeLessThanOrEqual(600);
    const originalLength = points[points.length - 1]!.dist;
    const decodedLength = decoded.points[decoded.points.length - 1]!.dist;
    expect(Math.abs(decodedLength - originalLength) / originalLength).toBeLessThan(0.02);
    expect(decoded.points.every((p) => typeof p.ele === "number")).toBe(true);
  });

  it("returns null for garbage", () => {
    expect(decodeSharedRoute("not-a-payload")).toBeNull();
    expect(decodeSharedRoute("")).toBeNull();
  });
});
