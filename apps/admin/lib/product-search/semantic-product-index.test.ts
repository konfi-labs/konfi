import type { Attribute, Product } from "@konfi/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProductSearchAttributeCache,
  PRODUCT_SEARCH_EMBEDDING_DIMENSION,
  syncProductSemanticSearchIndexForProductWrite,
} from "./semantic-product-index";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const { generateKeyPairSync } =
    require("node:crypto") as typeof import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    getFirestore: vi.fn(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getFirestore,
  getFirebaseAdminApp: vi.fn(() => ({})),
}));

vi.mock("@/lib/ai/server-vertex-config", () => ({
  getVertexConfig: vi.fn(() => ({
    project: "demo-project",
    location: "global",
    clientEmail: "admin@example.com",
    privateKey: mocks.privateKey,
  })),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mocks.getFirestore,
  FieldValue: {
    serverTimestamp: () => "server-timestamp",
    vector: (embedding: number[]) => ({ vector: embedding }),
  },
}));

interface StoredDocument {
  exists: boolean;
  data?: Record<string, unknown>;
}

interface WriteOperation {
  type: "set" | "delete";
  path: string;
  id: string;
  data?: Record<string, unknown>;
}

function createProduct(overrides: Partial<Product> = {}): Product {
  const product = {
    id: "product-a",
    channelId: "source-channel",
    name: "Business cards",
    description: "Premium cards on thick paper",
    active: true,
    availability: {
      availableForPurchase: true,
      published: true,
      publication: { toDate: () => new Date("2024-01-01T00:00:00.000Z") },
      expiration: null,
    },
    attributes: ["paper"],
    attributeOptions: {
      paper: ["matte"],
    },
    category: {
      id: "print",
      name: "Print",
    },
    productType: {
      id: "cards",
      name: "Cards",
    },
    seo: {
      slug: "business-cards",
      title: "Business card printing",
      description: "Order premium business cards",
    },
    keywords: ["wizytowki"],
    linkedChannels: [],
  } as Product;

  return {
    ...product,
    ...overrides,
    availability: {
      ...product.availability,
      ...overrides.availability,
    },
  };
}

function createAttribute(): Attribute {
  return {
    id: "paper",
    name: "Paper",
    keywords: ["stock"],
    options: [
      {
        label: "Matte",
        value: "matte",
      },
    ],
  } as Attribute;
}

function createEmbedding(): number[] {
  return Array.from(
    { length: PRODUCT_SEARCH_EMBEDDING_DIMENSION },
    (_, index) => index / PRODUCT_SEARCH_EMBEDDING_DIMENSION,
  );
}

function createResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: async () => JSON.stringify(body),
  } as Response;
}

function createFirestore({
  products = new Map<string, Product>(),
  existingDocuments = new Map<string, StoredDocument>(),
  attributes = [createAttribute()],
}: {
  products?: Map<string, Product>;
  existingDocuments?: Map<string, StoredDocument>;
  attributes?: Attribute[];
} = {}) {
  const operations: WriteOperation[] = [];
  let attributeCollectionReads = 0;
  const firestore = {
    collection: (path: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (path.endsWith("/products")) {
            const product = products.get(`${path}/${id}`);
            return {
              id,
              exists: Boolean(product),
              data: () => product,
            };
          }

          const stored = existingDocuments.get(`${path}/${id}`);
          return {
            id,
            exists: stored?.exists ?? false,
            data: () => stored?.data,
          };
        },
        set: async (data: Record<string, unknown>) => {
          operations.push({ type: "set", path, id, data });
        },
        delete: async () => {
          operations.push({ type: "delete", path, id });
        },
      }),
      get: async () => {
        if (path !== "attributes") {
          return { docs: [] };
        }

        attributeCollectionReads += 1;
        return {
          docs: attributes.map((attribute) => ({
            id: attribute.id,
            data: () => attribute,
          })),
        };
      },
    }),
  };

  return {
    firestore,
    operations,
    getAttributeCollectionReads: () => attributeCollectionReads,
  };
}

