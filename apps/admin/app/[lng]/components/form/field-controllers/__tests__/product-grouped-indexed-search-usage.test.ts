import { describe, expect, it } from "vitest";
import {
  clearKonfiProductUsageForChannel,
  incrementKonfiProductUsage,
  KONFI_PRODUCT_USAGE_LIMIT,
  pruneKonfiProductUsage,
  prioritizeMostOftenChosenOptions,
  readKonfiProductUsageForChannel,
  readKonfiProductUsageStorage,
} from "../product-grouped-indexed-search-usage";

type MemoryStorage = Storage;

function createMemoryStorage(): MemoryStorage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("product-grouped-indexed-search-usage", () => {
  describe("pruneKonfiProductUsage", () => {
    it("removes invalid values and keeps top limit", () => {
      const usage: Record<string, number> = {
        product_invalid_nan: Number.NaN,
        product_invalid_zero: 0,
        product_invalid_negative: -1,
      };

      for (let index = 0; index < KONFI_PRODUCT_USAGE_LIMIT + 5; index++) {
        usage[`product_${index}`] = index + 1;
      }

      const result = pruneKonfiProductUsage(usage);
      expect(Object.keys(result)).toHaveLength(KONFI_PRODUCT_USAGE_LIMIT);
      expect(result.product_invalid_nan).toBeUndefined();
      expect(result.product_invalid_zero).toBeUndefined();
      expect(result.product_invalid_negative).toBeUndefined();
      expect(result.product_34).toBe(35);
      expect(result.product_4).toBeUndefined();
    });
  });

  describe("channel-aware storage", () => {
    it("increments and clears usage per channel", () => {
      const storage = createMemoryStorage();

      expect(readKonfiProductUsageStorage(storage)).toEqual({});

      incrementKonfiProductUsage("channel-a", "product-1", storage);
      incrementKonfiProductUsage("channel-a", "product-1", storage);
      incrementKonfiProductUsage("channel-a", "product-2", storage);
      incrementKonfiProductUsage("channel-b", "product-9", storage);

      expect(readKonfiProductUsageForChannel("channel-a", storage)).toEqual({
        "product-1": 2,
        "product-2": 1,
      });
      expect(readKonfiProductUsageForChannel("channel-b", storage)).toEqual({
        "product-9": 1,
      });

      clearKonfiProductUsageForChannel("channel-a", storage);

      expect(readKonfiProductUsageForChannel("channel-a", storage)).toEqual({});
      expect(readKonfiProductUsageForChannel("channel-b", storage)).toEqual({
        "product-9": 1,
      });
    });
  });

  describe("prioritizeMostOftenChosenOptions", () => {
    it("moves frequently chosen options to top group with deterministic order", () => {
      const baseOptions = [
        { label: "Zeta", value: "product-z", group: "Category A" },
        { label: "Alpha", value: "product-a", group: "Category B" },
        { label: "Beta", value: "product-b", group: "Category A" },
      ];

      const result = prioritizeMostOftenChosenOptions(
        baseOptions,
        {
          "product-z": 5,
          "product-a": 5,
          "product-b": 1,
        },
        "Most often chosen",
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        label: "Alpha",
        value: "product-a",
        group: "Most often chosen",
      });
      expect(result[1]).toEqual({
        label: "Zeta",
        value: "product-z",
        group: "Most often chosen",
      });
      expect(result[2]).toEqual({
        label: "Beta",
        value: "product-b",
        group: "Most often chosen",
      });
    });

    it("returns original list when no usage data exists", () => {
      const baseOptions = [
        { label: "A", value: "a", group: "Category" },
        { label: "B", value: "b", group: "Category" },
      ];

      expect(
        prioritizeMostOftenChosenOptions(baseOptions, {}, "Most often chosen"),
      ).toEqual(baseOptions);
    });
  });
});
