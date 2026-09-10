/**
 * Structured logging with a pluggable sink, so that Sentry / OpenTelemetry /
 * a log shipper can be added later without touching call sites.
 *
 * Rules: never log API keys, tokens or user-identifying data. Values that look
 * like secrets are redacted defensively.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface LogRecord {
  level: Exclude<LogLevel, "silent">;
  time: string;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface LogSink {
  write(record: LogRecord): void;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
  /** Measures an async operation and logs its duration and outcome. */
  time<T>(message: string, fields: Record<string, unknown>, fn: () => Promise<T>): Promise<T>;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const SECRET_KEY = /(key|token|secret|password|authorization|api[-_]?key)/i;
const SECRET_VALUE = /([?&](?:key|api_key|apikey|token|access_token)=)[^&\s]+/gi;

/** Removes secret-looking fields and query-string keys from a value tree. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") return value.replace(SECRET_VALUE, "$1[redacted]");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message), ...("code" in value ? { code: (value as { code?: unknown }).code } : {}) };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export class ConsoleSink implements LogSink {
  constructor(private readonly format: "json" | "pretty") {}

  write(record: LogRecord): void {
    const fn = record.level === "error" ? console.error : record.level === "warn" ? console.warn : console.log;
    if (this.format === "json") {
      fn(JSON.stringify(record));
      return;
    }
    const { level, time, message, ...rest } = record;
    const extras = Object.keys(rest).length > 0 ? " " + JSON.stringify(rest) : "";
    fn(`${time.slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${message}${extras}`);
  }
}

/** Sink that keeps records in memory (tests, diagnostics). */
export class MemorySink implements LogSink {
  readonly records: LogRecord[] = [];
  write(record: LogRecord): void {
    this.records.push(record);
  }
}

class BaseLogger implements Logger {
  constructor(
    private readonly sink: LogSink,
    private readonly minLevel: LogLevel,
    private readonly fields: Record<string, unknown> = {},
  ) {}

  private emit(level: Exclude<LogLevel, "silent">, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const record: LogRecord = {
      level,
      time: new Date().toISOString(),
      message,
      ...(redact({ ...this.fields, ...(fields ?? {}) }) as Record<string, unknown>),
    };
    try {
      this.sink.write(record);
    } catch {
      /* logging must never break the request */
    }
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.emit("debug", message, fields);
  }
  info(message: string, fields?: Record<string, unknown>): void {
    this.emit("info", message, fields);
  }
  warn(message: string, fields?: Record<string, unknown>): void {
    this.emit("warn", message, fields);
  }
  error(message: string, fields?: Record<string, unknown>): void {
    this.emit("error", message, fields);
  }
  child(fields: Record<string, unknown>): Logger {
    return new BaseLogger(this.sink, this.minLevel, { ...this.fields, ...fields });
  }
  async time<T>(message: string, fields: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      const result = await fn();
      this.info(message, { ...fields, durationMs: Math.round(performance.now() - started), status: "ok" });
      return result;
    } catch (e) {
      this.warn(message, { ...fields, durationMs: Math.round(performance.now() - started), status: "error", error: e });
      throw e;
    }
  }
}

export function createLogger(options: { sink?: LogSink; level?: LogLevel; format?: "json" | "pretty"; fields?: Record<string, unknown> } = {}): Logger {
  return new BaseLogger(options.sink ?? new ConsoleSink(options.format ?? "pretty"), options.level ?? "info", options.fields);
}

/** Generates a short request identifier. */
export function newRequestId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const globalLogger = globalThis as unknown as { __circuitLogger?: Logger };

/** Process-wide root logger (configured lazily by the server layer). */
export function getRootLogger(): Logger {
  globalLogger.__circuitLogger ??= createLogger({ level: process.env.NODE_ENV === "test" ? "silent" : "info", format: process.env.NODE_ENV === "production" ? "json" : "pretty" });
  return globalLogger.__circuitLogger;
}

export function setRootLogger(logger: Logger): void {
  globalLogger.__circuitLogger = logger;
}
