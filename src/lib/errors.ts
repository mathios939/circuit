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

/** Actionable hint displayed under the error message, per code. */
export const USER_HINTS: Partial<Record<AppErrorCode, string>> = {
  INVALID_REQUEST: "Vérifiez la distance (dans les limites de l'activité), le point de départ et, pour un trajet A → B, le point d'arrivée.",
  PLACE_NOT_FOUND: "Ajoutez la ville ou le pays (ex. « Annecy, France ») ou placez le point directement sur la carte.",
  NOT_ROUTABLE: "Choisissez un départ sur une rue, une route ou un sentier. Les points en pleine mer, en zone privée ou en haute montagne ne sont pas accessibles.",
  NO_ROUTE: "Essayez une distance différente (±10 km), un autre style ou un départ plus proche d'un réseau de routes / chemins.",
  DISTANCE_UNREALISTIC: "Adaptez la distance aux limites de l'activité, ou changez d'activité.",
  PROVIDER_UNAVAILABLE: "Le problème vient du service de routing, pas de votre demande : votre parcours est conservé, réessayez dans une minute.",
  PROVIDER_TIMEOUT: "Les longues distances demandent plus de calcul : réduisez la distance ou réessayez dans quelques instants.",
  RATE_LIMITED: "Les instances publiques de routing sont partagées : attendez une minute avant de relancer une génération.",
  GPX_INVALID: "Le fichier doit être un GPX contenant une trace (<trk>) ou un itinéraire (<rte>) avec des coordonnées.",
  GPX_TOO_LARGE: "Simplifiez la trace (moins de points) ou exportez-la depuis votre application avec moins de précision.",
  NOT_CONFIGURED: "Vérifiez les variables d'environnement du serveur (voir .env.example).",
  UNKNOWN: "Si le problème persiste, rechargez la page ou réessayez plus tard.",
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
