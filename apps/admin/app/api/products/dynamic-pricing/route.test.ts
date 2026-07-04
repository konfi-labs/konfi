import type { Product } from "@konfi/types";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const adminDocs = new Map<string, unknown>();

  return {
    adminDocs,
    mockGetFirebaseAdminApp: vi.fn(() => ({ name: "admin-app" })),
    mockGetFirestore: vi.fn(() => ({
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
    mockIsSameOriginRequest: vi.fn(),
    mockVerifySessionCookie: vi.fn(),
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetFirestore,
  getFirebaseAdminApp: mocks.mockGetFirebaseAdminApp,
  verifySessionCookie: mocks.mockVerifySessionCookie,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mocks.mockGetFirestore,
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

describe("admin /api/products/dynamic-pricing POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    mocks.adminDocs.clear();
    vi.clearAllMocks();
    mocks.mockIsSameOriginRequest.mockReturnValue(true);
    mocks.mockVerifySessionCookie.mockResolvedValue(null);

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

  it("returns built prices for purchasable products", async () => {
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
    expect(mocks.mockGetFirestore).toHaveBeenCalled();
  });

  it("returns empty prices for unpublished products without an admin session", async () => {
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
    expect(mocks.mockVerifySessionCookie).not.toHaveBeenCalled();
  });

  it("skips session cookie verification when the cookie is missing", async () => {
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
    expect(mocks.mockVerifySessionCookie).not.toHaveBeenCalled();
  });

  it("allows unpublished products when the admin session cookie is valid", async () => {
    mocks.mockVerifySessionCookie.mockResolvedValue({
      admin: true,
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
          cookie: "__session=valid-session",
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
    expect(mocks.mockVerifySessionCookie).toHaveBeenCalledWith("valid-session");
  });

  it("falls back to the dynamic pricing subcollection when the product document is trimmed", async () => {
    seedAdminDoc(
      "/channels/channel-1/products/product-1",
      createProduct({
        dynamicPricing: undefined,
      }),
    );
    seedAdminDoc(
      "/channels/channel-1/products/product-1/dynamicPricing/config",
      {
        attributeRules: [],
        baseDeliveryTime: 2,
        basePrice: 1200,
        enabled: true,
        globalRules: [],
        linkedPresetIds: [],
      },
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
    await expect(response.json()).resolves.toEqual({
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "default",
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
});
