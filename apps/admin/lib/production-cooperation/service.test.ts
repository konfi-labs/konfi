import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionCooperationAppApiRequestEnvelope } from "@sblyvwx/cloud-contracts";
import { productionCooperationAppApiPayloadVersion } from "@sblyvwx/cloud-contracts";

type StoredData = Record<string, unknown>;

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

  toDate() {
    return new Date(this.seconds * 1000);
  }
}

class FakeDocumentSnapshot {
  id: string;
  exists: boolean;
  private value?: StoredData;

  constructor(id: string, value?: StoredData) {
    this.id = id;
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
}

class FakeDocumentReference {
  id: string;
  path: string;
  private db: FakeFirestore;

  constructor(db: FakeFirestore, path: string) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1) ?? path;
  }

  collection(collectionId: string) {
    return new FakeCollectionReference(this.db, `${this.path}/${collectionId}`);
  }

  async get() {
    return new FakeDocumentSnapshot(this.id, this.db.read(this.path));
  }

  async set(data: StoredData, options?: { merge?: boolean }) {
    this.db.write(
      this.path,
      options?.merge ? { ...this.db.read(this.path), ...data } : data,
    );
  }

  async update(data: StoredData) {
    const existing = this.db.read(this.path);

    if (!existing) {
      throw new Error(`Document ${this.path} does not exist`);
    }

    this.db.write(this.path, { ...existing, ...data });
  }
}

class FakeCollectionReference {
  private db: FakeFirestore;
  private path: string;
  private limitCount?: number;

  constructor(db: FakeFirestore, path: string, limitCount?: number) {
    this.db = db;
    this.path = path;
    this.limitCount = limitCount;
  }

  doc(id?: string) {
    return new FakeDocumentReference(
      this.db,
      `${this.path}/${id ?? this.db.nextId()}`,
    );
  }

  orderBy() {
    return this;
  }

  limit(limitCount: number) {
    return new FakeCollectionReference(this.db, this.path, limitCount);
  }

  async get() {
    const prefix = `${this.path}/`;
    const docs = this.db
      .entries()
      .filter(([path]) => path.startsWith(prefix))
      .filter(([path]) => path.slice(prefix.length).split("/").length === 1)
      .map(([path, data]) => {
        const id = path.split("/").at(-1) ?? path;
        return new FakeDocumentSnapshot(id, data);
      })
      .slice(0, this.limitCount);

    return new FakeQuerySnapshot(docs);
  }
}

class FakeTransaction {
  get(target: FakeDocumentReference) {
    return target.get();
  }

  set(
    ref: FakeDocumentReference,
    data: StoredData,
    options?: { merge?: boolean },
  ) {
    return ref.set(data, options);
  }

  update(ref: FakeDocumentReference, data: StoredData) {
    return ref.update(data);
  }
}

class FakeFirestore {
  private documents = new Map<string, StoredData>();
  private idCounter = 0;

  collection(collectionId: string) {
    return new FakeCollectionReference(this, collectionId);
  }

  async runTransaction<T>(callback: (transaction: FakeTransaction) => T) {
    return callback(new FakeTransaction());
  }

  nextId() {
    this.idCounter += 1;
    return `generated-${this.idCounter}`;
  }

  read(path: string) {
    return this.documents.get(path);
  }

  write(path: string, data: StoredData) {
    this.documents.set(path, data);
  }

  seed(path: string, data: StoredData) {
    this.write(path, data);
  }

  entries() {
    return Array.from(this.documents.entries());
  }
}

