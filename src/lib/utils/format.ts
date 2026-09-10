/** Formatting helpers (French locale, metric units). Pure functions, safe on client and server. */

export function formatDistance(meters: number, decimals = 1): string {
  if (!Number.isFinite(meters)) return "–";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} km`;
}

export function formatElevation(meters: number, sign: "+" | "-" | "" = ""): string {
  if (!Number.isFinite(meters)) return "–";
  const value = Math.round(Math.abs(meters)).toLocaleString("fr-FR");
  return `${sign}${value} m`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "–";
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m.toString().padStart(2, "0")}`;
}

export function formatPercent(ratio: number, decimals = 0): string {
  if (!Number.isFinite(ratio)) return "–";
  return `${(ratio * 100).toFixed(decimals)} %`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
