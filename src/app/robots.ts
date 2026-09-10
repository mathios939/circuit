import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

// Evaluated per request so that NEXT_PUBLIC_SITE_URL / VERCEL_URL are read at runtime, not only at build time.
export const dynamic = "force-dynamic";

/**
 * Public pages are indexable; API routes, the diagnostics screen and shared
 * routes (user data behind a link) are not.
 */
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [{ userAgent: "*", allow: ["/", "/about"], disallow: ["/api/", "/diagnostics", "/route/"] }],
    sitemap: new URL("/sitemap.xml", site).toString(),
  };
}
