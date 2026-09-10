"use client";

import { FlaskConical } from "lucide-react";

/** Set at build time: NEXT_PUBLIC_DEMO_MODE=true switches the server to synthetic providers. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Explicit banner: synthetic routes must never pass for real data. */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div role="note" data-testid="demo-banner" className="flex items-center gap-2 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Mode démo : parcours, lieux et altitudes sont synthétiques et ne correspondent pas au terrain réel.
    </div>
  );
}
