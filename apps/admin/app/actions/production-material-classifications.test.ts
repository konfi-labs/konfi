import {
  PriceTypeEnum,
  productionGroupingClassificationVersion,
  type ProductionGroupingClassification,
  type ProductionGroupingProfile,
} from "@konfi/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProductionGroupingCacheKey,
  getProductionGroupingInputHash,
  getProductionGroupingItemRef,
  getProductionGroupingProfileHash,
  getProductionGroupingSignatureHash,
  type ProductionGroupingClassificationItem,
} from "@/lib/orders/production-materials";

vi.mock("server-only", () => ({}));

interface MockDocRef {
  path: string;
}

const actionMocks = vi.hoisted(() => ({
  batchCommit: vi.fn(),
  batchSet: vi.fn(),
  doc: vi.fn(),
  generateText: vi.fn(),
  getAdminDb: vi.fn(),
  getAll: vi.fn(),
  getAuthenticatedAdminUid: vi.fn(),
  getTenantContextForRequest: vi.fn(),
  getVertexClient: vi.fn(),
  getVertexThinkingProviderOptions: vi.fn(),
  requireTenantAdminChannelAccess: vi.fn(),
  runMeteredAiText: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  getAuthenticatedAdminUid: actionMocks.getAuthenticatedAdminUid,
  requireTenantAdminChannelAccess: actionMocks.requireTenantAdminChannelAccess,
}));

vi.mock("@/lib/ai/ai-instruction-settings.server", () => ({
  loadAdminAiInstructionSettings: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/ai/server-vertex", () => ({
  getVertexClient: actionMocks.getVertexClient,
  getVertexThinkingProviderOptions:
    actionMocks.getVertexThinkingProviderOptions,
}));

vi.mock("@/lib/ai/usage-metering", () => ({
  estimateAiUsageTextTokens: vi.fn(() => 1),
  runMeteredAiText: actionMocks.runMeteredAiText,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: actionMocks.getAdminDb,
  getTenantContextForRequest: actionMocks.getTenantContextForRequest,
}));

vi.mock("@konfi/firebase", () => ({
  MODELS: {
    GEMINI_3_FLASH: "gemini-3-flash",
    GEMINI_3_FLASH_LITE: "gemini-3-flash-lite",
  },
  tenantFirestorePaths: {
    channelDocument: (
      _tenantContext: unknown,
      channelId: string,
      collectionId: string,
      documentId: string,
    ) => `channels/${channelId}/${collectionId}/${documentId}`,
    orderDoc: (_tenantContext: unknown, channelId: string, orderId: string) =>
      `channels/${channelId}/orders/${orderId}`,
    settingsDoc: (
      _tenantContext: unknown,
      channelId: string,
      settingsId: string,
    ) => `channels/${channelId}/settings/${settingsId}`,
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: actionMocks.serverTimestamp,
  },
}));

vi.mock("ai", () => {
  class MockNoObjectGeneratedError extends Error {
    static isInstance(value: unknown): value is MockNoObjectGeneratedError {
      return value instanceof MockNoObjectGeneratedError;
    }
  }

  return {
    generateText: actionMocks.generateText,
    NoObjectGeneratedError: MockNoObjectGeneratedError,
    Output: {
      object: vi.fn((value: unknown) => value),
    },
  };
});

const tenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
};

const profile: ProductionGroupingProfile = {
  id: "default",
  label: "Production grouping",
  primaryAxis: {
    aliases: ["material"],
    allowAiSuggestedValues: true,
    id: "material",
    label: "Material",
  },
  secondaryAxis: {
    aliases: ["finish"],
    allowedValues: [
      {
        aliases: ["mat", "matte"],
        key: "matte",
        label: "Matte",
      },
      {
        aliases: ["gloss", "glossy"],
        key: "gloss",
        label: "Gloss",
      },
    ],
    allowAiSuggestedValues: true,
    id: "finish",
    label: "Finish",
  },
};

