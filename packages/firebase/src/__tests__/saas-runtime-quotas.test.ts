import {
  TenantPlanStatus,
  TenantStatus,
  type TenantContext,
} from "@sblyvwx/cloud-contracts";
import { describe, expect, it } from "vitest";
import {
  SaasRuntimeQuotaError,
  type SaasRuntimeQuotaAggregateQuery,
  type SaasRuntimeQuotaAggregateSnapshot,
  type SaasRuntimeQuotaCollectionReference,
  type SaasRuntimeQuotaDocumentReference,
  type SaasRuntimeQuotaDocumentSnapshot,
  type SaasRuntimeQuotaFirestore,
  type SaasRuntimeQuotaQuery,
  type SaasRuntimeQuotaTransaction,
  assertSaasRuntimeModuleEnabled,
  assertSaasRuntimeQuota,
  isSaasRuntimeModuleEnabled,
  recordSaasRuntimeQuotaUsage,
} from "../saas-runtime-quotas";

const dedicatedContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
};

const saasContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
};

type FakeTenant = Record<string, unknown>;

class FakeAggregateSnapshot implements SaasRuntimeQuotaAggregateSnapshot {
  constructor(private readonly countValue: number) {}

  data() {
    return { count: this.countValue };
  }
}

class FakeAggregateQuery implements SaasRuntimeQuotaAggregateQuery {
  constructor(private readonly countValue: number) {}

  async get() {
    return new FakeAggregateSnapshot(this.countValue);
  }
}

class FakeDocumentSnapshot implements SaasRuntimeQuotaDocumentSnapshot {
  constructor(private readonly value?: FakeTenant) {}

  get exists() {
    return Boolean(this.value);
  }

  data() {
    return this.value;
  }
}

class FakeDocumentReference implements SaasRuntimeQuotaDocumentReference {
  constructor(
    readonly path: string,
    private readonly documents: Record<string, FakeTenant | undefined>,
  ) {}

  async get() {
    return new FakeDocumentSnapshot(this.documents[this.path]);
  }
}

class FakeQuery implements SaasRuntimeQuotaQuery {
  filters: Array<{ fieldPath: string; opStr: string; value: unknown }> = [];

  constructor(private readonly countValue = 0) {}

  count() {
    return new FakeAggregateQuery(this.countValue);
  }

  where(fieldPath: string, opStr: "==" | "!=" | "<" | ">=", value: unknown) {
    this.filters.push({ fieldPath, opStr, value });
    return this;
  }
}

class FakeCollection
  extends FakeQuery
  implements SaasRuntimeQuotaCollectionReference
{
  events: Record<string, unknown>[] = [];

  constructor(
    private readonly path: string,
    countValue: number,
    private readonly documents: Record<string, FakeTenant | undefined>,
  ) {
    super(countValue);
  }

  async add(data: Record<string, unknown>) {
    this.events.push(data);
    return { id: `event-${this.events.length}` };
  }

  doc(path: string) {
    return new FakeDocumentReference(`${this.path}/${path}`, this.documents);
  }
}

class FakeTransaction implements SaasRuntimeQuotaTransaction {
  constructor(private readonly firestore: FakeFirestore) {}

  async get(reference: SaasRuntimeQuotaDocumentReference) {
    return reference.get();
  }

  set(
    reference: SaasRuntimeQuotaDocumentReference,
    data: Record<string, unknown>,
    options?: { merge?: boolean },
  ) {
    const path = reference.path ?? "unknown";
    const existing = this.firestore.documents[path] ?? {};
    const next = options?.merge ? { ...existing, ...data } : data;

    this.firestore.documents[path] = next;
    this.firestore.writes.push({ data, path });
  }
}

class FakeFirestore implements SaasRuntimeQuotaFirestore {
  readonly documents: Record<string, FakeTenant | undefined>;
  readonly eventsCollection: FakeCollection;
  readonly writes: Array<{ data: Record<string, unknown>; path: string }> = [];

  constructor(
    private readonly tenant: FakeTenant,
    private readonly counts: Record<string, number> = {},
  ) {
    this.documents = { "tenants/tenant-a": this.tenant };
    this.eventsCollection = new FakeCollection(
      "usageEvents",
      0,
      this.documents,
    );
  }

