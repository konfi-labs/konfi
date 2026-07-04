import {
  CurrencyEnum,
  PriceTypeEnum,
  RmaRequestStatus,
  Unit,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { describe, expect, it } from "vitest";
import {
  exportStarterTemplate,
  importStarterTemplate,
  rewriteStarterTemplateStoragePath,
  validateStarterTemplateManifest,
  type CollectionReferenceLike,
  type DocumentReferenceLike,
  type DocumentSnapshotLike,
  type FirestoreLike,
  type QueryLike,
  type QuerySnapshotLike,
  type ReadableDocumentReferenceLike,
  type StarterTemplateManifest,
  type WriteBatchLike,
} from "./starter-templates";

const sourceTenantContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
};

const targetTenantContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-b",
};

const dedicatedTenantContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
};

class MemoryDocumentReference implements DocumentReferenceLike {
  id: string;
  path: string;

  constructor(
    private readonly store: Map<string, Record<string, unknown>>,
    path: string,
  ) {
    this.path = path;
    this.id = path.split("/").at(-1) ?? path;
  }

  async get(): Promise<DocumentSnapshotLike> {
    return new MemoryDocumentSnapshot(this.store, this.path);
  }
}

class MemoryDocumentSnapshot implements DocumentSnapshotLike {
  id: string;
  ref: DocumentReferenceLike;

  constructor(
    private readonly store: Map<string, Record<string, unknown>>,
    path: string,
  ) {
    this.id = path.split("/").at(-1) ?? path;
    this.ref = new MemoryDocumentReference(store, path);
  }

  get exists() {
    return this.store.has(this.ref.path);
  }

  data(): Record<string, unknown> | undefined {
    const data = this.store.get(this.ref.path);
    return data ? { ...data } : undefined;
  }
}

class MemoryQuery implements QueryLike {
  constructor(
    private readonly store: Map<string, Record<string, unknown>>,
    private readonly path: string,
    private readonly filter?: {
      fieldPath: string;
      value: unknown;
    },
  ) {}

  async get(): Promise<QuerySnapshotLike> {
    const collectionDepth = this.path.split("/").length;
    const docs = Array.from(this.store.entries()).flatMap(([path, data]) => {
      const isDirectChild =
        path.startsWith(`${this.path}/`) &&
        path.split("/").length === collectionDepth + 1;
      const matchesFilter =
        !this.filter || data[this.filter.fieldPath] === this.filter.value;

      return isDirectChild && matchesFilter
        ? [new MemoryDocumentSnapshot(this.store, path)]
        : [];
    });

    return { docs };
  }
}

class MemoryCollectionReference
  extends MemoryQuery
  implements CollectionReferenceLike
{
  private readonly sourceStore: Map<string, Record<string, unknown>>;

  constructor(
    sourceStore: Map<string, Record<string, unknown>>,
    readonly path: string,
  ) {
    super(sourceStore, path);
    this.sourceStore = sourceStore;
  }

  doc(id = `doc-${this.sourceStore.size + 1}`): DocumentReferenceLike {
    return new MemoryDocumentReference(this.sourceStore, `${this.path}/${id}`);
  }

  where(fieldPath: string, opStr: "==", value: unknown): QueryLike {
    if (opStr !== "==") {
      throw new Error("Only equality filters are supported in memory tests.");
    }

    return new MemoryQuery(this.sourceStore, this.path, { fieldPath, value });
  }
}

class MemoryWriteBatch implements WriteBatchLike {
  private readonly writes: Array<{
    data: Record<string, unknown>;
    path: string;
  }> = [];

  constructor(private readonly store: Map<string, Record<string, unknown>>) {}

  set(
    ref: DocumentReferenceLike,
    data: Record<string, unknown>,
  ): WriteBatchLike {
    this.writes.push({ data, path: ref.path });
    return this;
  }

  async commit(): Promise<void> {
    for (const write of this.writes) {
      this.store.set(write.path, write.data);
    }
  }
}

