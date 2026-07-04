import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { FulfillmentRequestStatus, Unit } from "@konfi/types";

type FulfillmentService = typeof import("./service");

type StoredData = Record<string, unknown>;

interface QueryFilter {
  field: string;
  value: unknown;
}

class MockTimestamp {
  static nextSeconds = 1_700_000_000;

  seconds: number;
  nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now() {
    MockTimestamp.nextSeconds += 1;
    return new MockTimestamp(MockTimestamp.nextSeconds, 0);
  }
}

class FakeDocumentSnapshot {
  id: string;
  ref: FakeDocumentReference;
  exists: boolean;
  private value?: StoredData;

  constructor(ref: FakeDocumentReference, value?: StoredData) {
    this.id = ref.id;
    this.ref = ref;
    this.exists = value !== undefined;
    this.value = value;
  }

  data() {
    return this.value;
  }
}

class FakeQuerySnapshot {
  docs: FakeDocumentSnapshot[];

  constructor(docs: FakeDocumentSnapshot[]) {
    this.docs = docs;
  }

  get empty() {
    return this.docs.length === 0;
  }

  get size() {
    return this.docs.length;
  }
}

class FakeDocumentReference {
  path: string;
  id: string;
  private db: FakeFirestore;

  constructor(db: FakeFirestore, path: string) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1) ?? path;
  }

  async get() {
    return new FakeDocumentSnapshot(this, this.db.read(this.path));
  }

  async update(data: StoredData) {
    this.updateData(data);
  }

  setData(data: StoredData) {
    this.db.write(this.path, data);
  }

  updateData(data: StoredData) {
    const existing = this.db.read(this.path);
    if (!existing) {
      throw new Error(`Document ${this.path} does not exist`);
    }

    this.db.write(this.path, {
      ...existing,
      ...data,
    });
  }
}

class FakeQuery {
  private db: FakeFirestore;
  private collectionId: string;
  private collectionGroup: boolean;
  private filters: QueryFilter[];

  constructor(params: {
    db: FakeFirestore;
    collectionId: string;
    collectionGroup: boolean;
    filters?: QueryFilter[];
  }) {
    this.db = params.db;
    this.collectionId = params.collectionId;
    this.collectionGroup = params.collectionGroup;
    this.filters = params.filters ?? [];
  }

  where(field: string, operator: string, value: unknown) {
    if (operator !== "==") {
      throw new Error(`Unsupported operator ${operator}`);
    }

    return new FakeQuery({
      db: this.db,
      collectionId: this.collectionId,
      collectionGroup: this.collectionGroup,
      filters: [...this.filters, { field, value }],
    });
  }

  async get() {
    return new FakeQuerySnapshot(
      this.db
        .entries()
        .filter(([path, data]) => this.matchesPath(path) && this.matches(data))
        .map(
          ([path, data]) => new FakeDocumentSnapshot(this.db.doc(path), data),
        ),
    );
  }

  private matchesPath(path: string) {
    const segments = path.split("/");

    if (this.collectionGroup) {
      return segments.at(-2) === this.collectionId;
    }

    return segments.length === 2 && segments[0] === this.collectionId;
  }

  private matches(data: StoredData) {
    return this.filters.every((filter) => data[filter.field] === filter.value);
  }
}

class FakeTransaction {
  get(target: FakeDocumentReference | FakeQuery) {
    return target.get();
  }

  set(ref: FakeDocumentReference, data: StoredData) {
    ref.setData(data);
  }

  update(ref: FakeDocumentReference, data: StoredData) {
    ref.updateData(data);
  }
}

class FakeBatch {
  private updates: Array<{ ref: FakeDocumentReference; data: StoredData }> = [];

  update(ref: FakeDocumentReference, data: StoredData) {
    this.updates.push({ ref, data });
  }

  async commit() {
    this.updates.forEach((update) => update.ref.updateData(update.data));
  }
}

