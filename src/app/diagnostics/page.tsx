import Link from "next/link";
import { DiagnosticsView } from "@/components/diagnostics/DiagnosticsView";
import { getServerEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/**
 * /diagnostics — provider health screen. Enabled in development by default;
 * in production only with DIAGNOSTICS_ENABLED=true.
 */
export default function DiagnosticsPage() {
  let enabled = false;
  let configError: string | null = null;
  try {
    enabled = getServerEnv().observability.diagnosticsEnabled;
  } catch (e) {
    configError = e instanceof Error ? e.message : "Configuration invalide.";
  }
  if (configError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-bold text-ink-900">Configuration invalide</h1>
        <p className="mt-2 text-sm text-red-700">{configError}</p>
      </main>
    );
  }
  if (!enabled) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-bold text-ink-900">Diagnostics désactivés</h1>
        <p className="mt-2 text-sm text-ink-700">Définissez DIAGNOSTICS_ENABLED=true pour activer cet écran en production.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand-700 underline-offset-2 hover:underline">
          Retour à l&apos;application
        </Link>
      </main>
    );
  }
  return (
    <main className="min-h-full bg-ink-50">
      <DiagnosticsView />
    </main>
  );
}