describe("syncProductSemanticSearchIndexForProductWrite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearProductSearchAttributeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com")) {
          return createResponse({ access_token: "token", expires_in: 3600 });
        }

        return createResponse({ embedding: { values: createEmbedding() } });
      }),
    );
  });

  it("indexes a product when it is created", async () => {
    const product = createProduct();
    const { firestore, operations } = createFirestore({
      products: new Map([
        ["channels/source-channel/products/product-a", product],
      ]),
    });
    mocks.getFirestore.mockReturnValue(firestore);

    const result = await syncProductSemanticSearchIndexForProductWrite({
      channelId: "source-channel",
      productId: product.id,
    });

    expect(result.indexed).toBe(1);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      type: "set",
      path: "channels/source-channel/productsIndex",
      id: "source-channel__product-a",
    });
    expect(operations[0].data).toMatchObject({
      productId: "product-a",
      channelId: "source-channel",
      sourceChannelId: "source-channel",
      productPath: "channels/source-channel/products/product-a",
      name: "Business cards",
      embeddingDimension: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
    });
  });

  it("re-indexes a product when searchable product content changes", async () => {
    const product = createProduct({ name: "Updated business cards" });
    const { firestore, operations } = createFirestore({
      products: new Map([
        ["channels/source-channel/products/product-a", product],
      ]),
      existingDocuments: new Map([
        [
          "channels/source-channel/productsIndex/source-channel__product-a",
          {
            exists: true,
            data: {
              searchTextHash: "old-hash",
              embeddingModel: "gemini-embedding-2",
              embeddingDimension: PRODUCT_SEARCH_EMBEDDING_DIMENSION,
            },
          },
        ],
      ]),
    });
    mocks.getFirestore.mockReturnValue(firestore);

    const result = await syncProductSemanticSearchIndexForProductWrite({
      channelId: "source-channel",
      productId: product.id,
    });

    expect(result.indexed).toBe(1);
    expect(operations[0]).toMatchObject({
      type: "set",
      path: "channels/source-channel/productsIndex",
      id: "source-channel__product-a",
    });
    expect(operations[0].data).toMatchObject({
      name: "Updated business cards",
    });
  });

  it("indexes linked-channel product entries", async () => {
    const product = createProduct({ linkedChannels: ["linked-channel"] });
    const { firestore, operations } = createFirestore({
      products: new Map([
        ["channels/source-channel/products/product-a", product],
      ]),
    });
    mocks.getFirestore.mockReturnValue(firestore);

    const result = await syncProductSemanticSearchIndexForProductWrite({
      channelId: "source-channel",
      productId: product.id,
    });

    expect(result.indexed).toBe(2);
    expect(operations.map((operation) => operation.path)).toEqual([
      "channels/source-channel/productsIndex",
      "channels/linked-channel/productsIndex",
    ]);
  });

  it("trims affected linked channel IDs before writing index paths", async () => {
    const product = createProduct({ linkedChannels: [" linked-channel "] });
    const { firestore, operations } = createFirestore({
      products: new Map([
        ["channels/source-channel/products/product-a", product],
      ]),
    });
    mocks.getFirestore.mockReturnValue(firestore);

    const result = await syncProductSemanticSearchIndexForProductWrite({
      channelId: " source-channel ",
      productId: product.id,
    });

    expect(result.indexed).toBe(2);
    expect(operations.map((operation) => operation.path)).toEqual([
      "channels/source-channel/productsIndex",
      "channels/linked-channel/productsIndex",
    ]);
  });

  it("reuses a short-lived attribute cache across product syncs", async () => {
    const productA = createProduct();
    const productB = createProduct({
      id: "product-b",
      name: "Flyers",
    });
    const { firestore, getAttributeCollectionReads } = createFirestore({
      products: new Map([
        ["channels/source-channel/products/product-a", productA],
        ["channels/source-channel/products/product-b", productB],
      ]),
    });
    mocks.getFirestore.mockReturnValue(firestore);

    await syncProductSemanticSearchIndexForProductWrite({
      channelId: "source-channel",
      productId: productA.id,
    });
    await syncProductSemanticSearchIndexForProductWrite({
      channelId: "source-channel",
      productId: productB.id,
    });

    expect(getAttributeCollectionReads()).toBe(1);
  });

  it("removes product index documents when a product is deleted", async () => {
    const { firestore, operations } = createFirestore();
    mocks.getFirestore.mockReturnValue(firestore);

    const result = await syncProductSemanticSearchIndexForProductWrite({
      channelId: "source-channel",
      productId: "product-a",
      previousLinkedChannelIds: ["linked-channel"],
    });

    expect(result.deleted).toBe(2);
    expect(operations).toEqual([
      {
        type: "delete",
        path: "channels/source-channel/productsIndex",
        id: "source-channel__product-a",
      },
      {
        type: "delete",
        path: "channels/linked-channel/productsIndex",
        id: "source-channel__product-a",
      },
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports product and channel context when embedding dimensions are invalid", async () => {
    const product = createProduct();
    const { firestore } = createFirestore({
      products: new Map([
        ["channels/source-channel/products/product-a", product],
      ]),
    });
    mocks.getFirestore.mockReturnValue(firestore);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com")) {
          return createResponse({ access_token: "token", expires_in: 3600 });
        }

        return createResponse({ embedding: { values: [1, 2, 3] } });
      }),
    );

    await expect(
      syncProductSemanticSearchIndexForProductWrite({
        channelId: "source-channel",
        productId: product.id,
      }),
    ).rejects.toThrow(
      `Expected ${PRODUCT_SEARCH_EMBEDDING_DIMENSION} dimensions but got 3 for product "Business cards" (product-a) in channel source-channel`,
    );
  });
});
