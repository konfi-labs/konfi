import type {
  CollectionReference,
  DocumentReference,
  Firestore,
  Query,
  QueryConstraint,
} from "firebase/firestore";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCollection,
  mockDoc,
  mockDeleteDoc,
  mockFirestoreGetDoc,
  mockGetCountFromServer,
  mockRunTransaction,
  mockTimestampNow,
  mockTransactionGet,
  mockTransactionSet,
  mockTransactionUpdate,
  mockGetDocs,
  mockQuery,
  mockUpdateDoc,
  mockWhere,
} = vi.hoisted(() => ({
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockFirestoreGetDoc: vi.fn(),
  mockGetCountFromServer: vi.fn(),
  mockRunTransaction: vi.fn(),
  mockTimestampNow: vi.fn(),
  mockTransactionGet: vi.fn(),
  mockTransactionSet: vi.fn(),
  mockTransactionUpdate: vi.fn(),
  mockGetDocs: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockWhere: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  arrayUnion: vi.fn(),
  collection: mockCollection,
  collectionGroup: vi.fn(),
  deleteDoc: mockDeleteDoc,
  doc: mockDoc,
  FieldPath: class FieldPath {},
  getCountFromServer: mockGetCountFromServer,
  getDoc: mockFirestoreGetDoc,
  getDocs: mockGetDocs,
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: mockQuery,
  runTransaction: mockRunTransaction,
  startAfter: vi.fn(),
  Timestamp: {
    fromDate: vi.fn(),
    now: mockTimestampNow,
  },
  updateDoc: mockUpdateDoc,
  where: mockWhere,
}));

vi.mock("../lib", () => ({
  firestore: {},
  initFirestore: vi.fn(),
}));

