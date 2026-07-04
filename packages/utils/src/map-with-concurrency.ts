/**
 * Map `items` through `fn` with at most `concurrency` invocations in flight.
 * Results preserve input order. Rejections propagate after in-flight work settles.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = Array.from({ length: items.length });
  let cursor = 0;
  let firstError: unknown = undefined;
  let hasError = false;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor++;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        if (!hasError) {
          hasError = true;
          firstError = err;
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  if (hasError) {
    throw firstError;
  }

  return results;
}
