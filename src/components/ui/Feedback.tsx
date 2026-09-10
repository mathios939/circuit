"use client";

import { AlertTriangle, Info, X } from "lucide-react";
import type { ReactNode } from "react";

export function ErrorBanner({ message, onClose }: { message: string; onClose?(): void }) {
  return (
    <div role="alert" data-testid="error-banner" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">{message}</p>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded p-0.5 hover:bg-red-100">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-ink-100 p-3 text-xs text-ink-700">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-500" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "warning" | "brand" }) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700",
    positive: "bg-brand-50 text-brand-700",
    warning: "bg-amber-50 text-amber-800",
    brand: "bg-ink-900 text-white",
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink-900 px-4 py-2 text-sm text-white shadow-lg">
      {message}
    </div>
  );
}
