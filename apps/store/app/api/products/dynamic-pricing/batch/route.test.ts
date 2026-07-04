import type { Product } from "@konfi/types";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const adminDocs = new Map<string, unknown>();
  const getAllCalls: string[][] = [];

  return {
    adminDocs,
    getAllCalls,
    mockGetAdminDb: vi.fn(() => ({
      doc: (path: string) => ({
        path,
      }),
      getAll: async (...refs: Array<{ path: string }>) => {
        getAllCalls.push(refs.map((ref) => ref.path));

        return refs.map((ref) => {
          const data = adminDocs.get(ref.path);

          return {
            data: () => data,
            exists: data !== undefined,
          };
        });
      },
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

function createProduct(id: string): Product {
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
    id,
    priceType: "DYNAMIC",
    spec: {
      defaultOrder: 10,
      maximumOrder: 100,
      minimumOrder: 10,
    },
    volumes: [{ value: 10 }],
  } as Product;
}

function seedAdminDoc(path: string, data: unknown) {
  mocks.adminDocs.set(path, data);
}

function createRequest(body: BodyInit, headers?: HeadersInit) {
  return new NextRequest(
    "http://localhost/api/products/dynamic-pricing/batch",
    {
      body,
      headers,
      method: "POST",
    },
  );
}

describe("/api/products/dynamic-pricing/batch POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    mocks.adminDocs.clear();
    mocks.getAllCalls.length = 0;
    vi.clearAllMocks();
    mocks.mockIsSameOriginRequest.mockReturnValue(true);
    mocks.mockGetStoreRuntimeConfigForRequest.mockResolvedValue({
      channelId: "channel-1",
    });
    mocks.mockVerifyAdminProductPreviewSession.mockReturnValue(null);

    seedAdminDoc(
      "/channels/channel-1/products/product-1",
      createProduct("product-1"),
    );
    seedAdminDoc(
      "/channels/channel-1/products/product-2",
      createProduct("product-2"),
    );
    seedAdminDoc("/channels/channel-1/dynamicPricingPresets/preset-1", {
      id: "preset-1",
    });
    seedAdminDoc("/attributes/attribute-1", {
      id: "attribute-1",
      options: [],
    });
  });

  it("resolves multiple dynamic pricing requests with de-duplicated reads", async () => {
    const response = await POST(
      createRequest(
        JSON.stringify({
          items: [
            {
              calculatedCombination: "front",
              channelId: "channel-1",
              productId: "product-1",
              quantity: 10,
            },
            {
              calculatedCombination: "front",
              channelId: "channel-1",
              productId: "product-2",
              quantity: 20,
            },
          ],
        }),
        {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      results: [
        {
          prices: [
            {
              value: 1200,
            },
          ],
        },
        {
          prices: [
            {
              value: 1200,
            },
          ],
        },
      ],
    });
    expect(mocks.getAllCalls).toEqual([
      [
        "/channels/channel-1/products/product-1",
        "/channels/channel-1/products/product-2",
      ],
      ["/channels/channel-1/dynamicPricingPresets/preset-1"],
      ["/attributes/attribute-1"],
    ]);
  });

  it("rejects batches with too many items", async () => {
    const response = await POST(
      createRequest(
        JSON.stringify({
          items: Array.from({ length: 21 }, () => ({
            channelId: "channel-1",
            productId: "product-1",
          })),
        }),
        {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request body",
    });
    expect(mocks.mockGetAdminDb).not.toHaveBeenCalled();
  });
});
