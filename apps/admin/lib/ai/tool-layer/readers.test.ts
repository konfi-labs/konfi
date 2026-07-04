import { describe, expect, it, vi } from "vitest";
import { createFirestoreToolLayerReaders } from "./readers";
import { searchProductsIndex } from "@konfi/meilisearch";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
  getFirebaseAdminApp: vi.fn(),
}));
vi.mock("@konfi/meilisearch", () => ({
  searchCustomersIndex: vi.fn(),
  searchOrdersIndex: vi.fn(),
  searchProductsIndex: vi.fn(),
}));
vi.mock("firebase-admin/firestore", () => ({
  Firestore: vi.fn(),
  getFirestore: vi.fn(),
}));

describe("Firestore tool-layer readers", () => {
  it("uses the channel document ID over any stored id field", async () => {
    const firestore = {
      collection: vi.fn(() => ({
        get: vi.fn(async () => ({
          docs: [
            {
              data: () => ({
                active: true,
                id: "stored-channel-id",
                name: "Main Store",
              }),
              id: "document-channel-id",
            },
          ],
        })),
      })),
    } as unknown as Parameters<typeof createFirestoreToolLayerReaders>[0];

    const readers = createFirestoreToolLayerReaders(firestore);
    const channels = await readers.listChannels();

    expect(channels[0]?.id).toBe("document-channel-id");
  });

  it("caches active channel reads for the same Firestore instance", async () => {
    const get = vi.fn(async () => ({
      docs: [
        {
          data: () => ({
            active: true,
            name: "Main Store",
          }),
          id: "channel-1",
        },
      ],
    }));
    const firestore = {
      collection: vi.fn(() => ({
        get,
      })),
    } as unknown as Parameters<typeof createFirestoreToolLayerReaders>[0];

    const readers = createFirestoreToolLayerReaders(firestore);

    await readers.listChannels();
    await readers.listChannels();

    expect(get).toHaveBeenCalledOnce();
  });

  it("hydrates linked products with the source channel document ID", async () => {
    const linkedProductDoc = {
      data: () => ({
        active: true,
        id: "product-1",
        linkedChannels: ["store-channel"],
        name: "Linked product",
      }),
      id: "product-doc",
      ref: {
        parent: {
          parent: {
            id: "source-channel",
          },
        },
      },
    };
    const productQuery = {
      get: vi.fn(async () => ({
        docs: [linkedProductDoc],
        empty: false,
      })),
      limit: vi.fn(() => undefined),
      where: vi.fn(() => undefined),
    };
    productQuery.where.mockReturnValue(productQuery);
    productQuery.limit.mockReturnValue(productQuery);
    const firestore = {
      collectionGroup: vi.fn(() => productQuery),
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({
          exists: false,
        })),
      })),
    } as unknown as Parameters<typeof createFirestoreToolLayerReaders>[0];

    const readers = createFirestoreToolLayerReaders(firestore);
    const product = await readers.getProduct({
      channelId: "store-channel",
      productId: "product-1",
    });

    expect(product?.channelId).toBe("source-channel");
  });

  it("lists available direct and linked products for a channel", async () => {
    const directProductDoc = {
      data: () => ({
        active: true,
        availability: {
          availableForPurchase: true,
          published: true,
        },
        id: "direct-product",
        name: "Direct product",
      }),
      id: "direct-product-doc",
      ref: {
        parent: {
          parent: {
            id: "store-channel",
          },
        },
      },
    };
    const linkedProductDoc = {
      data: () => ({
        active: true,
        availability: {
          availableForPurchase: true,
          published: true,
        },
        id: "linked-product",
        linkedChannels: ["store-channel"],
        name: "Linked product",
      }),
      id: "linked-product-doc",
      ref: {
        parent: {
          parent: {
            id: "source-channel",
          },
        },
      },
    };
    const unavailableProductDoc = {
      data: () => ({
        active: true,
        availability: {
          availableForPurchase: false,
          published: true,
        },
        id: "unavailable-product",
        name: "Unavailable product",
      }),
      id: "unavailable-product-doc",
      ref: {
        parent: {
          parent: {
            id: "store-channel",
          },
        },
      },
    };
    const directQuery = {
      get: vi.fn(async () => ({
        docs: [directProductDoc, unavailableProductDoc],
      })),
      limit: vi.fn(() => undefined),
      where: vi.fn(() => undefined),
    };
    directQuery.where.mockReturnValue(directQuery);
    directQuery.limit.mockReturnValue(directQuery);
    const linkedQuery = {
      get: vi.fn(async () => ({
        docs: [linkedProductDoc],
      })),
      limit: vi.fn(() => undefined),
      where: vi.fn(() => undefined),
    };
    linkedQuery.where.mockReturnValue(linkedQuery);
    linkedQuery.limit.mockReturnValue(linkedQuery);
    const firestore = {
      collection: vi.fn(() => directQuery),
      collectionGroup: vi.fn(() => linkedQuery),
    } as unknown as Parameters<typeof createFirestoreToolLayerReaders>[0];

    const readers = createFirestoreToolLayerReaders(firestore);
    const products = await readers.listProducts({
      channelId: "store-channel",
      limit: 10,
      offset: 0,
    });

    expect(products.map((product) => product.id)).toEqual([
      "direct-product",
      "linked-product",
    ]);
    expect(products[1]?.channelId).toBe("source-channel");
  });

  it("keeps product search on the lightweight index path", async () => {
    vi.mocked(searchProductsIndex).mockResolvedValue([
      "product-1",
      "product-2",
      "product-3",
    ]);
    const firestore = {
      collection: vi.fn(),
      collectionGroup: vi.fn(),
    } as unknown as Parameters<typeof createFirestoreToolLayerReaders>[0];

    const readers = createFirestoreToolLayerReaders(firestore);
    const productIds = await readers.searchProducts({
      channelId: "channel-1",
      limit: 2,
      query: "business cards",
    });

    expect(productIds).toEqual(["product-1", "product-2"]);
    expect(searchProductsIndex).toHaveBeenCalledWith(
      "business cards",
      "channel-1",
      undefined,
      undefined,
    );
    expect(firestore.collection).not.toHaveBeenCalled();
    expect(firestore.collectionGroup).not.toHaveBeenCalled();
  });

  it("lists active channel orders ordered newest first", async () => {
    const orderDoc = {
      data: () => ({
        active: true,
        channelId: "channel-1",
        number: 101,
      }),
      id: "order-doc-1",
      ref: {
        parent: {
          parent: {
            id: "channel-1",
          },
        },
      },
    };
    const query = {
      get: vi.fn(async () => ({
        docs: [orderDoc],
      })),
      limit: vi.fn(() => undefined),
      offset: vi.fn(() => undefined),
      orderBy: vi.fn(() => undefined),
      where: vi.fn(() => undefined),
    };
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.offset.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const firestore = {
      collection: vi.fn(() => query),
    } as unknown as Parameters<typeof createFirestoreToolLayerReaders>[0];

    const readers = createFirestoreToolLayerReaders(firestore);
    const orders = await readers.listOrders({
      channelId: "channel-1",
      limit: 1,
      offset: 1,
    });

    expect(firestore.collection).toHaveBeenCalledWith(
      "channels/channel-1/orders",
    );
    expect(query.where).toHaveBeenCalledWith("active", "==", true);
    expect(query.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(query.offset).toHaveBeenCalledWith(1);
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(orders[0]).toMatchObject({
      channelId: "channel-1",
      id: "order-doc-1",
      number: 101,
    });
  });

  it("finds active orders by visible order number with tenant filtering", async () => {
    const orderDoc = {
      data: () => ({
        active: true,
        number: 123,
        tenantId: "tenant-1",
      }),
      id: "order-doc-123",
      ref: {
        parent: {
          parent: {
            id: "channel-1",
          },
        },
      },
    };
    const query = {
      get: vi.fn(async () => ({
        docs: [orderDoc],
        empty: false,
      })),
      limit: vi.fn(() => undefined),
      where: vi.fn(() => undefined),
    };
    query.where.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const firestore = {
      collection: vi.fn(() => query),
    } as unknown as Parameters<typeof createFirestoreToolLayerReaders>[0];

    const readers = createFirestoreToolLayerReaders(firestore, {
      tenantId: "tenant-1",
    });
    const order = await readers.getOrderByNumber({
      channelId: "channel-1",
      orderNumber: 123,
    });

    expect(query.where).toHaveBeenCalledWith("number", "==", 123);
    expect(query.where).toHaveBeenCalledWith("active", "==", true);
    expect(query.where).toHaveBeenCalledWith("tenantId", "==", "tenant-1");
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(order).toMatchObject({
      channelId: "channel-1",
      id: "order-doc-123",
      number: 123,
    });
  });

  it("queries Firestore business records through allowlisted resource paths", async () => {
    const orderDoc = {
      data: () => ({
        active: true,
        number: 123,
        status: "NEW",
      }),
      id: "order-doc-123",
      ref: {
        path: "channels/channel-1/orders/order-doc-123",
      },
    };
    const query = {
      get: vi.fn(async () => ({
        docs: [orderDoc],
      })),
      limit: vi.fn(() => undefined),
      offset: vi.fn(() => undefined),
      orderBy: vi.fn(() => undefined),
      where: vi.fn(() => undefined),
    };
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.offset.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const firestore = {
      collection: vi.fn(() => query),
    } as unknown as Parameters<typeof createFirestoreToolLayerReaders>[0];

    const readers = createFirestoreToolLayerReaders(firestore);
    const result = await readers.queryBusinessRecords({
      channelId: "channel-1",
      limit: 1,
      offset: 2,
      orderBy: [{ direction: "desc", field: "createdAt" }],
      resource: "orders",
      where: [{ field: "number", op: "==", value: 123 }],
    });

    expect(firestore.collection).toHaveBeenCalledWith(
      "channels/channel-1/orders",
    );
    expect(query.where).toHaveBeenCalledWith("number", "==", 123);
    expect(query.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(query.offset).toHaveBeenCalledWith(2);
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({
      collectionPath: "channels/channel-1/orders",
      records: [
        {
          id: "order-doc-123",
          path: "channels/channel-1/orders/order-doc-123",
          resource: "orders",
        },
      ],
    });
  });

  it("reads MCP draft records from the agents collection with tenant filtering", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: () => ({
          channelId: "channel-1",
          createdBy: {
            id: "user-1",
            name: "Admin",
          },
          result: {
            itemCount: 1,
          },
          source: "mcp",
          status: "completed",
          summary: "Ready for review.",
          taskType: "quote",
          tenantId: "tenant-1",
          workflowStatus: "mcp_draft",
        }),
        exists: true,
        id: "draft-run-1",
      })
      .mockResolvedValueOnce({
        data: () => ({
          result: {},
          tenantId: "tenant-2",
        }),
        exists: true,
        id: "draft-run-2",
      });
    const doc = vi.fn(() => ({ get }));
    const firestore = {
      collection: vi.fn(() => ({ doc })),
    } as unknown as Parameters<typeof createFirestoreToolLayerReaders>[0];

    const readers = createFirestoreToolLayerReaders(firestore, {
      tenantId: "tenant-1",
    });

    await expect(
      readers.getDraftRecord({ runId: "draft-run-1" }),
    ).resolves.toMatchObject({
      channelId: "channel-1",
      createdBy: {
        id: "user-1",
        name: "Admin",
      },
      result: {
        itemCount: 1,
      },
      runId: "draft-run-1",
      source: "mcp",
      summary: "Ready for review.",
      taskType: "quote",
      workflowStatus: "mcp_draft",
    });
    await expect(
      readers.getDraftRecord({ runId: "draft-run-2" }),
    ).resolves.toBeNull();
    expect(firestore.collection).toHaveBeenCalledWith("agents");
    expect(doc).toHaveBeenCalledWith("draft-run-1");
    expect(doc).toHaveBeenCalledWith("draft-run-2");
  });
});