  collection(path: string) {
    if (path === "usageEvents") {
      return this.eventsCollection;
    }

    return new FakeCollection(path, this.counts[path] ?? 0, this.documents);
  }

  collectionGroup(collectionId: string) {
    return new FakeQuery(this.counts[collectionId] ?? 0);
  }

  async runTransaction<T>(
    updateFunction: (transaction: SaasRuntimeQuotaTransaction) => Promise<T>,
  ): Promise<T> {
    return updateFunction(new FakeTransaction(this));
  }
}

function tenantFixture(overrides: FakeTenant = {}): FakeTenant {
  return {
    deploymentMode: "saas",
    id: "tenant-a",
    name: "Tenant A",
    planId: "free",
    planStatus: TenantPlanStatus.ACTIVE,
    slug: "tenant-a",
    status: TenantStatus.ACTIVE,
    ...overrides,
  };
}

function writtenEvents(fake: FakeFirestore): Record<string, unknown>[] {
  return fake.writes
    .filter((write) => write.path.startsWith("usageEvents/"))
    .map((write) => write.data);
}

function writtenSummary(fake: FakeFirestore): Record<string, unknown> {
  return fake.documents["usageSummaries/tenant-a_current"] ?? {};
}

describe("SaaS runtime quotas", () => {
  it("preserves dedicated deployments by bypassing quota reads", async () => {
    const firestore = new FakeFirestore(
      tenantFixture({
        runtimePlanSnapshot: { limits: { maxMembers: 0 } },
      }),
    );

    await expect(
      assertSaasRuntimeQuota({
        context: dedicatedContext,
        firestore,
        operation: "admin.member.create",
        resource: "members",
      }),
    ).resolves.toBeUndefined();
  });

  it("allows SaaS writes under a runtime snapshot limit", async () => {
    const tenant = tenantFixture({
      runtimePlanSnapshot: { limits: { maxMembers: 2 } },
      usage: { membersCount: 1 },
    });
    const firestore = new FakeFirestore(tenant);

    await expect(
      assertSaasRuntimeQuota({
        context: saasContext,
        firestore,
        operation: "admin.member.create",
        resource: "members",
      }),
    ).resolves.toBeUndefined();
    expect(writtenEvents(firestore)).toEqual([]);

    tenant.usage = { membersCount: 2 };
    await recordSaasRuntimeQuotaUsage({
      context: saasContext,
      firestore,
      operation: "admin.member.create",
      resource: "members",
    });
    expect(writtenEvents(firestore)).toMatchObject([
      {
        context: {
          operation: "admin.member.create",
          resourceType: "members",
        },
        deltas: [
          {
            amount: 1,
            counterValue: 2,
            key: "members.count",
            limit: 2,
            unit: "count",
          },
        ],
        source: "runtime",
        tenantId: "tenant-a",
        type: "usage.recorded",
      },
    ]);
    expect(writtenSummary(firestore)).toMatchObject({
      counters: { "members.count": 1 },
      period: "current",
      tenantId: "tenant-a",
    });
  });

  it("records and rejects SaaS writes that exceed a hard limit", async () => {
    const firestore = new FakeFirestore(
      tenantFixture({
        runtimePlanSnapshot: { limits: { maxMembers: 1 } },
        usage: { membersCount: 1 },
      }),
    );

    await expect(
      assertSaasRuntimeQuota({
        context: saasContext,
        firestore,
        operation: "admin.member.create",
        resource: "members",
      }),
    ).rejects.toBeInstanceOf(SaasRuntimeQuotaError);
    expect(writtenEvents(firestore)).toMatchObject([
      {
        attempted: 2,
        current: 1,
        hard: true,
        key: "members.count",
        limit: 1,
        reason: "hard_limit_exceeded",
        context: {
          operation: "admin.member.create",
          resourceType: "members",
        },
        tenantId: "tenant-a",
        type: "usage.limit_denied",
        unit: "count",
      },
    ]);
  });

  it("aggregates customer usage into the tenant usage summary", async () => {
    const firestore = new FakeFirestore(
      tenantFixture({
        runtimePlanSnapshot: { limits: { maxCustomers: 100 } },
        usage: { customersCount: 7 },
      }),
    );

    await recordSaasRuntimeQuotaUsage({
      context: saasContext,
      firestore,
      operation: "admin.customer.create",
      resource: "customers",
    });

    expect(writtenSummary(firestore)).toMatchObject({
      counters: { "customers.count": 1 },
      period: "current",
      tenantId: "tenant-a",
    });
    expect(writtenEvents(firestore)[0]).toMatchObject({
      aggregatedAt: expect.any(String),
      summaryId: "tenant-a_current",
      type: "usage.recorded",
    });
  });

  it("enforces configurable settings resources with explicit active counts", async () => {
    const firestore = new FakeFirestore(
      tenantFixture({
        runtimePlanSnapshot: {
          limits: {
            maxConfigurableCurrencies: 1,
            maxConfigurableStatuses: 18,
            maxConfigurableUnits: 8,
          },
        },
      }),
    );

    await expect(
      assertSaasRuntimeQuota({
        context: saasContext,
        current: 17,
        firestore,
        operation: "admin.settings.order-workflow-statuses.save",
        requested: 1,
        resource: "configurableStatuses",
      }),
    ).resolves.toBeUndefined();

    await expect(
      assertSaasRuntimeQuota({
        context: saasContext,
        current: 1,
        firestore,
        operation: "admin.settings.currencies.save",
        resource: "configurableCurrencies",
      }),
    ).rejects.toBeInstanceOf(SaasRuntimeQuotaError);

    expect(writtenEvents(firestore)).toMatchObject([
      {
        attempted: 2,
        current: 1,
        hard: true,
        key: "settings.currencies.count",
        limit: 1,
        reason: "hard_limit_exceeded",
        context: {
          operation: "admin.settings.currencies.save",
          resourceType: "configurableCurrencies",
        },
        tenantId: "tenant-a",
        type: "usage.limit_denied",
        unit: "count",
      },
    ]);
  });

  it("records configurable settings usage with settings metric keys", async () => {
    const firestore = new FakeFirestore(
      tenantFixture({
        runtimePlanSnapshot: {
          limits: { maxConfigurableUnits: 8 },
        },
      }),
    );

    await recordSaasRuntimeQuotaUsage({
      context: saasContext,
      current: 6,
      firestore,
      operation: "admin.settings.units-proofing.save",
      requested: 2,
      resource: "configurableUnits",
    });

    expect(writtenEvents(firestore)).toMatchObject([
      {
        context: {
          operation: "admin.settings.units-proofing.save",
          resourceType: "configurableUnits",
        },
        deltas: [
          {
            amount: 2,
            counterValue: 6,
            key: "settings.units.count",
            limit: 8,
            unit: "count",
          },
        ],
        source: "runtime",
        tenantId: "tenant-a",
        type: "usage.recorded",
      },
    ]);
  });

  it("enforces disabled runtime module flags", async () => {
    const firestore = new FakeFirestore(
      tenantFixture({
        runtimePlanSnapshot: {
          moduleFlags: { storefront: false },
        },
      }),
    );

    await expect(
      assertSaasRuntimeModuleEnabled({
        context: saasContext,
        firestore,
        module: "storefront",
        operation: "admin.storefront.enable",
      }),
    ).rejects.toBeInstanceOf(SaasRuntimeQuotaError);
  });

  it("honors explicit enforcement-disabled snapshots", async () => {
    const firestore = new FakeFirestore(
      tenantFixture({
        quotaEnforcementDisabled: true,
        runtimePlanSnapshot: {
          limits: { maxStorageBytes: 1 },
          moduleFlags: { externalProviderImport: false },
        },
        usage: { storageBytesUsed: 1 },
      }),
    );

    await expect(
      assertSaasRuntimeQuota({
        context: saasContext,
        firestore,
        operation: "store.cart.file-upload",
        requested: 100,
        resource: "storageBytes",
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertSaasRuntimeModuleEnabled({
        context: saasContext,
        firestore,
        module: "externalProviderImport",
        operation: "admin.external-product.import",
      }),
    ).resolves.toBeUndefined();
  });

  it("reports disabled modules without throwing for optional features", async () => {
    const firestore = new FakeFirestore(
      tenantFixture({
        runtimePlanSnapshot: {
          moduleFlags: { printingMethods: false },
        },
      }),
    );

    await expect(
      isSaasRuntimeModuleEnabled({
        context: saasContext,
        firestore,
        module: "printingMethods",
      }),
    ).resolves.toBe(false);
  });
});
