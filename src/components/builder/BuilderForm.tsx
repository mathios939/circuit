"use client";

import { ErrorBanner } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Field";
import { ActivityPicker } from "./ActivityPicker";
import { AdvancedOptions } from "./AdvancedOptions";
import { GenerateActions } from "./GenerateActions";
import { GpxImportButton } from "./GpxImportButton";
import { ModeAndDistance } from "./ModeAndDistance";
import { NaturalLanguageInput } from "./NaturalLanguageInput";
import { useRouteStore } from "@/store/route-store";

/** The "Créer" tab: activity → start → distance → "Générer mes parcours". */
export function BuilderForm() {
  const status = useRouteStore((s) => s.status);
  const error = useRouteStore((s) => s.error);
  const errorHint = useRouteStore((s) => s.errorHint);
  const clear = useRouteStore((s) => s.clearResults);
  return (
    <div className="space-y-5">
      <Hero />
      <Field label="Activité">
        <ActivityPicker />
      </Field>
      <ModeAndDistance />
      {status === "error" && error ? <ErrorBanner message={error} hint={errorHint ?? undefined} onClose={clear} /> : null}
      <GenerateActions />
      <AdvancedOptions />
      <NaturalLanguageInput />
      <div className="flex items-center justify-center">
        <GpxImportButton />
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="space-y-1" data-testid="hero">
      <h2 className="font-display text-xl font-bold leading-tight tracking-tight text-ink-900">Trouvez votre prochaine sortie</h2>
      <p className="text-sm text-ink-500">Choisissez la distance. Circuit trouve la route.</p>
    </div>
  );
}
