import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  genericSearch: vi.fn(),
}));

vi.mock("@konfi/meilisearch", () => ({
  genericSearch: mocks.genericSearch,
}));

import {
  createMeilisearchProductFilters,
  resolveStorefrontSearchBackend,
  searchDocumentMatchesQuery,
  searchStorefrontProducts,
} from "./product-search.server";

vi.mock("server-only", () => ({}));

const dedicatedTenantContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
};

const saasTenantContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveStorefrontSearchBackend", () => {
  it("uses Firestore for dedicated auto search when Meilisearch is not configured", () => {
    expect(
      resolveStorefrontSearchBackend(dedicatedTenantContext, {
        KONFI_STOREFRONT_SEARCH_BACKEND: "auto",
      }),
    ).toBe("firestore");
  });

  it("keeps Meilisearch for dedicated auto search when Meilisearch is configured", () => {
    expect(
      resolveStorefrontSearchBackend(dedicatedTenantContext, {
        MEILISEARCH_HOST: "https://meili.example.com",
      }),
    ).toBe("meilisearch");
  });

  it("uses Firestore for SaaS auto search", () => {
    expect(
      resolveStorefrontSearchBackend(saasTenantContext, {
        MEILISEARCH_HOST: "https://meili.example.com",
      }),
    ).toBe("firestore");
  });
});

describe("createMeilisearchProductFilters", () => {
  it("uses only configured filterable product attributes", () => {
    expect(
      createMeilisearchProductFilters({
        channelId: "channel-1",
        recommendedOnly: true,
      }),
    ).toEqual(['channelId = "channel-1"', "recommended = true"]);
  });

  it("does not filter products by linkedChannels", () => {
    expect(
      createMeilisearchProductFilters({
        channelId: "channel-1",
        recommendedOnly: false,
      }).join(" "),
    ).not.toContain("linkedChannels");
  });
});

describe("searchStorefrontProducts with Meilisearch", () => {
  it("keeps products with serialized Firestore timestamp availability", async () => {
    const pastSeconds = Math.floor(Date.now() / 1000) - 60;
    const previousMeilisearchHost = process.env.MEILISEARCH_HOST;
    process.env.MEILISEARCH_HOST = "https://meili.example.com";

    try {
      mocks.genericSearch.mockResolvedValue([
        {
          _firestore_id: "product-1",
          active: true,
          availability: {
            availableForPurchase: true,
            published: true,
            publication: {
              _seconds: pastSeconds,
              _nanoseconds: 0,
            },
          },
          channelId: "channel-1",
          name: "Wizytówki premium",
          seo: {
            slug: "wizytowki-premium",
          },
          spec: {
            images: ["front.jpg"],
          },
        },
      ]);

      await expect(
        searchStorefrontProducts({
          channelId: "channel-1",
          firestore: {} as never,
          query: "",
          tenantContext: dedicatedTenantContext,
        }),
      ).resolves.toEqual([
        {
          channelId: "channel-1",
          id: "product-1",
          images: ["front.jpg"],
          name: "Wizytówki premium",
          slug: "wizytowki-premium",
        },
      ]);
    } finally {
      process.env.MEILISEARCH_HOST = previousMeilisearchHost;
    }
  });
});

describe("searchDocumentMatchesQuery", () => {
  it("matches product names without requiring Firestore full-text pipeline hits", () => {
    expect(
      searchDocumentMatchesQuery(
        {
          active: true,
          availability: {
            availableForPurchase: true,
            published: true,
          },
          name: "Wizytówki premium",
          seo: {
            slug: "wizytowki-premium",
          },
        },
        "wizytowki",
      ),
    ).toBe(true);
  });

  it("matches category, SEO, and keyword text", () => {
    expect(
      searchDocumentMatchesQuery(
        {
          category: {
            id: "category-1",
            name: "Materiały reklamowe",
          },
          keywords: ["poster", "festival"],
          name: "Plakat A2",
          seo: {
            description: "Druk plakatów promocyjnych",
            slug: "plakat-a2",
            title: "Plakaty A2",
          },
        },
        "promocyjnych",
      ),
    ).toBe(true);
  });
});
