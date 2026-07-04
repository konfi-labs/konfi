import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeExtractedExternalPriceInfo } from "./normalize-extracted-price-info";

describe("normalizeExtractedExternalPriceInfo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes string delivery times from extracted ranges", () => {
    const result = normalizeExtractedExternalPriceInfo({
      currency: "PLN",
      priceRanges: [
        {
          deliveryTime: "48h",
          price: 1.25,
          quantity: 100,
        },
      ],
    });

    expect(result).toEqual({
      currency: "PLN",
      priceRanges: [
        {
          deliveryTime: 2,
          price: 1.25,
          quantity: 100,
        },
      ],
    });
  });

  it("resolves ISO delivery dates into day counts", () => {
    vi.setSystemTime(new Date("2026-04-10T00:00:00.000Z"));

    const result = normalizeExtractedExternalPriceInfo({
      priceRanges: [
        {
          deliveryTime: "2026-04-11T12:00:00.000Z",
          price: 2.5,
          quantity: 50,
        },
      ],
    });

    expect(result?.priceRanges?.[0]?.deliveryTime).toBe(2);
  });

  it("drops empty extracted ranges while preserving price text", () => {
    const result = normalizeExtractedExternalPriceInfo({
      priceText: "From 1.25 PLN",
      priceRanges: [
        {
          deliveryTime: "",
          price: undefined,
          quantity: undefined,
          unit: "",
        },
      ],
    });

    expect(result).toEqual({
      priceText: "From 1.25 PLN",
    });
  });
});
