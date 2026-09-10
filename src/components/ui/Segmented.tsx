"use client";

import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange(value: T): void;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}

/** Accessible segmented control (radio group semantics). */
export function Segmented<T extends string>({ value, options, onChange, size = "md", ariaLabel, className = "" }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`inline-flex w-full rounded-xl bg-ink-100 p-1 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-lg font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${size === "sm" ? "h-8 px-2 text-xs" : "h-9 px-3 text-sm"} ${
              active ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