class FakeFirestore {
  private documents = new Map<string, StoredData>();

  doc(path: string) {
    return new FakeDocumentReference(this, path);
  }

  collection(collectionId: string) {
    return new FakeQuery({
      db: this,
      collectionId,
      collectionGroup: false,
    });
  }

  collectionGroup(collectionId: string) {
    return new FakeQuery({
      db: this,
      collectionId,
      collectionGroup: true,
    });
  }

  batch() {
    return new FakeBatch();
  }

  async runTransaction<T>(callback: (transaction: FakeTransaction) => T) {
    return callback(new FakeTransaction());
  }

  seed(path: string, data: StoredData) {
    this.write(path, data);
  }

  read(path: string) {
    return this.documents.get(path);
  }

  write(path: string, data: StoredData) {
    this.documents.set(path, data);
  }

  entries() {
    return Array.from(this.documents.entries());
  }
}

class MockAdminAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AdminAuthError";
    this.statusCode = statusCode;
  }
}

const mocks = vi.hoisted(() => ({
  getDb: vi.fn<() => unknown>(),
  requireAdminAuth: vi.fn<() => Promise<void>>(),
  requireTenantAdminAuth: vi.fn<(tenantId: string) => Promise<void>>(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getDb,
  getFirebaseAdminApp: vi.fn(() => ({})),
}));

vi.mock("@/actions/auth-utils", () => ({
  AdminAuthError: MockAdminAuthError,
  requireAdminAuth: mocks.requireAdminAuth,
  requireTenantAdminAuth: mocks.requireTenantAdminAuth,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mocks.getDb,
  Timestamp: MockTimestamp,
}));

const actor = {
  id: "admin-1",
  name: "Admin One",
};

function orderData(overrides: StoredData = {}): StoredData {
  return {
    id: "order-1",
    number: 1001,
    channelId: "channel-1",
    tenantId: "source-tenant",
    specialNotes: "Please produce carefully",
    items: [
      {
        id: "item-1",
        name: "Flyers",
        product: {
          id: "product-1",
          name: "Flyers",
          channelId: "channel-1",
        },
        quantity: 250,
        unit: Unit.PCS,
      },
    ],
    fulfilledItems: [],
    inProgressItems: [],
    pickedUpItems: [],
    deliveredItems: [],
    ...overrides,
  };
}

function warehouseData(overrides: StoredData = {}): StoredData {
  return {
    id: "warehouse-1",
    name: "Partner production",
    tenantId: "target-tenant",
    active: true,
    keywords: [],
    address: null,
    ...overrides,
  };
}

function productData(overrides: StoredData = {}): StoredData {
  return {
    id: "product-1",
    name: "Flyers",
    channelId: "channel-1",
    attributes: ["format", "paper"],
    attributeOptions: {
      format: ["a4"],
      paper: ["matte"],
    },
    linkedWarehouses: [],
    ...overrides,
  };
}

function attributeData(overrides: StoredData = {}): StoredData {
  return {
    id: "format",
    name: "Format",
    options: [
      {
        customFormat: false,
        hidden: false,
        label: "A4",
        value: "a4",
      },
    ],
    required: true,
    type: "DROPDOWN",
    ...overrides,
  };
}

function cooperationData(overrides: StoredData = {}): StoredData {
  return {
    id: "coop-1",
    name: "Source to target",
    active: true,
    sourceTenantId: "source-tenant",
    targetTenantId: "target-tenant",
    sourcePlanId: "starter",
    targetPlanId: "pro",
    status: "ACTIVE",
    transport: "SAME_DATABASE",
    productSharing: {
      enabled: true,
      productIds: ["product-1"],
    },
    targetWarehouseIds: ["warehouse-1"],
    ...overrides,
  };
}

describe("fulfillment cooperation service", () => {
  let db: FakeFirestore;
  let acceptFulfillmentRequest: FulfillmentService["acceptFulfillmentRequest"];
  let assignOrderItemWarehouse: FulfillmentService["assignOrderItemWarehouse"];
  let createManualFulfillmentRequest: FulfillmentService["createManualFulfillmentRequest"];

  beforeAll(async () => {
    const service = await import("./service");
    acceptFulfillmentRequest = service.acceptFulfillmentRequest;
    assignOrderItemWarehouse = service.assignOrderItemWarehouse;
    createManualFulfillmentRequest = service.createManualFulfillmentRequest;
  });

  beforeEach(() => {
    db = new FakeFirestore();
    mocks.getDb.mockReturnValue(db);
    mocks.requireAdminAuth.mockResolvedValue();
    mocks.requireTenantAdminAuth.mockResolvedValue();
    MockTimestamp.nextSeconds = 1_700_000_000;
  });

  it("creates same-database cooperation requests with tenant metadata", async () => {
    db.seed("channels/channel-1/orders/order-1", orderData());
    db.seed("warehouses/warehouse-1", warehouseData());
    db.seed("tenantCooperations/coop-1", cooperationData());

    const result = await createManualFulfillmentRequest(
      {
        channelId: "channel-1",
        orderId: "order-1",
        itemId: "item-1",
        warehouseId: "warehouse-1",
        sourceTenantId: "source-tenant",
        targetTenantId: "target-tenant",
        cooperationId: "coop-1",
      },
      actor,
      { skipTenantAuth: true },
    );

    expect(result).toMatchObject({
      success: true,
      created: true,
      requestId: "order-1_item-1_warehouse-1",
    });
    expect(
      db.read(
        "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      ),
    ).toMatchObject({
      tenantId: "target-tenant",
      sourceTenantId: "source-tenant",
      targetTenantId: "target-tenant",
      cooperationId: "coop-1",
      status: FulfillmentRequestStatus.PENDING,
    });
  });

  it("does not recreate an existing request on duplicate creation", async () => {
    db.seed("channels/channel-1/orders/order-1", orderData());
    db.seed("warehouses/warehouse-1", warehouseData());
    db.seed("tenantCooperations/coop-1", cooperationData());
    db.seed(
      "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      {
        id: "order-1_item-1_warehouse-1",
        status: FulfillmentRequestStatus.REJECTED,
        marker: "keep-original",
      },
    );

    const result = await createManualFulfillmentRequest(
      {
        channelId: "channel-1",
        orderId: "order-1",
        itemId: "item-1",
        warehouseId: "warehouse-1",
      },
      actor,
      { skipTenantAuth: true },
    );

    expect(result).toMatchObject({
      success: true,
      created: false,
      requestId: "order-1_item-1_warehouse-1",
    });
    expect(
      db.read(
        "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      ),
    ).toMatchObject({
      status: FulfillmentRequestStatus.REJECTED,
      marker: "keep-original",
    });
  });

  it("requires an active allowlist for cross-tenant request creation", async () => {
    db.seed("channels/channel-1/orders/order-1", orderData());
    db.seed("warehouses/warehouse-1", warehouseData());

    await expect(
      createManualFulfillmentRequest(
        {
          channelId: "channel-1",
          orderId: "order-1",
          itemId: "item-1",
          warehouseId: "warehouse-1",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Active same-database tenant cooperation is required",
    });
  });

  it("stores shared product configuration snapshots for cooperation receivers", async () => {
    db.seed(
      "channels/channel-1/orders/order-1",
      orderData({
        items: [
          {
            advancedAttributeSelections: {
              finishing: {
                cutToSize: true,
                grommets: {
                  sides: ["top"],
                  spacing: 50,
                },
                reinforcementSides: ["top"],
                tunnelSides: [],
              },
            },
            calculatedCombination: "a4-matte",
            combination: "a4-matte",
            customFormat: false,
            description: "Blue matte finish",
            id: "item-1",
            name: "Flyers",
            pageCount: 2,
            product: {
              channelId: "channel-1",
              id: "product-1",
              name: "Flyers",
            },
            quantity: 250,
            unit: Unit.PCS,
            volume: 250,
          },
        ],
      }),
    );
    db.seed("channels/channel-1/products/product-1", productData());
    db.seed("attributes/format", attributeData());
    db.seed(
      "attributes/paper",
      attributeData({
        id: "paper",
        name: "Paper",
        options: [
          {
            customFormat: false,
            hidden: false,
            label: "Matte",
            value: "matte",
          },
        ],
        required: false,
      }),
    );
    db.seed("warehouses/warehouse-1", warehouseData());
    db.seed("tenantCooperations/coop-1", cooperationData());

    await createManualFulfillmentRequest(
      {
        channelId: "channel-1",
        orderId: "order-1",
        itemId: "item-1",
        warehouseId: "warehouse-1",
      },
      actor,
      { skipTenantAuth: true },
    );

    expect(
      db.read(
        "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      ),
    ).toMatchObject({
      orderItemSnapshot: {
        configuration: {
          advancedAttributeSelections: {
            finishing: {
              cutToSize: true,
            },
          },
          calculatedCombination: "a4-matte",
          combination: "a4-matte",
          pageCount: 2,
          selectedAttributes: [
            {
              attributeId: "format",
              attributeName: "Format",
              optionLabel: "A4",
              optionValue: "a4",
              required: true,
            },
            {
              attributeId: "paper",
              attributeName: "Paper",
              optionLabel: "Matte",
              optionValue: "matte",
              required: false,
            },
          ],
          volume: 250,
        },
        description: "Blue matte finish",
        product: {
          attributeIds: ["format", "paper"],
          requiredAttributeIds: ["format"],
        },
      },
    });
  });

  it("requires paid plans on both sides of same-database cooperation", async () => {
    db.seed("channels/channel-1/orders/order-1", orderData());
    db.seed("warehouses/warehouse-1", warehouseData());
    db.seed(
      "tenantCooperations/coop-1",
      cooperationData({ sourcePlanId: "free", targetPlanId: "pro" }),
    );

    await expect(
      createManualFulfillmentRequest(
        {
          channelId: "channel-1",
          orderId: "order-1",
          itemId: "item-1",
          warehouseId: "warehouse-1",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message:
        "Same-database tenant cooperation requires paid source and target plans",
    });
  });

  it("requires product sharing access for same-database cooperation", async () => {
    db.seed("channels/channel-1/orders/order-1", orderData());
    db.seed("warehouses/warehouse-1", warehouseData());
    db.seed(
      "tenantCooperations/coop-1",
      cooperationData({
        productSharing: {
          enabled: true,
          productIds: ["another-product"],
        },
      }),
    );

    await expect(
      createManualFulfillmentRequest(
        {
          channelId: "channel-1",
          orderId: "order-1",
          itemId: "item-1",
          warehouseId: "warehouse-1",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message:
        "Same-database tenant cooperation does not allow access to this product",
    });
  });

  it("requires product sharing to be enabled for same-database cooperation", async () => {
    db.seed("channels/channel-1/orders/order-1", orderData());
    db.seed("warehouses/warehouse-1", warehouseData());
    db.seed(
      "tenantCooperations/coop-1",
      cooperationData({
        productSharing: {
          enabled: false,
          productIds: ["product-1"],
        },
      }),
    );

    await expect(
      createManualFulfillmentRequest(
        {
          channelId: "channel-1",
          orderId: "order-1",
          itemId: "item-1",
          warehouseId: "warehouse-1",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message:
        "Same-database tenant cooperation does not allow access to this product",
    });
  });

  it("accepts only after target-tenant authorization and stores assignment metadata", async () => {
    db.seed("channels/channel-1/orders/order-1", orderData());
    db.seed(
      "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      {
        id: "order-1_item-1_warehouse-1",
        orderId: "order-1",
        orderNumber: 1001,
        channelId: "channel-1",
        itemId: "item-1",
        status: FulfillmentRequestStatus.PENDING,
        targetWarehouseId: "warehouse-1",
        tenantId: "target-tenant",
        sourceTenantId: "source-tenant",
        targetTenantId: "target-tenant",
        cooperationId: "coop-1",
      },
    );
    db.seed(
      "warehouses/warehouse-2/fulfillmentRequests/order-1_item-1_warehouse-2",
      {
        id: "order-1_item-1_warehouse-2",
        orderId: "order-1",
        orderNumber: 1001,
        channelId: "channel-1",
        itemId: "item-1",
        status: FulfillmentRequestStatus.PENDING,
        targetWarehouseId: "warehouse-2",
      },
    );

    await acceptFulfillmentRequest(
      {
        warehouseId: "warehouse-1",
        requestId: "order-1_item-1_warehouse-1",
      },
      actor,
    );

    expect(mocks.requireTenantAdminAuth).toHaveBeenCalledWith("target-tenant");
    expect(
      db.read(
        "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      ),
    ).toMatchObject({
      status: FulfillmentRequestStatus.ACCEPTED,
    });
    expect(
      db.read(
        "warehouses/warehouse-2/fulfillmentRequests/order-1_item-1_warehouse-2",
      ),
    ).toMatchObject({
      status: FulfillmentRequestStatus.CANCELLED,
    });

    const order = db.read("channels/channel-1/orders/order-1");
    expect(order).toMatchObject({
      items: [
        {
          id: "item-1",
          warehouseId: "warehouse-1",
          fulfillmentAssignment: {
            requestId: "order-1_item-1_warehouse-1",
            warehouseId: "warehouse-1",
            sourceTenantId: "source-tenant",
            targetTenantId: "target-tenant",
            cooperationId: "coop-1",
            acceptedBy: actor,
          },
        },
      ],
    });
  });

  it("keeps existing same-tenant fulfillment creation working without cooperation", async () => {
    db.seed(
      "channels/channel-1/orders/order-1",
      orderData({ tenantId: "tenant-1" }),
    );
    db.seed("warehouses/warehouse-1", warehouseData({ tenantId: "tenant-1" }));

    const result = await createManualFulfillmentRequest(
      {
        channelId: "channel-1",
        orderId: "order-1",
        itemId: "item-1",
        warehouseId: "warehouse-1",
      },
      actor,
      { skipTenantAuth: true },
    );

    expect(result.created).toBe(true);
    expect(
      db.read(
        "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      ),
    ).toMatchObject({
      tenantId: "tenant-1",
      sourceTenantId: "tenant-1",
      targetTenantId: "tenant-1",
      cooperationId: undefined,
    });
  });

  it("directly assigns only the selected item and cancels pending requests for that item", async () => {
    db.seed(
      "channels/channel-1/orders/order-1",
      orderData({
        tenantId: "tenant-1",
        items: [
          {
            id: "item-1",
            name: "Flyers",
            product: {
              id: "product-1",
              name: "Flyers",
              channelId: "channel-1",
            },
            quantity: 250,
            unit: Unit.PCS,
          },
          {
            id: "item-2",
            name: "Poster",
            product: {
              id: "product-2",
              name: "Poster",
              channelId: "channel-1",
            },
            quantity: 1,
            unit: Unit.PCS,
          },
        ],
      }),
    );
    db.seed("warehouses/warehouse-1", warehouseData({ tenantId: "tenant-1" }));
    db.seed(
      "warehouses/warehouse-2/fulfillmentRequests/order-1_item-1_warehouse-2",
      {
        id: "order-1_item-1_warehouse-2",
        channelId: "channel-1",
        orderId: "order-1",
        itemId: "item-1",
        status: FulfillmentRequestStatus.PENDING,
        targetWarehouseId: "warehouse-2",
      },
    );
    db.seed(
      "warehouses/warehouse-2/fulfillmentRequests/order-1_item-2_warehouse-2",
      {
        id: "order-1_item-2_warehouse-2",
        channelId: "channel-1",
        orderId: "order-1",
        itemId: "item-2",
        status: FulfillmentRequestStatus.PENDING,
        targetWarehouseId: "warehouse-2",
      },
    );

    const result = await assignOrderItemWarehouse(
      {
        channelId: "channel-1",
        itemId: "item-1",
        orderId: "order-1",
        warehouseId: "warehouse-1",
      },
      actor,
      { skipTenantAuth: true },
    );

    expect(result).toMatchObject({
      assigned: true,
      requestId: "order-1_item-1_warehouse-1",
      success: true,
    });
    expect(
      db.read(
        "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      ),
    ).toMatchObject({
      assignmentSource: "DIRECT",
      status: FulfillmentRequestStatus.ACCEPTED,
      targetWarehouseId: "warehouse-1",
      tenantId: "tenant-1",
    });
    expect(
      db.read(
        "warehouses/warehouse-2/fulfillmentRequests/order-1_item-1_warehouse-2",
      ),
    ).toMatchObject({
      status: FulfillmentRequestStatus.CANCELLED,
    });
    expect(
      db.read(
        "warehouses/warehouse-2/fulfillmentRequests/order-1_item-2_warehouse-2",
      ),
    ).toMatchObject({
      status: FulfillmentRequestStatus.PENDING,
    });

    const order = db.read("channels/channel-1/orders/order-1");
    expect(order).toMatchObject({
      items: [
        {
          id: "item-1",
          warehouseId: "warehouse-1",
          fulfillmentAssignment: {
            assignmentSource: "DIRECT",
            requestId: "order-1_item-1_warehouse-1",
            warehouseId: "warehouse-1",
          },
        },
        {
          id: "item-2",
        },
      ],
    });
    expect((order?.items as StoredData[])[1]).not.toHaveProperty("warehouseId");
  });

  it("rejects invalid direct warehouse assignments", async () => {
    db.seed(
      "channels/channel-1/orders/order-1",
      orderData({
        fulfilledItems: ["item-1"],
        tenantId: "tenant-1",
      }),
    );
    db.seed("warehouses/warehouse-1", warehouseData({ tenantId: "tenant-1" }));
    db.seed("warehouses/warehouse-2", warehouseData({ tenantId: "tenant-2" }));

    await expect(
      assignOrderItemWarehouse(
        {
          channelId: "channel-1",
          itemId: "missing-item",
          orderId: "order-1",
          warehouseId: "warehouse-1",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Item missing-item not found in order order-1",
    });

    await expect(
      assignOrderItemWarehouse(
        {
          channelId: "channel-1",
          itemId: "item-1",
          orderId: "order-1",
          warehouseId: "missing-warehouse",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Warehouse missing-warehouse not found",
    });

    await expect(
      assignOrderItemWarehouse(
        {
          channelId: "channel-1",
          itemId: "item-1",
          orderId: "order-1",
          warehouseId: "warehouse-2",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message:
        "Direct warehouse assignment is only allowed for same-tenant warehouses",
    });

    await expect(
      assignOrderItemWarehouse(
        {
          channelId: "channel-1",
          itemId: "item-1",
          orderId: "order-1",
          warehouseId: "warehouse-1",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Cannot change warehouse assignment after item fulfillment has started",
    });
  });

  it("allows changing and clearing direct assignments before fulfillment", async () => {
    db.seed(
      "channels/channel-1/orders/order-1",
      orderData({
        tenantId: "tenant-1",
        items: [
          {
            id: "item-1",
            name: "Flyers",
            product: {
              id: "product-1",
              name: "Flyers",
              channelId: "channel-1",
            },
            quantity: 250,
            unit: Unit.PCS,
            warehouseId: "warehouse-1",
            fulfillmentAssignment: {
              assignmentSource: "DIRECT",
              requestId: "order-1_item-1_warehouse-1",
              warehouseId: "warehouse-1",
            },
          },
        ],
      }),
    );
    db.seed("warehouses/warehouse-1", warehouseData({ tenantId: "tenant-1" }));
    db.seed("warehouses/warehouse-2", warehouseData({ tenantId: "tenant-1" }));
    db.seed(
      "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      {
        id: "order-1_item-1_warehouse-1",
        assignmentSource: "DIRECT",
        channelId: "channel-1",
        orderId: "order-1",
        itemId: "item-1",
        status: FulfillmentRequestStatus.ACCEPTED,
        targetWarehouseId: "warehouse-1",
      },
    );

    await assignOrderItemWarehouse(
      {
        channelId: "channel-1",
        itemId: "item-1",
        orderId: "order-1",
        warehouseId: "warehouse-2",
      },
      actor,
      { skipTenantAuth: true },
    );

    expect(
      db.read(
        "warehouses/warehouse-1/fulfillmentRequests/order-1_item-1_warehouse-1",
      ),
    ).toMatchObject({
      status: FulfillmentRequestStatus.CANCELLED,
    });
    expect(
      db.read(
        "warehouses/warehouse-2/fulfillmentRequests/order-1_item-1_warehouse-2",
      ),
    ).toMatchObject({
      assignmentSource: "DIRECT",
      status: FulfillmentRequestStatus.ACCEPTED,
    });
    expect(db.read("channels/channel-1/orders/order-1")).toMatchObject({
      items: [
        {
          id: "item-1",
          warehouseId: "warehouse-2",
          fulfillmentAssignment: {
            assignmentSource: "DIRECT",
            requestId: "order-1_item-1_warehouse-2",
          },
        },
      ],
    });

    await assignOrderItemWarehouse(
      {
        channelId: "channel-1",
        itemId: "item-1",
        orderId: "order-1",
      },
      actor,
      { skipTenantAuth: true },
    );

    expect(
      db.read(
        "warehouses/warehouse-2/fulfillmentRequests/order-1_item-1_warehouse-2",
      ),
    ).toMatchObject({
      status: FulfillmentRequestStatus.CANCELLED,
    });
    const clearedOrder = db.read("channels/channel-1/orders/order-1");
    expect(clearedOrder).toMatchObject({
      items: [
        {
          id: "item-1",
        },
      ],
    });
    expect((clearedOrder?.items as StoredData[])[0]).not.toHaveProperty(
      "warehouseId",
    );
    expect((clearedOrder?.items as StoredData[])[0]).not.toHaveProperty(
      "fulfillmentAssignment",
    );
  });

  it("does not manually change request-accepted assignments", async () => {
    db.seed(
      "channels/channel-1/orders/order-1",
      orderData({
        tenantId: "tenant-1",
        items: [
          {
            id: "item-1",
            name: "Flyers",
            product: {
              id: "product-1",
              name: "Flyers",
              channelId: "channel-1",
            },
            quantity: 250,
            unit: Unit.PCS,
            warehouseId: "warehouse-1",
            fulfillmentAssignment: {
              assignmentSource: "FULFILLMENT_REQUEST",
              requestId: "order-1_item-1_warehouse-1",
              warehouseId: "warehouse-1",
            },
          },
        ],
      }),
    );
    db.seed("warehouses/warehouse-2", warehouseData({ tenantId: "tenant-1" }));

    await expect(
      assignOrderItemWarehouse(
        {
          channelId: "channel-1",
          itemId: "item-1",
          orderId: "order-1",
          warehouseId: "warehouse-2",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Only direct warehouse assignments can be changed manually",
    });

    await expect(
      assignOrderItemWarehouse(
        {
          channelId: "channel-1",
          itemId: "item-1",
          orderId: "order-1",
        },
        actor,
        { skipTenantAuth: true },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Only direct warehouse assignments can be changed manually",
    });
  });
});
