import { AppError } from "@/lib/errors";

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Name of the upstream service, for error reporting. */
  service: string;
}

/** Non-2xx response from an upstream service, with the parsed body for provider-specific handling. */
export class UpstreamHttpError extends Error {
  constructor(
    readonly service: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${service}: HTTP ${status}`);
    this.name = "UpstreamHttpError";
  }

  /** Server-side failures that a fallback provider could absorb. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/**
 * fetch() wrapper with timeout, JSON handling and error normalisation. Every
 * failure is converted into an AppError (or UpstreamHttpError for non-2xx
 * responses, which providers map themselves) so that callers never surface
 * raw network errors to the client.
 */
export async function fetchJson<T = unknown>(url: string, options: FetchJsonOptions): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  const onOuterAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) onOuterAbort();
  options.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    if (res.status === 429) {
      throw new AppError("PROVIDER_UNAVAILABLE", undefined, {
        status: 503,
        details: `${options.service}: rate limited by upstream (429)`,
      });
    }

    const text = await res.text();
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new AppError("PROVIDER_UNAVAILABLE", undefined, {
          details: `${options.service}: ${res.ok ? "invalid JSON response" : `HTTP ${res.status} (non-JSON body)`}`,
        });
      }
    }

    if (!res.ok) throw new UpstreamHttpError(options.service, res.status, json);
    return json as T;
  } catch (e) {
    if (e instanceof AppError || e instanceof UpstreamHttpError) throw e;
    if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
      const reason = controller.signal.reason;
      const isTimeout = reason instanceof DOMException && reason.name === "TimeoutError";
      throw new AppError("PROVIDER_TIMEOUT", undefined, {
        details: `${options.service}: ${isTimeout ? `timeout after ${timeoutMs} ms` : "aborted"}`,
        cause: e,
      });
    }
    throw new AppError("PROVIDER_UNAVAILABLE", undefined, {
      details: `${options.service}: ${e instanceof Error ? e.message : "network error"}`,
      cause: e,
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * Serialises calls and enforces a minimum interval between them. Used for
 * services whose usage policy is "at most one request per second"
 * (Nominatim, OpenTopoData).
 */
export function createThrottle(minIntervalMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = 0;
  return function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = lastStart + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastStart = Date.now();
      return fn();
    });
    chain = run.catch(() => undefined);
    return run;
  };
}
