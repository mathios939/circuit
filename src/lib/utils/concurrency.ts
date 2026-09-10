/** Minimal promise concurrency limiter (p-limit style). */
export function createLimiter(concurrency: number) {
  const max = Math.max(1, Math.floor(concurrency));
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    active--;
    const run = queue.shift();
    if (run) run();
  };

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        task().then(resolve, reject).finally(next);
      };
      if (active < max) run();
      else queue.push(run);
    });
  };
}

/** Runs `fn` over `items` with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: readonly T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const limit = createLimiter(concurrency);
  return Promise.all(items.map((item, i) => limit(() => fn(item, i))));
}

/** Like Promise.allSettled but returns only fulfilled values, in order. */
export async function settledValues<T>(promises: Promise<T>[]): Promise<{ values: T[]; errors: unknown[] }> {
  const results = await Promise.allSettled(promises);
  const values: T[] = [];
  const errors: unknown[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") values.push(r.value);
    else errors.push(r.reason);
  }
  return { values, errors };
}
