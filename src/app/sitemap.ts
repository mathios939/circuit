import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

// Evaluated per request so that NEXT_PUBLIC_SITE_URL / VERCEL_URL are read at runtime, not only at build time.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const now = new Date();
  return [
    { url: new URL("/", site).toString(), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/about", site).toString(), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
