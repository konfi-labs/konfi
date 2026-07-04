import type { Product } from "@konfi/types";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const adminDocs = new Map<string, unknown>();

  return {
    adminDocs,
    mockGetAdminDb: vi.fn(() => ({
      doc: (path: string) => ({
        get: async () => {
          const data = adminDocs.get(path);

          return {
            data: () => data,
            exists: data !== undefined,
          };
        },
      }),
    })),
    mockGetStoreRuntimeConfigForRequest: vi.fn(),
    mockIsSameOriginRequest: vi.fn(),
    mockVerifyAdminProductPreviewSession: vi.fn(),
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
  getStoreRuntimeConfigForRequest: mocks.mockGetStoreRuntimeConfigForRequest,
}));

vi.mock("@/lib/product-preview.server", () => ({
  ADMIN_PRODUCT_PREVIEW_COOKIE: "__konfi_admin_product_preview",
  isAdminProductPreviewAllowed: vi.fn((headers: Pick<Headers, "get">) =>
    Boolean(
      mocks.mockVerifyAdminProductPreviewSession(
        headers.get("cookie")?.includes("__konfi_admin_product_preview=")
          ? "valid-preview-session"
          : undefined,
      ),
    ),
  ),
  verifyAdminProductPreviewSession: mocks.mockVerifyAdminProductPreviewSession,
}));

vi.mock("@konfi/utils", async () => {
  const actual =
    await vi.importActual<typeof import("@konfi/utils")>("@konfi/utils");

  return {
    ...actual,
    isSameOriginRequest: mocks.mockIsSameOriginRequest,
  };
});

let POST: (typeof import("./route"))["POST"];

function createTimestamp(date: Date) {
  return {
    toDate: () => date,
  };
}

function createProduct(overrides?: Partial<Product>): Product {
  return {
    active: true,
    attributes: ["attribute-1"],
    attributeDependencies: {},
    attributeOptions: {},
    availability: {
      availableForPurchase: true,
      published: true,
      publication: createTimestamp(new Date(Date.now() - 60_000)),
    },
    customSize: false,
    defaultPrice: {
      currency: "PLN",
    },
    dynamicPricing: {
      attributeRules: [],
      baseDeliveryTime: 2,
      basePrice: 1200,
      enabled: true,
      globalRules: [],
      linkedPresetIds: ["preset-1"],
    },
    id: "product-1",
    priceType: "DYNAMIC",
    spec: {
      defaultOrder: 10,
      maximumOrder: 100,
      minimumOrder: 10,
    },
    volumes: [{ value: 10 }],
    ...overrides,
  } as Product;
}

function seedAdminDoc(path: string, data: unknown) {
  mocks.adminDocs.set(path, data);
}

function createRequest(body: BodyInit, headers?: HeadersInit) {
  return new NextRequest("http://localhost/api/products/dynamic-pricing", {
    body,
    headers,
    method: "POST",
  });
}

