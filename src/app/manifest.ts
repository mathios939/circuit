import type { MetadataRoute } from "next";
import { COLORS } from "@/lib/ui/colors";

/**
 * Web app manifest: installable, standalone, with the brand colours. No
 * service worker on purpose — routing needs the network, and a stale cache
 * would be worse than an honest offline error.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Circuit — parcours sportifs sur mesure",
    short_name: "Circuit",
    description: "Choisissez la distance. Circuit trouve la route.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: COLORS.paper,
    theme_color: COLORS.brand,
    categories: ["sports", "navigation", "health"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