describe("Firestore write helpers", () => {
  let create: typeof import("../firestore").create;
  let createCustomer: typeof import("../firestore").createCustomer;
  let firestoreDb: typeof import("../firestore").db;
  let get: typeof import("../firestore").get;
  let getDoc: typeof import("../firestore").getDoc;
  let remove: typeof import("../firestore").remove;
  let tenant: typeof import("../firestore").tenant;
  let update: typeof import("../firestore").update;

  beforeAll(async () => {
    const firestoreHelpers = await import("../firestore");

    create = firestoreHelpers.create;
    createCustomer = firestoreHelpers.createCustomer;
    firestoreDb = firestoreHelpers.db;
    get = firestoreHelpers.get;
    getDoc = firestoreHelpers.getDoc;
    remove = firestoreHelpers.remove;
    tenant = firestoreHelpers.tenant;
    update = firestoreHelpers.update;
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    mockDoc.mockReturnValue({
      id: "generated-id",
      path: "collection/generated-id",
    });
    const collectionRef = {
      id: "counters",
      path: "channels/channel-1/counters",
    };
    mockCollection.mockReturnValue({
      ...collectionRef,
      withConverter: vi.fn(() => collectionRef),
    });
    mockGetCountFromServer.mockResolvedValue({
      data: () => ({ count: 0 }),
    });
    mockTransactionGet.mockResolvedValue({ exists: () => false });
    mockFirestoreGetDoc.mockResolvedValue({
      exists: () => false,
    });
    mockRunTransaction.mockImplementation(
      async (
        _firestore: Firestore,
        callback: (transaction: {
          get: typeof mockTransactionGet;
          set: typeof mockTransactionSet;
          update: typeof mockTransactionUpdate;
        }) => Promise<void>,
      ) =>
        callback({
          get: mockTransactionGet,
          set: mockTransactionSet,
          update: mockTransactionUpdate,
        }),
    );
  });

  it("removes undefined fields before creating through the Firestore web SDK", async () => {
    const id = await create(
      {} as Firestore,
      {
        name: "Product",
        optional: undefined,
        nested: {
          keep: "value",
          skip: undefined,
        },
        items: [{ keep: "array-value", skip: undefined }, undefined],
      },
      undefined,
      {} as CollectionReference<{
        name: string;
        optional?: string;
        nested: {
          keep: string;
          skip?: string;
        };
        items?: Array<
          | {
              keep: string;
              skip?: string;
            }
          | undefined
        >;
      }>,
    );

    expect(id).toBe("generated-id");
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: "generated-id" }),
      {
        id: "generated-id",
        name: "Product",
        nested: {
          keep: "value",
        },
        items: [
          {
            keep: "array-value",
          },
          null,
        ],
      },
    );
  });

  it("removes undefined fields before updating through the Firestore web SDK", async () => {
    const ref = {} as DocumentReference<{
      name?: string;
      optional?: string;
      nested?: {
        keep?: string;
        skip?: string;
      };
    }>;

    await update(
      {
        name: "Product",
        optional: undefined,
        nested: {
          keep: "value",
          skip: undefined,
        },
      },
      ref,
    );

    expect(mockUpdateDoc).toHaveBeenCalledWith(ref, {
      name: "Product",
      nested: {
        keep: "value",
      },
    });
  });

  it("stamps tenantId when creating in SaaS mode", async () => {
    const id = await create(
      {} as Firestore,
      {
        name: "Product",
      },
      undefined,
      {} as CollectionReference<{
        name: string;
        tenantId?: string;
      }>,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      },
    );

    expect(id).toBe("generated-id");
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: "generated-id" }),
      {
        id: "generated-id",
        name: "Product",
        tenantId: "tenant-a",
      },
    );
  });

  it("allocates numbered channel documents through the per-channel counter", async () => {
    const channelRef = {
      id: "channel-1",
      path: "channels/channel-1",
    } as DocumentReference<unknown>;
    const ordersCollectionRef = {
      id: "orders",
      parent: channelRef,
      path: "channels/channel-1/orders",
    } as CollectionReference<{
      id?: string;
      keywords: string[];
      number: number;
      tenantId?: string;
    }>;
    const counterRef = {
      id: "orders",
      path: "channels/channel-1/counters/orders",
    } as DocumentReference<{ nextNumber: number; tenantId?: string }>;
    const orderRef = {
      id: "order-id",
      path: "channels/channel-1/orders/order-id",
    } as DocumentReference<{
      id?: string;
      keywords: string[];
      number: number;
      tenantId?: string;
    }>;

    mockDoc.mockReturnValueOnce(counterRef).mockReturnValueOnce(orderRef);
    mockTransactionGet.mockResolvedValueOnce({
      data: () => ({ nextNumber: 42 }),
      exists: () => true,
    });
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({ number: 12 }),
        },
      ],
    });

    const id = await create(
      {} as Firestore,
      {
        keywords: ["repeat customer"],
        number: 0,
      },
      undefined,
      ordersCollectionRef,
      ordersCollectionRef,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      },
    );

    expect(id).toBe("order-id");
    expect(mockCollection).toHaveBeenCalledWith(channelRef, "counters");
    expect(mockGetCountFromServer).not.toHaveBeenCalled();
    expect(mockGetDocs).toHaveBeenCalled();
    expect(mockTransactionSet).toHaveBeenCalledWith(
      counterRef,
      {
        nextNumber: 43,
        tenantId: "tenant-a",
      },
      { merge: true },
    );
    expect(mockTransactionSet).toHaveBeenCalledWith(orderRef, {
      id: "order-id",
      keywords: ["repeat customer", "42"],
      number: 42,
      tenantId: "tenant-a",
    });
  });

  it("does not allocate below the highest existing number when a counter is stale", async () => {
    const channelRef = {
      id: "channel-1",
      path: "channels/channel-1",
    } as DocumentReference<unknown>;
    const ordersCollectionRef = {
      id: "orders",
      parent: channelRef,
      path: "channels/channel-1/orders",
    } as CollectionReference<{
      id?: string;
      keywords: string[];
      number: number;
    }>;
    const counterRef = {
      id: "orders",
      path: "channels/channel-1/counters/orders",
    } as DocumentReference<{ nextNumber: number }>;
    const orderRef = {
      id: "order-id",
      path: "channels/channel-1/orders/order-id",
    } as DocumentReference<{
      id?: string;
      keywords: string[];
      number: number;
    }>;

    mockDoc.mockReturnValueOnce(counterRef).mockReturnValueOnce(orderRef);
    mockTransactionGet.mockResolvedValueOnce({
      data: () => ({ nextNumber: 42 }),
      exists: () => true,
    });
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({ number: 57 }),
        },
      ],
    });

    await create(
      {} as Firestore,
      {
        keywords: ["customer"],
        number: 0,
      },
      undefined,
      ordersCollectionRef,
      ordersCollectionRef,
    );

    expect(mockGetCountFromServer).not.toHaveBeenCalled();
    expect(mockTransactionSet).toHaveBeenCalledWith(
      counterRef,
      {
        nextNumber: 59,
      },
      { merge: true },
    );
    expect(mockTransactionSet).toHaveBeenCalledWith(orderRef, {
      id: "order-id",
      keywords: ["customer", "58"],
      number: 58,
    });
  });

  it("seeds a missing numbered channel counter from the highest existing number", async () => {
    const channelRef = {
      id: "channel-1",
      path: "channels/channel-1",
    } as DocumentReference<unknown>;
    const ordersCollectionRef = {
      id: "orders",
      parent: channelRef,
      path: "channels/channel-1/orders",
    } as CollectionReference<{
      id?: string;
      keywords: string[];
      number: number;
    }>;
    const counterRef = {
      id: "orders",
      path: "channels/channel-1/counters/orders",
    } as DocumentReference<{ nextNumber: number }>;
    const orderRef = {
      id: "order-id",
      path: "channels/channel-1/orders/order-id",
    } as DocumentReference<{
      id?: string;
      keywords: string[];
      number: number;
    }>;

    mockDoc.mockReturnValueOnce(counterRef).mockReturnValueOnce(orderRef);
    mockTransactionGet.mockResolvedValueOnce({
      data: () => undefined,
      exists: () => false,
    });
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({ number: 57 }),
        },
      ],
    });

    await create(
      {} as Firestore,
      {
        keywords: ["customer"],
        number: 0,
      },
      undefined,
      ordersCollectionRef,
      ordersCollectionRef,
    );

    expect(mockGetCountFromServer).not.toHaveBeenCalled();
    expect(mockTransactionSet).toHaveBeenCalledWith(
      counterRef,
      {
        nextNumber: 59,
      },
      { merge: true },
    );
    expect(mockTransactionSet).toHaveBeenCalledWith(orderRef, {
      id: "order-id",
      keywords: ["customer", "58"],
      number: 58,
    });
  });

  it("stamps tenantId when updating in SaaS mode", async () => {
    const ref = {} as DocumentReference<{
      name?: string;
      tenantId?: string;
    }>;

    await update(
      {
        name: "Product",
      },
      ref,
      {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      },
    );

    expect(mockUpdateDoc).toHaveBeenCalledWith(ref, {
      name: "Product",
      tenantId: "tenant-a",
    });
  });

  it("adds tenant constraints for SaaS queries", () => {
    const tenantConstraint = { type: "where" } as QueryConstraint;
    const activeConstraint = { type: "where" } as QueryConstraint;
    mockWhere.mockReturnValueOnce(tenantConstraint);

    expect(
      tenant.queryConstraints(
        {
          deploymentMode: "saas",
          requireTenantId: true,
          tenantId: "tenant-a",
        },
        [activeConstraint],
      ),
    ).toEqual([tenantConstraint, activeConstraint]);
    expect(mockWhere).toHaveBeenCalledWith("tenantId", "==", "tenant-a");
  });

  it("keeps dedicated query constraints unscoped", () => {
    const activeConstraint = { type: "where" } as QueryConstraint;

    expect(
      tenant.queryConstraints(
        {
          deploymentMode: "dedicated",
          requireTenantId: false,
          tenantId: "default",
        },
        [activeConstraint],
      ),
    ).toEqual([activeConstraint]);
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it("requires tenant ids for SaaS query scoping", () => {
    expect(() =>
      tenant.queryConstraints({
        deploymentMode: "saas",
        requireTenantId: true,
      }),
    ).toThrow(
      "Missing tenantId for Firestore tenant query in saas deployment mode.",
    );
  });

  it("returns the generated customer id when creating a customer", async () => {
    const customersCollectionRef = {
      id: "customers",
      path: "customers",
    };
    mockCollection.mockReturnValueOnce({
      ...customersCollectionRef,
      withConverter: vi.fn(() => customersCollectionRef),
    });
    mockDoc.mockReturnValueOnce({
      id: "customer-id",
      path: "customers/customer-id",
    });
    mockTimestampNow.mockReturnValue({
      nanoseconds: 0,
      seconds: 1,
    });

    const id = await createCustomer(
      "Example Print Buyer",
      ["example", "print", "buyer"],
      { id: "member-1", name: "Member One" },
      undefined,
      null,
      null,
    );

    expect(id).toBe("customer-id");
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: "customer-id" }),
      expect.objectContaining({
        id: "customer-id",
        name: "Example Print Buyer",
        personName: "Example Print Buyer",
        keywords: ["example", "print", "buyer"],
      }),
    );
  });

  it("rejects undefined where values before Firestore can create an invalid query", () => {
    const invalidConstraint = {
      type: "where",
      _field: {
        canonicalString: () => "productType.id",
      },
      _op: "==",
      _value: undefined,
    } as unknown as QueryConstraint;

    expect(() =>
      firestoreDb.query(
        {} as Firestore,
        "/channels/channel-id/products",
        5,
        undefined,
        [invalidConstraint],
      ),
    ).toThrow(
      'Invalid Firestore query for "/channels/channel-id/products": where("productType.id", "==", undefined) is not allowed.',
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("falls back to the document id when query results omit an id field", async () => {
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: "product-type-id",
          data: () => ({ name: "Business card" }),
          ref: {},
        },
      ],
    });

    const result = await get<{ id: string; name: string }>(
      {} as Query<{ id: string; name: string }>,
    );

    expect(result?.[0][0]).toEqual({
      id: "product-type-id",
      name: "Business card",
    });
  });

  it("returns undefined when a document does not exist", async () => {
    const result = await getDoc({
      path: "collection/missing-doc",
    } as DocumentReference<{ name: string }>);

    expect(result).toBeUndefined();
    expect(console.info).toHaveBeenCalledWith("Firestore document not found", {
      path: "collection/missing-doc",
    });
  });

  it("throws when reading a document fails unexpectedly", async () => {
    const error = new Error("permission denied");
    mockFirestoreGetDoc.mockRejectedValueOnce(error);

    await expect(
      getDoc({
        path: "collection/secret-doc",
      } as DocumentReference<{ name: string }>),
    ).rejects.toThrow("permission denied");

    expect(console.error).toHaveBeenCalledWith("Firestore getDoc failed", {
      path: "collection/secret-doc",
      error,
    });
  });

  it("throws when a create transaction fails", async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error("transaction failed"));

    await expect(
      create(
        {} as Firestore,
        {
          name: "Product",
          optional: undefined,
        },
        undefined,
        {} as CollectionReference<{
          name: string;
          optional?: string;
        }>,
      ),
    ).rejects.toThrow("transaction failed");

    expect(console.error).toHaveBeenCalledWith(
      "Firestore create failed",
      expect.any(Error),
    );
  });

  it("throws when update fails unexpectedly", async () => {
    const error = new Error("permission denied");
    mockUpdateDoc.mockRejectedValueOnce(error);

    await expect(
      update({ name: "Product" }, {
        path: "collection/product-id",
      } as DocumentReference<{ name: string }>),
    ).rejects.toThrow("permission denied");

    expect(console.error).toHaveBeenCalledWith("Firestore update failed", {
      path: "collection/product-id",
      error,
    });
  });

  it("throws when delete fails unexpectedly", async () => {
    const error = new Error("permission denied");
    mockDeleteDoc.mockRejectedValueOnce(error);

    await expect(
      remove({
        path: "collection/product-id",
      } as DocumentReference<{ name: string }>),
    ).rejects.toThrow("permission denied");

    expect(console.error).toHaveBeenCalledWith("Firestore delete failed", {
      path: "collection/product-id",
      error,
    });
  });
});