function createSnapshot(data?: Record<string, unknown>) {
  return {
    data: () => data,
    exists: data !== undefined,
  };
}

function groupingItem(
  overrides: Partial<ProductionGroupingClassificationItem> = {},
): ProductionGroupingClassificationItem {
  return {
    calculatedCombination: null,
    combination: null,
    customFormat: false,
    customPrice: null,
    description: "",
    id: "item-1",
    name: "Custom sign",
    product: {
      id: "product-1",
      name: "Custom product",
      priceType: PriceTypeEnum.SINGLE,
    },
    unit: "PCS",
    ...overrides,
  };
}

function itemCachePath(orderId: string, itemId: string) {
  return `channels/channel-a/orders/${orderId}/productionGroupingClassifications/${itemId}`;
}

function globalCachePath(signatureHash: string) {
  return `channels/channel-a/productionGroupingClassificationCache/${profile.id}_${signatureHash}`;
}

function classificationDoc(
  item: ProductionGroupingClassificationItem,
  overrides: Partial<ProductionGroupingClassification> = {},
): ProductionGroupingClassification {
  return {
    classificationVersion: productionGroupingClassificationVersion,
    confidence: 0.92,
    inputHash: getProductionGroupingInputHash(item),
    itemId: item.id,
    primary: {
      axisId: "material",
      groupKey: "material:pvc",
      key: "pvc",
      label: "PVC",
    },
    profileHash: getProductionGroupingProfileHash(profile),
    profileId: profile.id,
    signatureHash: getProductionGroupingSignatureHash(item, profile),
    source: "ai",
    ...overrides,
  };
}

function seedSnapshots(snapshotsByPath: Map<string, Record<string, unknown>>) {
  actionMocks.doc.mockImplementation((path: string) => ({ path }));
  actionMocks.getAll.mockImplementation((...refs: MockDocRef[]) =>
    Promise.resolve(
      refs.map((ref) => createSnapshot(snapshotsByPath.get(ref.path))),
    ),
  );
  actionMocks.getAdminDb.mockReturnValue({
    batch: () => ({
      commit: actionMocks.batchCommit,
      set: actionMocks.batchSet,
    }),
    doc: actionMocks.doc,
    getAll: actionMocks.getAll,
  });
}

