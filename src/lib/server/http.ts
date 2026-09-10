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

/**
 * fetch() wrapper with timeout, JSON handling and error normalisation. Every
 * failure is converted into an AppError so that callers never surface raw
 * network errors to the client.
 */
export async function fetchJson<T = unknown>(url: string, options: FetchJsonOptions): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  const onOuterAbort = () => controller.abort(options.signal?.reason);
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
        details: `${options.service}: rate limited by upstream`,
      });
    }

    const text = await res.text();
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new AppError("PROVIDER_UNAVAILABLE", undefined, {
            details: `${options.service}: HTTP ${res.status}`,
          });
        }
        throw new AppError("PROVIDER_UNAVAILABLE", undefined, {
          details: `${options.service}: invalid JSON response`,
        });
      }
    }

    if (!res.ok) {
      throw new UpstreamHttpError(options.service, res.status, json);
    }
    return json as T;
  } catch (e) {
    if (e instanceof AppError || e instanceof UpstreamHttpError) throw e;
    if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
      throw new AppError("PROVIDER_TIMEOUT", undefined, { details: `${options.service}: timeout after ${timeoutMs} ms`, cause: e });
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
}