describe("/api/products/dynamic-pricing POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    mocks.adminDocs.clear();
    vi.clearAllMocks();
    mocks.mockIsSameOriginRequest.mockReturnValue(true);
    mocks.mockGetStoreRuntimeConfigForRequest.mockResolvedValue({
      channelId: "channel-1",
    });
    mocks.mockVerifyAdminProductPreviewSession.mockReturnValue(null);

    seedAdminDoc("/channels/channel-1/products/product-1", createProduct());
    seedAdminDoc("/channels/channel-1/dynamicPricingPresets/preset-1", {
      id: "preset-1",
    });
    seedAdminDoc("/attributes/attribute-1", {
      id: "attribute-1",
      options: [],
    });
  });

  it("returns 403 for non same-origin requests", async () => {
    mocks.mockIsSameOriginRequest.mockReturnValue(false);

    const response = await POST(
      createRequest(
        JSON.stringify({ channelId: "channel-1", productId: "product-1" }),
        {
          "content-type": "application/json",
        },
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns 400 for oversized bodies", async () => {
    const response = await POST(
      createRequest("{}", {
        "content-length": "70000",
        "content-type": "application/json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body too large",
    });
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      createRequest("{", {
        "content-type": "application/json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
  });

  it("returns 400 for invalid body shapes, including blocked object keys", async () => {
    const response = await POST(
      createRequest(
        '{"channelId":"channel-1","productId":"product-1","selectedAttributeOptions":{"__proto__":"polluted"}}',
        {
          "content-type": "application/json",
        },
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request body",
    });
  });

  it("returns 400 when product pricing context is missing", async () => {
    const response = await POST(
      createRequest(JSON.stringify({ channelId: "channel-1" }), {
        "content-type": "application/json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing product pricing context",
    });
  });

  it("rejects public requests for a foreign runtime channel", async () => {
    seedAdminDoc("/channels/channel-2/products/product-1", createProduct());

    const response = await POST(
      createRequest(
        JSON.stringify({
          channelId: "channel-2",
          productId: "product-1",
        }),
        {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden",
    });
    expect(mocks.mockGetAdminDb).not.toHaveBeenCalled();
  });

  it("preserves signed admin-preview access to explicit preview channels", async () => {
    mocks.mockVerifyAdminProductPreviewSession.mockReturnValue({
      exp: 1_800_000_000,
      uid: "admin-user",
    });
    seedAdminDoc("/channels/channel-2/products/product-1", createProduct());

    const response = await POST(
      createRequest(
        JSON.stringify({
          calculatedCombination: "front",
          channelId: "channel-2",
          productId: "product-1",
        }),
        {
          cookie: "__konfi_admin_product_preview=valid-preview-session",
          "content-type": "application/json",
          origin: "http://localhost",
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      prices: [
        {
          value: 1200,
        },
      ],
    });
  });

  it("returns 400 when the product does not exist", async () => {
    mocks.adminDocs.delete("/channels/channel-1/products/product-1");

    const response = await POST(
      createRequest(
        JSON.stringify({
          channelId: "channel-1",
          productId: "product-1",
        }),
        {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Product not found",
    });
  });

  it("returns empty prices for unpublished products on public requests", async () => {
    seedAdminDoc(
      "/channels/channel-1/products/product-1",
      createProduct({
        availability: {
          availableForPurchase: true,
          published: false,
          publication: createTimestamp(new Date(Date.now() - 60_000)),
        },
      }),
    );

    const response = await POST(
      createRequest(
        JSON.stringify({
          calculatedCombination: "front",
          channelId: "channel-1",
          productId: "product-1",
        }),
        {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ prices: [] });
  });

  it("returns empty prices when dynamic pricing is disabled", async () => {
    seedAdminDoc(
      "/channels/channel-1/products/product-1",
      createProduct({
        dynamicPricing: {
          attributeRules: [],
          basePrice: 0,
          enabled: false,
          globalRules: [],
          linkedPresetIds: [],
        },
      }),
    );

    const response = await POST(
      createRequest(
        JSON.stringify({
          channelId: "channel-1",
          productId: "product-1",
        }),
        {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ prices: [] });
  });

  it("allows admin-preview requests to resolve unpublished product prices even without the adminPreview body flag", async () => {
    mocks.mockVerifyAdminProductPreviewSession.mockReturnValue({
      exp: 1_800_000_000,
      uid: "admin-user",
    });
    seedAdminDoc(
      "/channels/channel-1/products/product-1",
      createProduct({
        availability: {
          availableForPurchase: false,
          published: false,
          publication: createTimestamp(new Date(Date.now() + 60_000)),
        },
      }),
    );

    const response = await POST(
      createRequest(
        JSON.stringify({
          calculatedCombination: "front",
          channelId: "channel-1",
          productId: "product-1",
        }),
        {
          cookie: "__konfi_admin_product_preview=valid-preview-session",
          "content-type": "application/json",
          origin: "http://localhost",
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "front",
          },
          currency: "PLN",
          value: 1200,
          volume: {
            deliveryTime: 2,
            value: 10,
          },
        },
      ],
    });
  });

  it("returns built prices for live purchasable products using admin-backed reads", async () => {
    const response = await POST(
      createRequest(
        JSON.stringify({
          calculatedCombination: "front",
          channelId: "channel-1",
          productId: "product-1",
          selectedAttributeOptions: {
            format: "a4",
          },
        }),
        {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "front",
          },
          currency: "PLN",
          value: 1200,
          volume: {
            deliveryTime: 2,
            value: 10,
          },
        },
      ],
    });
    expect(mocks.mockGetAdminDb).toHaveBeenCalled();
  });
});
