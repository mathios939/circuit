"use client";

import { Field } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/ui/Feedback";
import { ActivityPicker } from "./ActivityPicker";
import { AdvancedOptions } from "./AdvancedOptions";
import { GenerateActions } from "./GenerateActions";
import { GpxImportButton } from "./GpxImportButton";
import { ModeAndDistance } from "./ModeAndDistance";
import { NaturalLanguageInput } from "./NaturalLanguageInput";
import { useRouteStore } from "@/store/route-store";

/** The "Créer" tab: activity → start → distance → generate. */
export function BuilderForm() {
  const status = useRouteStore((s) => s.status);
  const error = useRouteStore((s) => s.error);
  const clear = useRouteStore((s) => s.clearResults);
  return (
    <div className="space-y-5">
      <NaturalLanguageInput />
      <Field label="Activité">
        <ActivityPicker />
      </Field>
      <ModeAndDistance />
      <AdvancedOptions />
      {status === "error" && error ? <ErrorBanner message={error} onClose={clear} /> : null}
      <GenerateActions />
      <div className="flex items-center justify-center">
        <GpxImportButton />
      </div>
    </div>
  );
}
