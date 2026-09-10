import type { RouteResult } from "@/lib/types";
import { getExporter, type ExportedFile } from "@/lib/export";
import { encodeSharedRoute } from "@/lib/share/encode";

/** Triggers a browser download of a text file. */
export function downloadTextFile(file: ExportedFile): void {
  const blob = new Blob([file.content], { type: `${file.mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Builds the share URL of a route (self-contained: works without a server store). */
export function buildShareUrl(route: RouteResult): string {
  const encoded = encodeSharedRoute({ name: route.name, activity: route.activity, mode: route.mode, points: route.points });
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/route/${encodeURIComponent(route.id)}?d=${encoded}`;
}

export function exportRoute(route: RouteResult, format: string): ExportedFile | null {
  const exporter = getExporter(format);
  if (!exporter) return null;
  return exporter.export(route, { link: buildShareUrl(route) });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
