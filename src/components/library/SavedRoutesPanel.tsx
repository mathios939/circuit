"use client";

import { Copy, History, Pencil, Star, Trash2 } from "lucide-react";
import { useEffect } from "react";
import type { SavedRoute } from "@/lib/storage/repository";
import { ACTIVITY_LABELS } from "@/lib/activities/profiles";
import { formatDate, formatDistance, formatElevation } from "@/lib/utils/format";
import { InfoNote } from "@/components/ui/Feedback";
import { useRouteStore } from "@/store/route-store";

/** Favorites + history, stored locally for now (RouteRepository abstraction). */
export function SavedRoutesPanel() {
  const saved = useRouteStore((s) => s.saved);
  const refresh = useRouteStore((s) => s.refreshSaved);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const favorites = saved.filter((s) => s.kind === "favorite");
  const history = saved.filter((s) => s.kind === "history");

  return (
    <div className="space-y-5" data-testid="library-panel">
      <Section title="Favoris" icon={<Star className="h-3.5 w-3.5" />} entries={favorites} empty="Aucun parcours enregistré. Générez un parcours puis cliquez sur « Enregistrer »." />
      <Section title="Historique" icon={<History className="h-3.5 w-3.5" />} entries={history} empty="Vos dernières générations apparaîtront ici." />
      <InfoNote>Les parcours sont stockés dans ce navigateur. Un compte utilisateur permettra bientôt de les synchroniser.</InfoNote>
    </div>
  );
}

function Section({ title, icon, entries, empty }: { title: string; icon: React.ReactNode; entries: SavedRoute[]; empty: string }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
        {icon} {title}
      </p>
      {entries.length === 0 ? <p className="text-xs text-ink-500">{empty}</p> : entries.map((e) => <Entry key={e.id} entry={e} />)}
    </div>
  );
}

function Entry({ entry }: { entry: SavedRoute }) {
  const load = useRouteStore((s) => s.loadSaved);
  const rename = useRouteStore((s) => s.renameSaved);
  const duplicate = useRouteStore((s) => s.duplicateSaved);
  const remove = useRouteStore((s) => s.removeSaved);
  const r = entry.route;
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3" data-testid="saved-entry">
      <button type="button" onClick={() => load(entry.id)} className="w-full text-left">
        <p className="truncate text-sm font-semibold text-ink-900">{entry.name}</p>
        <p className="text-xs text-ink-500">
          {ACTIVITY_LABELS[r.activity]} · {formatDistance(r.stats.distanceM)} · {r.stats.hasElevation ? formatElevation(r.stats.ascentM, "+") : "D+ inconnu"} · {formatDate(entry.updatedAt)}
        </p>
      </button>
      <div className="mt-2 flex gap-1">
        <IconButton label="Renommer" onClick={() => {
          const name = window.prompt("Nouveau nom du parcours", entry.name);
          if (name && name.trim()) void rename(entry.id, name);
        }}>
          <Pencil className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Dupliquer" onClick={() => duplicate(entry.id)}>
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Supprimer" onClick={() => remove(entry.id)} danger>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children, danger }: { label: string; onClick(): void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-md p-1.5 ${danger ? "text-red-600 hover:bg-red-50" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"}`}
    >
      {children}
    </button>
  );
}
