/**
 * Application error codes. Each code maps to a user-friendly French message
 * (see `USER_MESSAGES`), so that raw provider errors never reach the UI.
 */
export type AppErrorCode =
  | "INVALID_REQUEST"
  | "PLACE_NOT_FOUND"
  | "NOT_ROUTABLE"
  | "NO_ROUTE"
  | "DISTANCE_UNREALISTIC"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "RATE_LIMITED"
  | "GPX_INVALID"
  | "GPX_TOO_LARGE"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: string;

  constructor(code: AppErrorCode, message?: string, options?: { status?: number; details?: string; cause?: unknown }) {
    super(message ?? USER_MESSAGES[code], { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? DEFAULT_STATUS[code];
    this.details = options?.details;
  }

  toJSON(): { error: { code: AppErrorCode; message: string; details?: string } } {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

const DEFAULT_STATUS: Record<AppErrorCode, number> = {
  INVALID_REQUEST: 400,
  PLACE_NOT_FOUND: 404,
  NOT_ROUTABLE: 422,
  NO_ROUTE: 422,
  DISTANCE_UNREALISTIC: 422,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_TIMEOUT: 504,
  RATE_LIMITED: 429,
  GPX_INVALID: 400,
  GPX_TOO_LARGE: 413,
  NOT_CONFIGURED: 500,
  UNKNOWN: 500,
};

export const USER_MESSAGES: Record<AppErrorCode, string> = {
  INVALID_REQUEST: "La demande est invalide. Vérifiez les paramètres saisis.",
  PLACE_NOT_FOUND: "Lieu introuvable. Essayez une autre orthographe ou cliquez sur la carte.",
  NOT_ROUTABLE:
    "Ce point n'est pas accessible par un chemin praticable (mer, montagne, zone interdite…). Déplacez-le vers une route ou un sentier.",
  NO_ROUTE: "Aucun parcours trouvé pour ces critères. Essayez une autre distance, un autre départ ou une autre activité.",
  DISTANCE_UNREALISTIC: "Cette distance n'est pas réaliste pour l'activité choisie.",
  PROVIDER_UNAVAILABLE: "Le service de calcul d'itinéraires est momentanément indisponible. Réessayez dans quelques instants.",
  PROVIDER_TIMEOUT: "Le calcul a pris trop de temps. Réessayez avec une distance plus courte ou dans quelques instants.",
  RATE_LIMITED: "Trop de requêtes en peu de temps. Patientez une minute avant de réessayer.",
  GPX_INVALID: "Ce fichier GPX est invalide ou ne contient aucune trace exploitable.",
  GPX_TOO_LARGE: "Ce fichier GPX est trop volumineux.",
  NOT_CONFIGURED: "Le service n'est pas configuré correctement. Contactez l'administrateur.",
  UNKNOWN: "Une erreur inattendue s'est produite. Réessayez.",
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/**
 * True when the failure comes from the service itself (timeout, 5xx, 429,
 * network) rather than from the request (impossible route, invalid point).
 * Only these failures justify switching to a fallback provider.
 */
export function isRetryableError(e: unknown): boolean {
  if (!isAppError(e)) return true;
  return e.code === "PROVIDER_TIMEOUT" || e.code === "PROVIDER_UNAVAILABLE" || e.code === "RATE_LIMITED" || e.code === "UNKNOWN";
}

/** Wraps any thrown value into an AppError without leaking internals. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
    return new AppError("PROVIDER_TIMEOUT", undefined, { cause: e });
  }
  return new AppError("UNKNOWN", undefined, { cause: e });
}
