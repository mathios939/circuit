/**
 * Canonical public URL of the deployment, used only where an absolute URL is
 * required (metadata, Open Graph, robots, sitemap). Nothing else should
 * hard-code a host: share links are built from the current origin.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL — set explicitly (custom domain later);
 *   2. VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL — provided by Vercel;
 *   3. http://localhost:3000 in development.
 */
export function getSiteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return new URL(withProtocol(explicit));
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) return new URL(withProtocol(vercel));
  return new URL("http://localhost:3000");
}

function withProtocol(host: string): string {
  const trimmed = host.replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const SITE_NAME = "Circuit";
export const SITE_TITLE = "Circuit — Créez vos parcours vélo, running et trail";
export const SITE_DESCRIPTION =
  "Choisissez un départ, une distance et une activité : Circuit génère des boucles et itinéraires vélo, gravel, VTT, running, trail et randonnée, avec dénivelé, profil et export GPX.";
