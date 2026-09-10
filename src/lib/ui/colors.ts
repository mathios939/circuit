/**
 * Brand colours shared between CSS (see `@theme` in globals.css) and the
 * places that cannot use Tailwind classes: MapLibre layers, inline SVG,
 * the PWA manifest and the browser theme colour.
 */
export const COLORS = {
  /** Selected route on the map and elevation profile cursor. */
  route: "#f2601d",
  /** Alternative proposals drawn in the background. */
  routeAlt: "#9aa8a1",
  /** Pine green: primary accent, browser theme colour. */
  brand: "#17714a",
  /** Deep forest ink: text, headers, manifest background. */
  ink: "#16221d",
  paper: "#f7f8f5",
} as const;