const mocks = vi.hoisted(() => ({
  getAdminDb: vi.fn<() => FakeFirestore>(),
  getAuthenticatedAdminMember: vi.fn(),
  lookup: vi.fn(),
  requireAdminAuth: vi.fn(),
  validateProductionCooperationToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/actions/auth-utils", () => ({
  getAuthenticatedAdminMember: mocks.getAuthenticatedAdminMember,
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("dns/promises", () => ({
  lookup: mocks.lookup,
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: MockTimestamp,
}));

vi.mock("./tokens", () => ({
  validateProductionCooperationToken: mocks.validateProductionCooperationToken,
}));

const payload: ProductionCooperationAppApiRequestEnvelope["payload"] = {
  item: {
    id: "item_123",
    name: "Window decal",
    productId: "product_123",
    quantity: 12,
  },
  order: {
    channelId: "channel_123",
    customerEmail: "buyer@example.com",
    customerName: "Acme Buyer",
    id: "order_123",
    number: "ORD-123",
  },
  sourceParticipantId: "source_123",
  targetParticipantId: "target_123",
  targetTenantId: "tenant_target",
};

const envelope = (
  overrides: Partial<ProductionCooperationAppApiRequestEnvelope> = {},
): ProductionCooperationAppApiRequestEnvelope => ({
  callbackUrl: "https://cloud.example.com/api/production-cooperation/callback",
  idempotencyKey: "idem_123",
  issuedAt: "2026-05-18T12:00:00.000Z",
  payload,
  payloadVersion: productionCooperationAppApiPayloadVersion,
  requestId: "request_123",
  sourceParticipantId: "source_123",
  targetParticipantId: "target_123",
  targetTenantId: "tenant_target",
  targetWarehouseId: "warehouse_123",
  transport: "DEDICATED_APP_API",
  ...overrides,
});

describe("production cooperation direct app API service", () => {
  let db: FakeFirestore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:05:00.000Z"));
    vi.stubEnv(
      "PRODUCTION_COOPERATION_CLOUD_CALLBACK_SECRET",
      "callback-secret",
    );
    vi.stubEnv(
      "PRODUCTION_COOPERATION_CALLBACK_ALLOWED_ORIGINS",
      "https://cloud.example.com",
    );
    db = new FakeFirestore();
    mocks.getAdminDb.mockReturnValue(db);
    mocks.getAuthenticatedAdminMember.mockResolvedValue({
      id: "admin_123",
      name: "Admin One",
    });
    mocks.requireAdminAuth.mockResolvedValue(undefined);
    mocks.lookup.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);
    mocks.validateProductionCooperationToken.mockReset();
    db.seed("productionCooperationParticipants/target_123", {
      allowedWarehouseIds: ["warehouse_123"],
      appApiEnabled: true,
      id: "target_123",
      productSharing: {
        enabled: true,
        productIds: ["product_123"],
      },
      status: "ACTIVE",
      tenantId: "tenant_target",
      type: "DEDICATED_INSTANCE",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("persists direct requests idempotently with history and notification", async () => {
    const { receiveProductionCooperationAppApiRequest } =
      await import("./service");

    const created = await receiveProductionCooperationAppApiRequest(envelope());
    const duplicate =
      await receiveProductionCooperationAppApiRequest(envelope());

    expect(created.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(db.read("productionCooperationRequests/request_123")).toMatchObject({
      callbackStatus: "PENDING",
      idempotencyKey: "idem_123",
      status: "PENDING",
      targetWarehouseId: "warehouse_123",
      transport: "DEDICATED_APP_API",
    });
    expect(
      db.read(
        "productionCooperationRequests/request_123/history/received_idem_123",
      ),
    ).toMatchObject({
      requestId: "request_123",
      type: "APP_API_RECEIVED",
    });
    expect(
      db.read(
        "productionCooperationRequests/request_123/history/duplicate_idem_123",
      ),
    ).toMatchObject({
      requestId: "request_123",
      type: "APP_API_DUPLICATE",
    });
    expect(
      db.read("notifications/production-cooperation-request_123"),
    ).toMatchObject({
      archived: false,
      url: "/cooperation/review?requestId=request_123",
    });
  }, 15_000);

  it("rejects invalid participant access before persistence", async () => {
    const { receiveProductionCooperationAppApiRequest } =
      await import("./service");

    db.seed("productionCooperationParticipants/target_123", {
      allowedWarehouseIds: ["another_warehouse"],
      id: "target_123",
      productSharing: {
        enabled: true,
        productIds: ["another_product"],
      },
      status: "ACTIVE",
      tenantId: "tenant_target",
      type: "DEDICATED_INSTANCE",
    });

    await expect(
      receiveProductionCooperationAppApiRequest(envelope()),
    ).rejects.toMatchObject({
      code: "unauthorized",
      statusCode: 403,
    });
    expect(
      db.read("productionCooperationRequests/request_123"),
    ).toBeUndefined();
  }, 15_000);

  it("requires an explicit receiver warehouse allowlist for direct app API requests", async () => {
    const { receiveProductionCooperationAppApiRequest } =
      await import("./service");

    db.seed("productionCooperationParticipants/target_123", {
      appApiEnabled: true,
      id: "target_123",
      productSharing: {
        enabled: true,
        productIds: ["product_123"],
      },
      status: "ACTIVE",
      tenantId: "tenant_target",
      type: "DEDICATED_INSTANCE",
    });

    await expect(
      receiveProductionCooperationAppApiRequest(envelope()),
    ).rejects.toMatchObject({
      code: "unauthorized",
      message:
        "Production cooperation participant does not allow this warehouse.",
      statusCode: 403,
    });
    expect(
      db.read("productionCooperationRequests/request_123"),
    ).toBeUndefined();
  });

  it("requires direct app API requests to target an allowed warehouse", async () => {
    const { receiveProductionCooperationAppApiRequest } =
      await import("./service");

    await expect(
      receiveProductionCooperationAppApiRequest(
        envelope({ targetWarehouseId: undefined }),
      ),
    ).rejects.toMatchObject({
      code: "unauthorized",
      message:
        "Production cooperation participant does not allow this warehouse.",
      statusCode: 403,
    });
    expect(
      db.read("productionCooperationRequests/request_123"),
    ).toBeUndefined();
  });

  it("rejects callback URLs outside the configured origin allowlist", async () => {
    const { receiveProductionCooperationAppApiRequest } =
      await import("./service");

    await expect(
      receiveProductionCooperationAppApiRequest(
        envelope({
          callbackUrl:
            "https://untrusted.example.net/api/production-cooperation/callback",
        }),
      ),
    ).rejects.toMatchObject({
      code: "tampered",
      message: "Production cooperation callback URL origin is not configured.",
      statusCode: 400,
    });
    expect(
      db.read("productionCooperationRequests/request_123"),
    ).toBeUndefined();
  });

  it("rejects configured callback origins that resolve to private addresses", async () => {
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const { receiveProductionCooperationAppApiRequest } =
      await import("./service");

    await expect(
      receiveProductionCooperationAppApiRequest(envelope()),
    ).rejects.toMatchObject({
      code: "tampered",
      message:
        "Production cooperation callback URL resolves to a private network.",
      statusCode: 400,
    });
    expect(
      db.read("productionCooperationRequests/request_123"),
    ).toBeUndefined();
  });

  it("rejects stale direct app API envelopes", async () => {
    const { receiveProductionCooperationAppApiRequest } =
      await import("./service");

    await expect(
      receiveProductionCooperationAppApiRequest(
        envelope({ issuedAt: "2026-05-18T11:40:00.000Z" }),
      ),
    ).rejects.toMatchObject({
      code: "expired",
      statusCode: 400,
    });
  });

  it("accepts a direct request and synchronizes the Cloud callback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const {
      handleProductionCooperationAction,
      receiveProductionCooperationAppApiRequest,
    } = await import("./service");

    await receiveProductionCooperationAppApiRequest(envelope());
    const result = await handleProductionCooperationAction("accept", {
      requestId: "request_123",
    });

    expect(result).toMatchObject({
      callbackStatus: "SENT",
      code: "accepted",
      requestId: "request_123",
      status: "ACCEPTED",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.example.com/api/production-cooperation/callback",
      expect.objectContaining({
        method: "POST",
        redirect: "manual",
      }),
    );
    expect(db.read("productionCooperationRequests/request_123")).toMatchObject({
      acceptedBy: "admin_123",
      callbackStatus: "SENT",
      status: "ACCEPTED",
    });
  });

  it("fails Cloud callback sync when the dedicated callback secret is missing", async () => {
    vi.stubEnv("PRODUCTION_COOPERATION_CLOUD_CALLBACK_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const {
      handleProductionCooperationAction,
      receiveProductionCooperationAppApiRequest,
    } = await import("./service");

    await receiveProductionCooperationAppApiRequest(envelope());
    const result = await handleProductionCooperationAction("accept", {
      requestId: "request_123",
    });

    expect(result).toMatchObject({
      callbackStatus: "FAILED",
      code: "accepted",
      requestId: "request_123",
      status: "ACCEPTED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.read("productionCooperationRequests/request_123")).toMatchObject({
      acceptedBy: "admin_123",
      callbackStatus: "FAILED",
      status: "ACCEPTED",
    });
  });

  it("fails callback sync without fetching when a stored callback URL is no longer allowed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const {
      handleProductionCooperationAction,
      receiveProductionCooperationAppApiRequest,
    } = await import("./service");

    await receiveProductionCooperationAppApiRequest(envelope());
    vi.stubEnv(
      "PRODUCTION_COOPERATION_CALLBACK_ALLOWED_ORIGINS",
      "https://another-cloud.example.com",
    );

    const result = await handleProductionCooperationAction("accept", {
      requestId: "request_123",
    });

    expect(result).toMatchObject({
      callbackStatus: "FAILED",
      code: "accepted",
      requestId: "request_123",
      status: "ACCEPTED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.read("productionCooperationRequests/request_123")).toMatchObject({
      acceptedBy: "admin_123",
      callbackStatus: "FAILED",
      callbackError:
        "Production cooperation callback URL origin is not configured.",
      status: "ACCEPTED",
    });
  });

  it("keeps the legacy email token action path working", async () => {
    const { handleProductionCooperationAction } = await import("./service");
    db.seed("productionCooperationRequests/legacy_request", {
      id: "legacy_request",
      payload,
      sourceParticipantId: "source_123",
      status: "PENDING",
      targetParticipantId: "target_123",
      targetTenantId: "tenant_target",
      transport: "DEDICATED_EMAIL",
    });
    mocks.validateProductionCooperationToken.mockResolvedValue({
      payload: {
        action: "accept",
        audience: "konfi-production-cooperation",
        expiresAt: "2026-05-25T12:00:00.000Z",
        issuedAt: "2026-05-18T12:00:00.000Z",
        jti: "legacy_jti",
        requestId: "legacy_request",
        targetParticipantId: "target_123",
      },
    });

    const result = await handleProductionCooperationAction("accept", {
      token: "legacy-token",
    });

    expect(result).toMatchObject({
      code: "accepted",
      requestId: "legacy_request",
      status: "ACCEPTED",
    });
    expect(
      db.read("productionCooperationRequests/legacy_request"),
    ).toMatchObject({
      status: "ACCEPTED",
      transport: "DEDICATED_EMAIL",
    });
  });
});
