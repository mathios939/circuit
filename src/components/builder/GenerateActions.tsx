"use client";

import { Shuffle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRouteStore } from "@/store/route-store";

export function GenerateActions() {
  const status = useRouteStore((s) => s.status);
  const start = useRouteStore((s) => s.start);
  const end = useRouteStore((s) => s.end);
  const mode = useRouteStore((s) => s.mode);
  const distanceKm = useRouteStore((s) => s.distanceKm);
  const generate = useRouteStore((s) => s.generate);
  const cancel = useRouteStore((s) => s.cancelGeneration);
  const loading = status === "loading";
  const canGenerate = Boolean(start) && (mode === "loop" ? distanceKm !== null && distanceKm > 0 : Boolean(end));
  const canSurprise = Boolean(start) && distanceKm !== null && distanceKm > 0;

  return (
    <div className="space-y-2">
      <Button variant="accent" size="lg" block loading={loading} disabled={!canGenerate} onClick={() => generate()} icon={<Wand2 className="h-4 w-4" />} data-testid="generate-button">
        {loading ? "Calcul des parcours…" : "Générer"}
      </Button>
      <div className="flex gap-2">
        <Button variant="secondary" block disabled={!canSurprise || loading} onClick={() => generate({ surprise: true })} icon={<Shuffle className="h-4 w-4" />} data-testid="surprise-button">
          Surprends-moi
        </Button>
        {loading ? (
          <Button variant="ghost" onClick={cancel}>
            Annuler
          </Button>
        ) : null}
      </div>
      {!start ? <p className="text-center text-xs text-ink-500">Choisissez un point de départ pour commencer.</p> : null}
    </div>
  );
}
