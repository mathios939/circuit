import { describe, expect, it } from "vitest";
import { LruTtlCache, memoizeAsync } from "./cache";
import { checkRateLimit, clientKeyFromHeaders } from "./rate-limit";
import { AppError, toAppError, USER_MESSAGES } from "@/lib/errors";

describe("LruTtlCache", () => {
  it("stores, expires and evicts", () => {
    const cache = new LruTtlCache<number>(2, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3); // evicts "b" (least recently used)
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    cache.set("d", 4, -1); // already expired
    expect(cache.get("d")).toBeUndefined();
  });

  it("memoises async computations and shares in-flight promises", async () => {
    const cache = new LruTtlCache<string>();
    const memo = memoizeAsync(cache);
    let calls = 0;
    const compute = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return "v";
    };
    const [a, b] = await Promise.all([memo("k", compute), memo("k", compute)]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(calls).toBe(1);
    await memo("k", compute);
    expect(calls).toBe(1);
  });
});

describe("checkRateLimit", () => {
  it("allows up to the limit per minute, then blocks until the window resets", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3, now).allowed).toBe(true);
    const blocked = checkRateLimit(key, 3, now + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterS).toBeGreaterThan(0);
    expect(checkRateLimit(key, 3, now + 61_000).allowed).toBe(true);
  });
  it("derives a client key from forwarding headers", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientKeyFromHeaders(new Headers())).toBe("local");
  });
});

describe("AppError", () => {
  it("carries a user-friendly message and status", () => {
    const e = new AppError("NOT_ROUTABLE");
    expect(e.message).toBe(USER_MESSAGES.NOT_ROUTABLE);
    expect(e.status).toBe(422);
    expect(e.toJSON().error.code).toBe("NOT_ROUTABLE");
  });
  it("wraps unknown errors without leaking details", () => {
    const wrapped = toAppError(new Error("ECONNRESET at socket"));
    expect(wrapped.code).toBe("UNKNOWN");
    expect(wrapped.message).not.toContain("ECONNRESET");
    const timeout = toAppError(Object.assign(new Error("t"), { name: "TimeoutError" }));
    expect(timeout.code).toBe("PROVIDER_TIMEOUT");
  });
});