class MemoryFirestore implements FirestoreLike {
  private readonly store = new Map<string, Record<string, unknown>>();
  getAllCallCount = 0;
  getAllDocumentCount = 0;

  batch(): WriteBatchLike {
    return new MemoryWriteBatch(this.store);
  }

  collection(path: string): CollectionReferenceLike {
    return new MemoryCollectionReference(this.store, path);
  }

  doc(path: string): ReadableDocumentReferenceLike {
    return new MemoryDocumentReference(this.store, path);
  }

  async getAll(
    ...documentRefs: ReadableDocumentReferenceLike[]
  ): Promise<DocumentSnapshotLike[]> {
    this.getAllCallCount += 1;
    this.getAllDocumentCount += documentRefs.length;
    return Promise.all(documentRefs.map((ref) => ref.get()));
  }

  read(path: string): Record<string, unknown> | undefined {
    return this.store.get(path);
  }

  seed(path: string, data: Record<string, unknown>): void {
    this.store.set(path, data);
  }
}

function seedStarterSource(
  db: MemoryFirestore,
  options: { includeProductType?: boolean } = {},
) {
  const channelId = "source-channel";

  db.seed(`channels/${channelId}`, {
    id: channelId,
    active: true,
    currency: CurrencyEnum.PLN,
    name: "Source channel",
    notifications: {
      email: "ops@example.com",
      token: "do-not-export",
    },
    tenantId: "tenant-a",
    warehouses: ["warehouse-1"],
  });
  db.seed(`channels/${channelId}/orders/order-1`, {
    id: "order-1",
    tenantId: "tenant-a",
  });
  db.seed(`channels/${channelId}/categories/category-1`, {
    id: "category-1",
    name: "Business cards",
    seo: {
      description: "",
      slug: "business-cards",
      title: "Business cards",
    },
    tenantId: "tenant-a",
  });
  db.seed(`channels/${channelId}/settings/buying`, {
    enabled: true,
    max: 100000,
    min: 1000,
    tenantId: "tenant-a",
  });
  db.seed(`channels/${channelId}/settings/supportTaxonomy`, {
    complaintStatuses: [
      {
        archived: false,
        colorPalette: "primary",
        enabled: true,
        icon: "fiber_new",
        id: "NEW",
        isDefault: true,
        name: "New",
        order: 0,
        resolved: false,
        terminal: false,
      },
    ],
    rmaReasonCategories: [
      {
        archived: false,
        colorPalette: "red",
        enabled: true,
        icon: "precision_manufacturing",
        id: "production-defect",
        isDefault: true,
        name: "Production Defect",
        order: 0,
      },
    ],
    rmaStatuses: [
      {
        archived: false,
        colorPalette: "yellow",
        enabled: true,
        icon: "fact_check",
        id: RmaRequestStatus.UNDER_REVIEW,
        isDefault: true,
        name: "Under Review",
        order: 1,
        resolved: false,
        terminal: false,
      },
    ],
    tenantId: "tenant-a",
  });
  db.seed(`channels/${channelId}/settings/tax`, {
    defaultCountryCode: "PL",
    enabled: false,
    regions: [
      {
        active: true,
        calculationMode: "gross",
        countryCodes: ["PL"],
        defaultRateId: "pl-standard-vat",
        id: "pl",
        name: "Poland",
        pricesIncludeTax: true,
        rates: [
          {
            active: true,
            id: "pl-standard-vat",
            name: "Standard VAT",
            percent: 23,
            priority: 0,
          },
        ],
      },
    ],
    tenantId: "tenant-a",
  });
  db.seed(`channels/${channelId}/settings/allegro`, {
    accessToken: "do-not-export",
    tenantId: "tenant-a",
  });
  db.seed("customerGroups/group-b2b", {
    id: "group-b2b",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    createdBy: {
      id: "admin-1",
      name: "Admin",
    },
    customerIds: ["customer-1"],
    description: "Business account defaults",
    name: "B2B",
    tenantId: "tenant-a",
  });
  db.seed("customerGroups/group-archived", {
    id: "group-archived",
    active: false,
    archivedAt: "2025-01-01T00:00:00.000Z",
    name: "Archived",
    tenantId: "tenant-a",
  });
  db.seed("customerGroups/other-tenant-group", {
    id: "other-tenant-group",
    active: true,
    name: "Other tenant",
    tenantId: "tenant-c",
  });
  db.seed(`channels/${channelId}/products/product-1`, {
    id: "product-1",
    active: true,
    allowCustomPrice: false,
    attributeOptions: {
      paper: ["mat"],
    },
    attributes: ["paper"],
    availability: {
      availableForPurchase: true,
      expiration: "2026-01-01T00:00:00.000Z",
      publication: "2024-01-01T00:00:00.000Z",
      published: true,
    },
    averageRating: 4.8,
    category: {
      id: "category-1",
      name: "Business cards",
    },
    customSize: false,
    customSizes: [],
    defaultPrice: {
      currency: CurrencyEnum.PLN,
      value: 9999,
    },
    description: "Starter product",
    difficulty: 1,
    highPrice: {
      currency: CurrencyEnum.PLN,
      value: 9999,
    },
    linkedChannels: ["linked-channel"],
    linkedWarehouses: ["warehouse-1"],
    lowPrice: {
      currency: CurrencyEnum.PLN,
      value: 9999,
    },
    name: "Business cards",
    prefferedUnit: Unit.PCS,
    priceType: PriceTypeEnum.MATRIX,
    prices: [
      {
        currency: CurrencyEnum.PLN,
        value: 9999,
      },
    ],
    productType: {
      attributes: ["paper"],
      id: "businessCard",
      isShippable: true,
      name: "Business card",
    },
    recommended: true,
    secretToken: "do-not-export",
    seo: {
      description: "",
      slug: "business-cards",
      title: "Business cards",
    },
    shipping: {
      types: ["COURIER"],
    },
    spec: {
      defaultOrder: 100,
      images: ["cover.png", "ai-generated.png", "nested/path.png"],
      maximumOrder: 1000,
      minimumOrder: 1,
      step: 100,
    },
    tenantId: "tenant-a",
    volumes: [
      {
        printType: "DIGITAL",
        value: 100,
      },
    ],
  });
  db.seed(`channels/${channelId}/products/product-1/prices/paper-mat`, {
    id: "paper-mat",
    channelId,
    prices: [
      {
        combination: {
          active: true,
          customFormat: false,
          id: "paper-mat",
        },
        currency: CurrencyEnum.PLN,
        value: 1200,
        volume: {
          deliveryTime: 2,
          value: 100,
        },
      },
    ],
    productId: "product-1",
    tenantId: "tenant-a",
  });
  db.seed("attributes/paper", {
    id: "paper",
    active: true,
    calculated: true,
    format: false,
    name: "Paper",
    options: [
      {
        customFormat: false,
        hidden: false,
        label: "Mat",
        value: "mat",
      },
    ],
    required: true,
    secretToken: "do-not-export",
    tenantId: "tenant-a",
    trackStock: false,
    type: "RADIO_GROUP",
  });
  if (options.includeProductType ?? true) {
    db.seed("productTypes/businessCard", {
      id: "businessCard",
      active: true,
      attributes: ["paper"],
      isShippable: true,
      name: "Business card",
      tenantId: "tenant-a",
    });
  }
}

