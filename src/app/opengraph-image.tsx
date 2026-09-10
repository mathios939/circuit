import { ImageResponse } from "next/og";
import { CircuitMark } from "@/components/layout/CircuitMark";
import { COLORS } from "@/lib/ui/colors";

export const alt = "Circuit — Choisissez la distance. Circuit trouve la route.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Open Graph card generated at build time (no static asset to maintain). */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: COLORS.paper,
          color: COLORS.ink,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <CircuitMark size={104} />
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>Circuit</div>
        </div>
        <div style={{ marginTop: 56, fontSize: 52, fontWeight: 700, lineHeight: 1.15, maxWidth: 1000 }}>Choisissez la distance. Circuit trouve la route.</div>
        <div style={{ marginTop: 28, fontSize: 30, color: "#3b4a43", maxWidth: 1000 }}>Boucles et itinéraires vélo, gravel, VTT, running, trail et randonnée, avec dénivelé, profil et export GPX.</div>
        <div style={{ position: "absolute", right: 80, bottom: 64, width: 220, height: 10, borderRadius: 5, background: COLORS.route }} />
      </div>
    ),
    size,
  );
}
