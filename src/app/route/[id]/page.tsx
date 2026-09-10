import type { Metadata } from "next";
import { SharedRouteView } from "@/components/share/SharedRouteView";
import { decodeSharedRoute } from "@/lib/share/encode";
import { ACTIVITY_LABELS } from "@/lib/activities/profiles";
import { formatDistance } from "@/lib/utils/format";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { d } = await searchParams;
  const shared = d ? decodeSharedRoute(d) : null;
  if (!shared) return { title: "Parcours partagé — Circuit" };
  const last = shared.points[shared.points.length - 1];
  return {
    title: `${shared.name} — Circuit`,
    description: `${ACTIVITY_LABELS[shared.activity]} · ${formatDistance(last?.dist ?? 0)}`,
  };
}

/**
 * Shareable route page: /route/[id]?d=<payload>. The payload makes the link
 * self-contained; when a server-side store exists, `id` will be resolved
 * there first.
 */
export default async function SharedRoutePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { d } = await searchParams;
  return <SharedRouteView id={id} encoded={d ?? null} />;
}
