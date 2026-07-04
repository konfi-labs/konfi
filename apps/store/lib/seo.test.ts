import { describe, expect, it } from "vitest";
import { buildAlternates, buildCanonicalPath, buildCanonicalUrl } from "./seo";

describe("store seo helpers", () => {
  it("normalizes canonical paths and strips internal params", () => {
    expect(
      buildCanonicalPath("/en/products/", {
        adminPreview: "1",
        campaignId: "summer",
        category: "Business cards",
        channelId: "channel-1",
        cursor: "page-2",
        price: "",
      }),
    ).toBe("/en/products?campaignId=summer&category=Business+cards");
  });

  it("keeps public search params in canonical URLs", () => {
    expect(
      buildCanonicalUrl({
        baseUrl: "https://store.example.com/",
        pathname: "pl/search",
        searchParams: {
          q: "ulotki",
        },
      }),
    ).toBe("https://store.example.com/pl/search?q=ulotki");
  });

  it("builds alternates with an absolute canonical when a base URL is provided", () => {
    expect(
      buildAlternates({
        baseUrl: "https://store.example.com/",
        pathname: "/en/products/card/",
      }),
    ).toEqual({
      canonical: "https://store.example.com/en/products/card",
    });
  });
});
