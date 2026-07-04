import { PaymentStatus } from "@konfi/types";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type StoredData = Record<string, unknown>;

class FakeDocumentSnapshot {
  id: string;
  exists: boolean;
  ref: FakeDocumentReference;
  private value?: StoredData;

  constructor(ref: FakeDocumentReference, value?: StoredData) {
    this.id = ref.id;
    this.exists = value !== undefined;
    this.ref = ref;
    this.value = value;
  }

  data() {
    return this.value ?? {};
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
    return new FakeDocumentSnapshot(this, this.db.read(this.path));
  }

  async update(data: StoredData) {
    const existing = this.db.read(this.path);
    if (!existing) {
      throw new Error(`Document ${this.path} does not exist`);
    }

    this.db.write(this.path, { ...existing, ...data });
    return { writeTime: new Date() };
  }
}

class FakeCollectionReference {
  private db: FakeFirestore;
  private path: string;
  private filters: Array<{ field: string; value: unknown }>;

  constructor(
    db: FakeFirestore,
    path: string,
    filters: Array<{ field: string; value: unknown }> = [],
  ) {
    this.db = db;
    this.path = path;
    this.filters = filters;
  }

  doc(id: string) {
    return new FakeDocumentReference(this.db, `${this.path}/${id}`);
  }

  where(field: string, operator: "==", value: unknown) {
    if (operator !== "==") {
      throw new Error(`Unsupported operator ${operator}`);
    }

    return new FakeCollectionReference(this.db, this.path, [
      ...this.filters,
      { field, value },
    ]);
  }

  async get() {
    const prefix = `${this.path}/`;
    const docs = this.db
      .entries()
      .filter(([path]) => path.startsWith(prefix))
      .filter(([path]) => path.slice(prefix.length).split("/").length === 1)
      .filter(([, data]) =>
        this.filters.every((filter) => data[filter.field] === filter.value),
      )
      .map(([path, data]) => {
        const ref = new FakeDocumentReference(this.db, path);
        return new FakeDocumentSnapshot(ref, data);
      });

    return new FakeQuerySnapshot(docs);
  }
}

class FakeFirestore {
  private documents = new Map<string, StoredData>();

  collection(collectionId: string) {
    return new FakeCollectionReference(this, collectionId);
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
  getAdminBaseUrl: vi.fn(),
  getAdminDb: vi.fn<() => FakeFirestore>(),
  resolveServerTenantContext: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("@konfi/emails", () => ({
  ProformaPaid: () => "proforma paid",
}));

vi.mock("@konfi/firebase", () => ({
  resolveServerTenantContext: mocks.resolveServerTenantContext,
}));

vi.mock("@konfi/payments", () => ({
  getAdminBaseUrl: mocks.getAdminBaseUrl,
}));

let post: (typeof import("./route"))["POST"];

function webhookRequest(body: unknown) {
  return new Request("https://admin.example.com/api/fakturownia/webhook", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

describe("Fakturownia invoice status webhook", () => {
  let db: FakeFirestore;

  beforeAll(async () => {
    ({ POST: post } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_TOKEN", "webhook-secret");
    vi.stubEnv("FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_DEDICATED_MODE", "true");
    vi.stubEnv("FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_CHANNEL_IDS", "channel_a");
    db = new FakeFirestore();
    mocks.getAdminDb.mockReturnValue(db);
    mocks.getAdminBaseUrl.mockReturnValue("https://admin.example.com");
    mocks.resolveServerTenantContext.mockReturnValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
    });
  });

  it("updates only configured channels when invoice numbers collide", async () => {
    db.seed("channels/channel_a/orders/order_a", {
      channelId: "channel_a",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      number: "A-1",
      paymentDocumentId: "FV/1/2026",
      paymentStatus: PaymentStatus.PENDING,
    });
    db.seed("channels/channel_b/orders/order_b", {
      channelId: "channel_b",
      createdAt: new Date("2026-05-01T11:00:00.000Z"),
      number: "B-1",
      paymentDocumentId: "FV/1/2026",
      paymentStatus: PaymentStatus.PENDING,
    });

    const response = await post(
      webhookRequest({
        api_token: "webhook-secret",
        invoice: {
          kind: "vat",
          number: "FV/1/2026",
          status: "paid",
        },
      }),
    );
    const body = (await response.json()) as {
      totalOrders: number;
      updatedCount: number;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      totalOrders: 1,
      updatedCount: 1,
    });
    expect(db.read("channels/channel_a/orders/order_a")).toMatchObject({
      paymentStatus: PaymentStatus.COMPLETED,
    });
    expect(db.read("channels/channel_b/orders/order_b")).toMatchObject({
      paymentStatus: PaymentStatus.PENDING,
    });
  });

  it("fails closed when dedicated mode is not explicitly enabled", async () => {
    vi.stubEnv("FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_DEDICATED_MODE", "");
    db.seed("channels/channel_a/orders/order_a", {
      channelId: "channel_a",
      paymentDocumentId: "FV/2/2026",
      paymentStatus: PaymentStatus.PENDING,
    });

    const response = await post(
      webhookRequest({
        api_token: "webhook-secret",
        invoice: {
          kind: "vat",
          number: "FV/2/2026",
          status: "paid",
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(db.read("channels/channel_a/orders/order_a")).toMatchObject({
      paymentStatus: PaymentStatus.PENDING,
    });
  });

  it("rejects the global webhook in SaaS tenant runtime", async () => {
    mocks.resolveServerTenantContext.mockReturnValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant_a",
    });
    db.seed("channels/channel_a/orders/order_a", {
      channelId: "channel_a",
      paymentDocumentId: "FV/3/2026",
      paymentStatus: PaymentStatus.PENDING,
    });

    const response = await post(
      webhookRequest({
        api_token: "webhook-secret",
        invoice: {
          kind: "vat",
          number: "FV/3/2026",
          status: "paid",
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(db.read("channels/channel_a/orders/order_a")).toMatchObject({
      paymentStatus: PaymentStatus.PENDING,
    });
  });
});
