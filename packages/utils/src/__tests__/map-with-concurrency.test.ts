import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "../map-with-concurrency";

describe("mapWithConcurrency", () => {
  it("returns empty array for empty input", async () => {
    const result = await mapWithConcurrency([], 4, async (x) => x);
    expect(result).toEqual([]);
  });

  it("preserves input order", async () => {
    const items = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    const result = await mapWithConcurrency(items, 3, async (x) => x * 2);
    expect(result).toEqual(items.map((x) => x * 2));
  });

  it("processes all items when concurrency exceeds item count", async () => {
    const items = [1, 2, 3];
    const result = await mapWithConcurrency(items, 100, async (x) => x + 10);
    expect(result).toEqual([11, 12, 13]);
  });

  it("passes the correct index to fn", async () => {
    const items = ["a", "b", "c"];
    const result = await mapWithConcurrency(
      items,
      2,
      async (item, index) => `${item}${index}`,
    );
    expect(result).toEqual(["a0", "b1", "c2"]);
  });

  it("never has more than N invocations in flight", async () => {
    const concurrency = 3;
    let inFlight = 0;
    let maxInFlight = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, concurrency, async (item) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      inFlight--;
      return item;
    });

    expect(maxInFlight).toBeLessThanOrEqual(concurrency);
  });

  it("propagates rejections", async () => {
    const items = [1, 2, 3, 4, 5];
    await expect(
      mapWithConcurrency(items, 2, async (x) => {
        if (x === 3) {
          throw new Error("fail at 3");
        }
        return x;
      }),
    ).rejects.toThrow("fail at 3");
  });

  it("works with concurrency of 1 (sequential)", async () => {
    const order: number[] = [];
    const items = [1, 2, 3, 4];
    await mapWithConcurrency(items, 1, async (x) => {
      order.push(x);
      return x;
    });
    expect(order).toEqual([1, 2, 3, 4]);
  });
});
