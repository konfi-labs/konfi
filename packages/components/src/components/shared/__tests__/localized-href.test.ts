import { describe, expect, it } from "vitest";
import { getLocalizedHref, getSupportedLocale } from "../localized-href";

describe("getLocalizedHref", () => {
  it("prefixes internal routes with a supported locale", () => {
    expect(getLocalizedHref("/products", "en")).toBe("/en/products");
    expect(getLocalizedHref("products", "en")).toBe("/en/products");
  });

  it("does not prefix already-localized routes", () => {
    expect(getLocalizedHref("/en/products", "pl")).toBe("/en/products");
    expect(getLocalizedHref("/pl/products", "en")).toBe("/pl/products");
  });

  it("leaves external and special hrefs untouched", () => {
    expect(getLocalizedHref("https://www.example.com/products", "en")).toBe(
      "https://www.example.com/products",
    );
    expect(getLocalizedHref("//www.example.com/products", "en")).toBe(
      "//www.example.com/products",
    );
    expect(getLocalizedHref("mailto:hello@example.com", "en")).toBe(
      "mailto:hello@example.com",
    );
    expect(getLocalizedHref("tel:+48123456789", "en")).toBe("tel:+48123456789");
    expect(getLocalizedHref("#details", "en")).toBe("#details");
  });

  it("falls back for invalid locale values", () => {
    expect(getSupportedLocale("enhttps:")).toBe("pl");
    expect(getLocalizedHref("/products", "enhttps:")).toBe("/pl/products");
  });
});
