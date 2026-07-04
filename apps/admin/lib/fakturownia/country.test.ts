import { describe, expect, it } from "vitest";
import {
  FAKTUROWNIA_COUNTRY_OPTIONS,
  getNormalizedCountryCode,
  normalizeCountryCode,
} from "@/lib/fakturownia/country";

describe("Fakturownia country normalization", () => {
  it("exposes ISO country options for the invoice form select", () => {
    expect(FAKTUROWNIA_COUNTRY_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "PL", defaultLabel: "Poland" }),
        expect.objectContaining({ value: "DE", defaultLabel: "Germany" }),
        expect.objectContaining({
          value: "GB",
          defaultLabel: "United Kingdom",
        }),
      ]),
    );
  });

  describe("normalizeCountryCode", () => {
    it("keeps ISO alpha-2 codes and uppercases them", () => {
      expect(normalizeCountryCode("pl")).toBe("PL");
      expect(normalizeCountryCode("DE")).toBe("DE");
    });

    it("rejects unknown alpha-2 values instead of passing them through", () => {
      expect(normalizeCountryCode("XX")).toBeUndefined();
      expect(normalizeCountryCode("EN")).toBeUndefined();
    });

    it("normalizes common Polish and English country names", () => {
      expect(normalizeCountryCode("Polska")).toBe("PL");
      expect(normalizeCountryCode("Poland")).toBe("PL");
      expect(normalizeCountryCode("Niemcy")).toBe("DE");
      expect(normalizeCountryCode("Germany")).toBe("DE");
    });

    it("extracts country codes from mixed display values", () => {
      expect(normalizeCountryCode("Polska (PL)")).toBe("PL");
      expect(normalizeCountryCode("PL - Poland")).toBe("PL");
      expect(normalizeCountryCode("United Kingdom (GB)")).toBe("GB");
    });

    it("handles common alpha-3 codes used in exports", () => {
      expect(normalizeCountryCode("POL")).toBe("PL");
      expect(normalizeCountryCode("DEU")).toBe("DE");
    });

    it("returns undefined for unknown or empty values", () => {
      expect(normalizeCountryCode("")).toBeUndefined();
      expect(normalizeCountryCode("Moon Base Alpha")).toBeUndefined();
      expect(normalizeCountryCode(undefined)).toBeUndefined();
    });
  });

  describe("getNormalizedCountryCode", () => {
    it("falls back to PL when the input cannot be normalized", () => {
      expect(getNormalizedCountryCode(undefined)).toBe("PL");
      expect(getNormalizedCountryCode("unknown value")).toBe("PL");
    });

    it("supports custom fallbacks", () => {
      expect(getNormalizedCountryCode("unknown value", "DE")).toBe("DE");
    });
  });
});