describe("production grouping classification actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.getAuthenticatedAdminUid.mockResolvedValue("admin-1");
    actionMocks.getTenantContextForRequest.mockResolvedValue(tenantContext);
    actionMocks.getVertexClient.mockReturnValue(() => "mock-model");
    actionMocks.getVertexThinkingProviderOptions.mockReturnValue({});
    actionMocks.requireTenantAdminChannelAccess.mockImplementation(
      async (channelId: string) => channelId,
    );
    actionMocks.runMeteredAiText.mockImplementation(
      async (params: { run: () => Promise<unknown> }) => params.run(),
    );
    actionMocks.serverTimestamp.mockReturnValue("server-timestamp");
    actionMocks.batchCommit.mockResolvedValue(undefined);
    seedSnapshots(new Map());
  });

  it("returns fresh item cache hits without calling AI or writing", async () => {
    const item = groupingItem();
    seedSnapshots(
      new Map([
        [
          itemCachePath("order-1", "item-1"),
          {
            ...classificationDoc(item),
            createdAt: {
              _nanoseconds: 1,
              _seconds: 1,
            },
            orderId: "order-1",
            tenantId: "tenant-a",
            updatedAt: {
              _nanoseconds: 2,
              _seconds: 2,
            },
          },
        ],
      ]),
    );

    const { classifyAndPersistProductionGroupingsAdmin } =
      await import("./production-grouping-classifications");
    const result = await classifyAndPersistProductionGroupingsAdmin({
      channelId: "channel-a",
      items: [item],
      orderId: "order-1",
      profile,
    });

    expect(
      result[getProductionGroupingCacheKey("order-1", "item-1")],
    ).toMatchObject({
      primary: {
        label: "PVC",
      },
      source: "ai",
    });
    expect(
      result[getProductionGroupingCacheKey("order-1", "item-1")],
    ).not.toHaveProperty("createdAt");
    expect(
      result[getProductionGroupingCacheKey("order-1", "item-1")],
    ).not.toHaveProperty("updatedAt");
    expect(actionMocks.generateText).not.toHaveBeenCalled();
    expect(actionMocks.batchSet).not.toHaveBeenCalled();
  });

  it("returns item cache reads without Firestore timestamp objects", async () => {
    const item = groupingItem();
    seedSnapshots(
      new Map([
        [
          itemCachePath("order-1", "item-1"),
          {
            ...classificationDoc(item, {
              confidence: 1,
              source: "deterministic",
            }),
            createdAt: {
              _nanoseconds: 1,
              _seconds: 1,
            },
            orderId: "order-1",
            tenantId: "tenant-a",
            updatedAt: {
              _nanoseconds: 2,
              _seconds: 2,
            },
          },
        ],
      ]),
    );

    const { getProductionGroupingClassificationsAdmin } =
      await import("./production-grouping-classifications");
    const result = await getProductionGroupingClassificationsAdmin({
      channelId: "channel-a",
      itemRefs: [getProductionGroupingItemRef("order-1", item, profile)],
      profile,
    });
    const classification =
      result[getProductionGroupingCacheKey("order-1", "item-1")];

    expect(classification).toMatchObject({
      orderId: "order-1",
      primary: {
        label: "PVC",
      },
      source: "deterministic",
      tenantId: "tenant-a",
    });
    expect(classification).not.toHaveProperty("createdAt");
    expect(classification).not.toHaveProperty("updatedAt");
    expect(actionMocks.requireTenantAdminChannelAccess).toHaveBeenCalledWith(
      "channel-a",
    );
  });

  it("does not read cache entries when channel access is denied", async () => {
    const item = groupingItem();
    actionMocks.requireTenantAdminChannelAccess.mockRejectedValue(
      new Error("Tenant channel access is required"),
    );

    const { getProductionGroupingClassificationsAdmin } =
      await import("./production-grouping-classifications");

    await expect(
      getProductionGroupingClassificationsAdmin({
        channelId: "channel-a",
        itemRefs: [getProductionGroupingItemRef("order-1", item, profile)],
        profile,
      }),
    ).rejects.toThrow("Tenant channel access is required");

    expect(actionMocks.getAll).not.toHaveBeenCalled();
  });

  it("uses global signature cache hits and writes item projections without AI", async () => {
    const item = groupingItem();
    const signatureHash = getProductionGroupingSignatureHash(item, profile);
    seedSnapshots(
      new Map([
        [
          globalCachePath(signatureHash),
          {
            ...classificationDoc(item),
            createdAt: {
              _nanoseconds: 715000000,
              _seconds: 1,
            },
            tenantId: "tenant-a",
            updatedAt: {
              _nanoseconds: 715000000,
              _seconds: 2,
            },
          },
        ],
      ]),
    );

    const { classifyAndPersistProductionGroupingsAdmin } =
      await import("./production-grouping-classifications");
    const result = await classifyAndPersistProductionGroupingsAdmin({
      channelId: "channel-a",
      items: [item],
      orderId: "order-1",
      profile,
    });

    expect(actionMocks.generateText).not.toHaveBeenCalled();
    expect(
      result[getProductionGroupingCacheKey("order-1", "item-1")],
    ).toMatchObject({
      orderId: "order-1",
      primary: {
        label: "PVC",
      },
      source: "ai",
      tenantId: "tenant-a",
    });
    expect(
      result[getProductionGroupingCacheKey("order-1", "item-1")],
    ).not.toHaveProperty("createdAt");
    expect(
      result[getProductionGroupingCacheKey("order-1", "item-1")],
    ).not.toHaveProperty("updatedAt");
    expect(actionMocks.batchSet).toHaveBeenCalledWith(
      {
        path: itemCachePath("order-1", "item-1"),
      },
      expect.objectContaining({
        createdAt: "server-timestamp",
        orderId: "order-1",
        primary: expect.objectContaining({
          label: "PVC",
        }),
        tenantId: "tenant-a",
        updatedAt: "server-timestamp",
      }),
      { merge: true },
    );
  });

  it("dedupes AI calls by signature and writes global plus item caches", async () => {
    const first = groupingItem({
      id: "item-1",
    });
    const second = groupingItem({
      id: "item-2",
    });
    actionMocks.generateText.mockResolvedValue({
      output: {
        classifications: [
          {
            confidence: 0.93,
            itemId: getProductionGroupingSignatureHash(first, profile),
            primaryLabel: "PVC",
            reasoning: "Custom sign material is PVC.",
            secondaryLabel: "Matte",
          },
          {
            confidence: 0.99,
            itemId: "unknown-item",
            primaryLabel: "Paper",
          },
        ],
      },
    });

    const { classifyAndPersistProductionGroupingsAdmin } =
      await import("./production-grouping-classifications");
    const result = await classifyAndPersistProductionGroupingsAdmin({
      channelId: "channel-a",
      items: [first, second],
      orderId: "order-1",
      profile,
    });

    expect(actionMocks.generateText).toHaveBeenCalledTimes(1);
    expect(
      result[getProductionGroupingCacheKey("order-1", "item-1")],
    ).toMatchObject({
      primary: {
        label: "PVC",
      },
      secondary: {
        label: "Matte",
      },
      source: "ai",
    });
    expect(
      result[getProductionGroupingCacheKey("order-1", "item-2")],
    ).toMatchObject({
      primary: {
        label: "PVC",
      },
      source: "ai",
    });
    expect(actionMocks.batchSet).toHaveBeenCalledWith(
      {
        path: globalCachePath(
          getProductionGroupingSignatureHash(first, profile),
        ),
      },
      expect.objectContaining({
        primary: expect.objectContaining({
          label: "PVC",
        }),
        tenantId: "tenant-a",
      }),
      { merge: true },
    );
  });

  it("dedupes batched visible items by signature across orders", async () => {
    const first = groupingItem({
      id: "item-1",
    });
    const second = groupingItem({
      id: "item-2",
    });
    actionMocks.generateText.mockResolvedValue({
      output: {
        classifications: [
          {
            confidence: 0.93,
            itemId: getProductionGroupingSignatureHash(first, profile),
            primaryLabel: "PVC",
            reasoning: "Shared custom sign signature is PVC.",
            secondaryLabel: "Matte",
          },
        ],
      },
    });

    const { classifyAndPersistProductionGroupingsBatchAdmin } =
      await import("./production-grouping-classifications");
    const result = await classifyAndPersistProductionGroupingsBatchAdmin({
      channelId: "channel-a",
      orders: [
        {
          items: [first],
          orderId: "order-1",
        },
        {
          items: [second],
          orderId: "order-2",
        },
      ],
      profile,
    });

    expect(actionMocks.generateText).toHaveBeenCalledTimes(1);
    expect(
      result[getProductionGroupingCacheKey("order-1", "item-1")],
    ).toMatchObject({
      orderId: "order-1",
      primary: {
        label: "PVC",
      },
      source: "ai",
    });
    expect(
      result[getProductionGroupingCacheKey("order-2", "item-2")],
    ).toMatchObject({
      orderId: "order-2",
      primary: {
        label: "PVC",
      },
      source: "ai",
    });
    expect(actionMocks.batchSet).toHaveBeenCalledWith(
      {
        path: itemCachePath("order-1", "item-1"),
      },
      expect.objectContaining({
        orderId: "order-1",
        primary: expect.objectContaining({
          label: "PVC",
        }),
      }),
      { merge: true },
    );
    expect(actionMocks.batchSet).toHaveBeenCalledWith(
      {
        path: itemCachePath("order-2", "item-2"),
      },
      expect.objectContaining({
        orderId: "order-2",
        primary: expect.objectContaining({
          label: "PVC",
        }),
      }),
      { merge: true },
    );
    expect(actionMocks.batchSet).toHaveBeenCalledWith(
      {
        path: globalCachePath(
          getProductionGroupingSignatureHash(first, profile),
        ),
      },
      expect.objectContaining({
        primary: expect.objectContaining({
          label: "PVC",
        }),
        tenantId: "tenant-a",
      }),
      { merge: true },
    );
  });

  it("passes cached canonical labels to AI for remaining batch items", async () => {
    const cachedItem = groupingItem({
      description: "cached item",
      id: "cached-item",
    });
    const aiItem = groupingItem({
      description: "similar uncached item",
      id: "ai-item",
    });
    const cachedSignatureHash = getProductionGroupingSignatureHash(
      cachedItem,
      profile,
    );
    const aiSignatureHash = getProductionGroupingSignatureHash(aiItem, profile);
    seedSnapshots(
      new Map([
        [
          globalCachePath(cachedSignatureHash),
          {
            ...classificationDoc(cachedItem),
            tenantId: "tenant-a",
          },
        ],
      ]),
    );
    actionMocks.generateText.mockImplementation(
      async (params: { prompt: string }) => {
        const prompt = JSON.parse(params.prompt) as {
          items: Array<{ itemId: string }>;
          knownValues: {
            primary: Array<{ axisId: string; label: string }>;
          };
        };

        expect(prompt.items).toEqual([
          expect.objectContaining({
            itemId: aiSignatureHash,
          }),
        ]);
        expect(prompt.knownValues.primary).toContainEqual({
          axisId: "material",
          label: "PVC",
        });

        return {
          output: {
            classifications: [
              {
                confidence: 0.93,
                itemId: aiSignatureHash,
                primaryLabel: "PVC",
                reasoning: "Reuse the known canonical label.",
              },
            ],
          },
        };
      },
    );

    const { classifyAndPersistProductionGroupingsBatchAdmin } =
      await import("./production-grouping-classifications");
    const result = await classifyAndPersistProductionGroupingsBatchAdmin({
      channelId: "channel-a",
      orders: [
        {
          items: [cachedItem],
          orderId: "order-1",
        },
        {
          items: [aiItem],
          orderId: "order-2",
        },
      ],
      profile,
    });

    expect(actionMocks.generateText).toHaveBeenCalledTimes(1);
    expect(
      result[getProductionGroupingCacheKey("order-2", "ai-item")],
    ).toMatchObject({
      primary: {
        label: "PVC",
      },
      source: "ai",
    });
  });

  it("writes an unclassified fallback when AI fails", async () => {
    const item = groupingItem();
    actionMocks.generateText.mockRejectedValue(new Error("AI unavailable"));

    const { classifyAndPersistProductionGroupingsAdmin } =
      await import("./production-grouping-classifications");
    const result = await classifyAndPersistProductionGroupingsAdmin({
      channelId: "channel-a",
      items: [item],
      orderId: "order-1",
      profile,
    });

    expect(
      result[getProductionGroupingCacheKey("order-1", "item-1")],
    ).toMatchObject({
      primary: {
        groupKey: "__unclassified__",
        label: "Unclassified",
      },
      source: "unclassified",
    });
    expect(actionMocks.batchSet).toHaveBeenCalledWith(
      {
        path: itemCachePath("order-1", "item-1"),
      },
      expect.objectContaining({
        createdAt: "server-timestamp",
        orderId: "order-1",
        primary: expect.objectContaining({
          groupKey: "__unclassified__",
          label: "Unclassified",
        }),
        source: "unclassified",
        tenantId: "tenant-a",
        updatedAt: "server-timestamp",
      }),
      { merge: true },
    );
  });
});