async function exportSeededManifest() {
  const db = new MemoryFirestore();
  seedStarterSource(db);

  return exportStarterTemplate({
    db,
    exportedAt: new Date("2026-05-16T10:00:00.000Z"),
    name: "Print starter",
    sourceChannelId: "source-channel",
    sourceTenantContext,
  });
}

describe("starter template export/import", () => {
  it("exports only allowlisted sanitized starter data", async () => {
    const manifest = await exportSeededManifest();
    const product = manifest.resources.find(
      (document) => document.resource === "product",
    );
    const customerGroups = manifest.resources.filter(
      (document) => document.resource === "customerGroup",
    );
    const settings = manifest.resources.filter(
      (document) => document.resource === "channelSetting",
    );
    const serialized = JSON.stringify(manifest);

    expect(product?.data.spec).toEqual({
      defaultOrder: 100,
      images: ["cover.png"],
      maximumOrder: 1000,
      minimumOrder: 1,
      step: 100,
    });
    expect(product?.data).not.toHaveProperty("defaultPrice");
    expect(product?.data).not.toHaveProperty("averageRating");
    expect(product?.data).not.toHaveProperty("linkedChannels");
    expect(product?.data.availability).toEqual({
      availableForPurchase: true,
      published: true,
    });
    expect(customerGroups).toEqual([
      {
        data: {
          active: true,
          description: "Business account defaults",
          id: "group-b2b",
          name: "B2B",
        },
        id: "group-b2b",
        resource: "customerGroup",
        sourcePath: "customerGroups/group-b2b",
      },
    ]);
    expect(settings.map((document) => document.id)).toEqual([
      "buying",
      "supportTaxonomy",
      "tax",
    ]);
    expect(
      settings.find((document) => document.id === "supportTaxonomy")?.data,
    ).toMatchObject({
      rmaReasonCategories: [
        {
          id: "production-defect",
          name: "Production Defect",
        },
      ],
      rmaStatuses: [
        {
          id: RmaRequestStatus.UNDER_REVIEW,
          name: "Under Review",
        },
      ],
    });
    expect(
      settings.find((document) => document.id === "tax")?.data,
    ).toMatchObject({
      enabled: false,
      regions: [
        {
          id: "pl",
          rates: [
            {
              id: "pl-standard-vat",
              percent: 23,
            },
          ],
        },
      ],
    });
    expect(serialized).not.toContain("do-not-export");
    expect(serialized).not.toContain("order-1");
    expect(serialized).not.toContain("ops@example.com");
    expect(serialized).not.toContain("customer-1");
    expect(serialized).not.toContain("Archived");
    expect(serialized).not.toContain("Other tenant");
    expect(manifest.storagePolicy).toEqual({
      includeObjects: false,
      productMedia: "filename-only",
    });
  });

  it("imports a new SaaS tenant channel with tenant, id, and channel rewrites", async () => {
    const manifest = await exportSeededManifest();
    const targetDb = new MemoryFirestore();
    const result = await importStarterTemplate({
      actor: {
        id: "admin-1",
        name: "Admin",
      },
      db: targetDb,
      importedAt: new Date("2026-05-16T11:00:00.000Z"),
      manifest,
      targetChannelId: "target-channel",
      targetTenantContext,
    });
    const channel = targetDb.read("channels/target-channel");
    const attribute = targetDb.read("attributes/tenant-b_paper");
    const customerGroup = targetDb.read("customerGroups/tenant-b_group-b2b");
    const productType = targetDb.read("productTypes/tenant-b_businessCard");
    const product = targetDb.read("channels/target-channel/products/product-1");
    const supportTaxonomy = targetDb.read(
      "channels/target-channel/settings/supportTaxonomy",
    );
    const tax = targetDb.read("channels/target-channel/settings/tax");
    const price = targetDb.read(
      "channels/target-channel/products/product-1/prices/paper-mat",
    );

    expect(result.idRewrites).toEqual({
      attributes: {
        paper: "tenant-b_paper",
      },
      productTypes: {
        businessCard: "tenant-b_businessCard",
      },
    });
    expect(targetDb.getAllCallCount).toBe(1);
    expect(targetDb.getAllDocumentCount).toBe(manifest.resources.length);
    expect(channel).toMatchObject({
      id: "target-channel",
      tenantId: "tenant-b",
      warehouses: [],
    });
    expect(attribute).toMatchObject({
      id: "tenant-b_paper",
      tenantId: "tenant-b",
    });
    expect(customerGroup).toMatchObject({
      active: true,
      customerIds: [],
      description: "Business account defaults",
      id: "tenant-b_group-b2b",
      name: "B2B",
      tenantId: "tenant-b",
    });
    expect(customerGroup).not.toHaveProperty("archivedAt");
    expect(productType).toMatchObject({
      attributes: ["tenant-b_paper"],
      id: "tenant-b_businessCard",
      tenantId: "tenant-b",
    });
    expect(product).toMatchObject({
      attributeOptions: {
        "tenant-b_paper": ["mat"],
      },
      attributes: ["tenant-b_paper"],
      channelId: "target-channel",
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        value: 1200,
      },
      id: "product-1",
      linkedChannels: [],
      linkedWarehouses: [],
      prices: [],
      productType: {
        attributes: ["tenant-b_paper"],
        id: "tenant-b_businessCard",
      },
      tenantId: "tenant-b",
    });
    expect(price).toMatchObject({
      channelId: "target-channel",
      productId: "product-1",
      tenantId: "tenant-b",
    });
    expect(supportTaxonomy).toMatchObject({
      rmaReasonCategories: [
        {
          id: "production-defect",
        },
      ],
      rmaStatuses: [
        {
          id: RmaRequestStatus.UNDER_REVIEW,
        },
      ],
      tenantId: "tenant-b",
    });
    expect(tax).toMatchObject({
      enabled: false,
      tenantId: "tenant-b",
    });
  });

  it("chunks target existence checks for large imports", async () => {
    const manifest = await exportSeededManifest();
    const extraSettings: StarterTemplateManifest["resources"] = Array.from(
      { length: 801 },
      (_, index) => ({
        data: {
          enabled: true,
          id: `extra-${index}`,
        },
        id: `extra-${index}`,
        resource: "channelSetting",
        sourcePath: `channels/source-channel/settings/extra-${index}`,
      }),
    );
    const largeManifest: StarterTemplateManifest = {
      ...manifest,
      resources: [...manifest.resources, ...extraSettings],
    };
    const targetDb = new MemoryFirestore();

    await importStarterTemplate({
      actor: {
        id: "admin-1",
        name: "Admin",
      },
      db: targetDb,
      manifest: largeManifest,
      targetChannelId: "target-channel",
      targetTenantContext,
    });

    expect(targetDb.getAllCallCount).toBe(3);
    expect(targetDb.getAllDocumentCount).toBe(largeManifest.resources.length);
  });

  it("rejects imports when a target document already exists", async () => {
    const manifest = await exportSeededManifest();
    const targetDb = new MemoryFirestore();

    targetDb.seed("channels/target-channel", {
      id: "target-channel",
    });

    await expect(
      importStarterTemplate({
        actor: {
          id: "admin-1",
          name: "Admin",
        },
        db: targetDb,
        manifest,
        targetChannelId: "target-channel",
        targetTenantContext,
      }),
    ).rejects.toThrow(
      "Starter template target already exists: channels/target-channel.",
    );
    expect(targetDb.getAllCallCount).toBe(1);
    expect(targetDb.read("attributes/tenant-b_paper")).toBeUndefined();
  });

  it("exports embedded product types when the referenced root document is missing", async () => {
    const db = new MemoryFirestore();
    seedStarterSource(db, { includeProductType: false });

    const manifest = await exportStarterTemplate({
      db,
      exportedAt: new Date("2026-05-16T10:00:00.000Z"),
      name: "Print starter",
      sourceChannelId: "source-channel",
      sourceTenantContext,
    });
    const productType = manifest.resources.find(
      (document) => document.resource === "productType",
    );

    expect(productType).toMatchObject({
      data: {
        active: true,
        attributes: ["paper"],
        id: "businessCard",
        isShippable: true,
        name: "Business card",
      },
      id: "businessCard",
      sourcePath: "productTypes/businessCard",
    });

    const targetDb = new MemoryFirestore();
    const result = await importStarterTemplate({
      actor: {
        id: "admin-1",
        name: "Admin",
      },
      db: targetDb,
      importedAt: new Date("2026-05-16T11:00:00.000Z"),
      manifest,
      targetChannelId: "target-channel",
      targetTenantContext,
    });

    expect(result.idRewrites.productTypes).toEqual({
      businessCard: "tenant-b_businessCard",
    });
    expect(targetDb.read("productTypes/tenant-b_businessCard")).toMatchObject({
      attributes: ["tenant-b_paper"],
      id: "tenant-b_businessCard",
      tenantId: "tenant-b",
    });
    expect(
      targetDb.read("channels/target-channel/products/product-1"),
    ).toMatchObject({
      productType: {
        id: "tenant-b_businessCard",
      },
    });
  });

  it("keeps dedicated imports on legacy unscoped Firestore and storage paths", async () => {
    const manifest = await exportSeededManifest();
    const targetDb = new MemoryFirestore();

    await importStarterTemplate({
      actor: {
        id: "admin-1",
        name: "Admin",
      },
      db: targetDb,
      manifest,
      targetChannelId: "dedicated-channel",
      targetTenantContext: dedicatedTenantContext,
    });

    expect(targetDb.read("attributes/paper")).toMatchObject({
      id: "paper",
    });
    expect(targetDb.read("attributes/paper")).not.toHaveProperty("tenantId");
    expect(targetDb.read("channels/dedicated-channel")).not.toHaveProperty(
      "tenantId",
    );
    expect(
      targetDb.read("channels/dedicated-channel/settings/supportTaxonomy"),
    ).not.toHaveProperty("tenantId");
    expect(
      targetDb.read("channels/dedicated-channel/settings/tax"),
    ).toMatchObject({
      enabled: false,
    });
    expect(
      rewriteStarterTemplateStoragePath({
        path: "tenants/tenant-a/images/channels/source-channel/products/product-1/cover.png",
        sourceChannelId: "source-channel",
        sourceTenantId: "tenant-a",
        targetChannelId: "dedicated-channel",
        targetTenantContext: dedicatedTenantContext,
      }),
    ).toBe("images/channels/dedicated-channel/products/product-1/cover.png");
  });

  it("rewrites SaaS storage paths and rejects generated media", () => {
    expect(
      rewriteStarterTemplateStoragePath({
        path: "tenants/tenant-a/images/channels/source-channel/products/product-1/cover.png",
        sourceChannelId: "source-channel",
        sourceTenantId: "tenant-a",
        targetChannelId: "target-channel",
        targetTenantContext,
      }),
    ).toBe(
      "tenants/tenant-b/images/channels/target-channel/products/product-1/cover.png",
    );

    expect(() =>
      rewriteStarterTemplateStoragePath({
        path: "tenants/tenant-a/images/channels/source-channel/products/product-1/ai-generated.png",
        sourceChannelId: "source-channel",
        sourceTenantId: "tenant-a",
        targetChannelId: "target-channel",
        targetTenantContext,
      }),
    ).toThrow("Generated or operational storage paths cannot be imported");
  });

  it("rejects manifests with operational paths", async () => {
    const manifest = await exportSeededManifest();

    manifest.resources.push({
      data: {
        id: "order-1",
      },
      id: "order-1",
      resource: "product",
      sourcePath: "channels/source-channel/orders/order-1",
    });

    expect(() => validateStarterTemplateManifest(manifest)).toThrow(
      "Starter template path is not allowed",
    );
  });

  it("rejects manifests with sensitive keys", async () => {
    const manifest: StarterTemplateManifest = await exportSeededManifest();

    manifest.resources.push({
      data: {
        apiToken: "do-not-import",
        id: "product-2",
        name: "Unsafe product",
      },
      id: "product-2",
      resource: "product",
      sourcePath: "channels/source-channel/products/product-2",
    });

    expect(() => validateStarterTemplateManifest(manifest)).toThrow(
      "Starter template contains a sensitive key",
    );
  });
});
