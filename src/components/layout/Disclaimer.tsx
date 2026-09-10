import Link from "next/link";
import type { ActivityType } from "@/lib/types";

const OFF_ROAD: ReadonlySet<ActivityType> = new Set<ActivityType>(["mtb", "trail_running", "hiking", "gravel"]);

/**
 * Reminder that generated routes are indicative. The message is stronger for
 * off-road activities, where OpenStreetMap data (path existence, legal access,
 * difficulty) is more often incomplete.
 */
export function Disclaimer({ activity, compact = false }: { activity?: ActivityType; compact?: boolean }) {
  const offRoad = activity !== undefined && OFF_ROAD.has(activity);
  const text = offRoad
    ? "Parcours indicatif calculé à partir de données OpenStreetMap, parfois incomplètes pour les chemins et sentiers : vérifiez l'accès, l'état du terrain et la météo avant de partir."
    : "Parcours indicatif calculé à partir de données OpenStreetMap : vérifiez les conditions locales (travaux, circulation, météo) avant de partir.";
  if (compact) {
    return (
      <p className="text-[11px] leading-relaxed text-ink-500" data-testid="disclaimer">
        {text}{" "}
        <Link href="/about" className="underline underline-offset-2 hover:text-ink-900">
          En savoir plus
        </Link>
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="disclaimer">
      {text}{" "}
      <Link href="/about" className="underline underline-offset-2">
        En savoir plus
      </Link>
    </div>
  );
}
