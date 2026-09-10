import { COLORS } from "@/lib/ui/colors";

/**
 * The Circuit mark: a loop closing on its start point. Rendered with inline
 * styles only so that it works both in React and in `next/og` image
 * generation (icons), which does not process Tailwind classes.
 */
export function CircuitMark({ size = 64, radius }: { size?: number; radius?: number }) {
  const r = radius ?? Math.round(size * 0.22);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: COLORS.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4c5 0 8 3 8 7s-3 6-6 6-4-2-4-4 1.5-3 3-3 3 1 3 3" />
        <path d="M12 4C7 4 4 7 4 11s3 8 8 8" />
        <circle cx="12" cy="4" r="1.6" fill={COLORS.route} stroke="none" />
      </svg>
    </div>
  );
}
