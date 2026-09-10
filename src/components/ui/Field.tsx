"use client";

import type { ReactNode } from "react";

export function Field({ label, hint, htmlFor, children, action }: { label: string; hint?: string; htmlFor?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function Toggle({ checked, onChange, label, description, id }: { checked: boolean; onChange(v: boolean): void; label: string; description?: string; id?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-3 rounded-lg px-1 py-1.5 hover:bg-ink-50">
      <span>
        <span className="block text-sm text-ink-900">{label}</span>
        {description ? <span className="block text-xs text-ink-500">{description}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" aria-checked={checked} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-10 rounded-full bg-ink-200 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
