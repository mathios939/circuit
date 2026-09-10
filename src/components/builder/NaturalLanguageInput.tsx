"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import type { Place } from "@/lib/types";
import { errorMessage, geocodeApi, parseNaturalLanguageApi } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { useRouteStore } from "@/store/route-store";

const EXAMPLES = [
  "Boucle VTT de 35 km au départ d'Annecy avec environ 800 m de D+",
  "Fais-moi une boucle gravel de 70 km autour de Lyon en évitant les grosses routes",
  "Course à pied de 10 km depuis la Tour Eiffel, plat et nature",
];

/**
 * Free-text request → structured form. Parsing happens server side behind
 * the RouteIntentParser abstraction; place names are then geocoded.
 */
export function NaturalLanguageInput() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const applyIntent = useRouteStore((s) => s.applyIntent);
  const generate = useRouteStore((s) => s.generate);

  const interpret = async (andGenerate: boolean) => {
    if (text.trim().length < 3) return;
    setBusy(true);
    setFeedback(null);
    try {
      const intent = await parseNaturalLanguageApi(text);
      const resolve = async (q?: string): Promise<Place | undefined> => {
        if (!q) return undefined;
        const r = (await geocodeApi(q))[0];
        return r ? { lat: r.lat, lng: r.lng, name: r.name, label: r.label } : undefined;
      };
      const [start, end] = await Promise.all([resolve(intent.startQuery), resolve(intent.endQuery)]);
      applyIntent(intent, { start, end });
      const missing: string[] = [];
      if (intent.startQuery && !start) missing.push(`lieu « ${intent.startQuery} » introuvable`);
      if (!intent.startQuery) missing.push("point de départ non détecté");
      if (intent.matched.length === 0) setFeedback("Je n'ai rien compris de cette phrase. Essayez par exemple : " + EXAMPLES[0]);
      else setFeedback(`Compris : ${intent.matched.join(", ")}${missing.length ? ` — ${missing.join(", ")}` : ""}.`);
      if (andGenerate && start && missing.length === 0) await generate();
    } catch (e) {
      setFeedback(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
      <label htmlFor="nl-input" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
        <Sparkles className="h-3.5 w-3.5" /> Ou décrivez votre sortie
      </label>
      <textarea
        id="nl-input"
        data-testid="nl-input"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void interpret(true);
          }
        }}
        placeholder={EXAMPLES[1]}
        className="w-full resize-none rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="text-xs text-brand-700 underline-offset-2 hover:underline" onClick={() => setText(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]!)}>
          Exemple
        </button>
        <Button size="sm" variant="accent" loading={busy} onClick={() => interpret(true)} data-testid="nl-submit">
          Interpréter et générer
        </Button>
      </div>
      {feedback ? <p className="text-xs text-ink-700" data-testid="nl-feedback">{feedback}</p> : null}
    </div>
  );
}
