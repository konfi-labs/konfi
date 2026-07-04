import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const deleteSentinel = { __fieldValue: "delete" };
  const serverTimestampSentinel = { __fieldValue: "serverTimestamp" };
  const timestampNowSentinel = { __timestamp: "now" };
  const vector = vi.fn((embedding: number[]) => ({ __vector: embedding }));
  class Timestamp {
    static now() {
      return timestampNowSentinel;
    }
  }
  const collection = vi.fn();
  const collectionGroup = vi.fn();
  const getAll = vi.fn();
  const runTransaction = vi.fn();
  const transactionUpdate = vi.fn();
  const getAdminDb = vi.fn(() => ({
    collection,
    collectionGroup,
    getAll,
    runTransaction,
  }));

  return {
    collection,
    collectionGroup,
    deleteSentinel,
    getAdminDb,
    getAll,
    runTransaction,
    serverTimestampSentinel,
    Timestamp,
    timestampNowSentinel,
    transactionUpdate,
    vector,
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: () => mocks.deleteSentinel,
    serverTimestamp: () => mocks.serverTimestampSentinel,
    vector: mocks.vector,
  },
  Timestamp: mocks.Timestamp,
}));

vi.mock("@/lib/ai/metered-text", () => ({
  createMeteredAdminGenerateText: vi.fn(),
}));

vi.mock("@/lib/ai/server-vertex", () => ({
  getVertexClient: vi.fn(),
}));

vi.mock("@/lib/fakturownia/client", () => ({
  getFakturowniaClient: vi.fn(),
}));

vi.mock("@/lib/product-search/semantic-product-index", () => ({
  embedGeminiEmbeddingText: vi.fn(async () => new Array(768).fill(0.1)),
  PRODUCT_SEARCH_EMBEDDING_DIMENSION: 768,
  PRODUCT_SEARCH_EMBEDDING_MODEL: "gemini-embedding-2",
}));

vi.mock("@konfi/firebase", () => ({
  MODELS: {
    GEMINI_3_FLASH_LITE: "gemini-test",
  },
}));

import {
  buildFakturowniaCostSyncStateWriteData,
  createManualFakturowniaCost,
  deactivateStaleEvidence,
  getApprovedProductCosts,
  getCostInvoiceSupplierDraft,
  listFakturowniaCostMappingSelectorProducts,
  updateFakturowniaCostMappingStatus,
} from "./cost-intelligence";
import { getFakturowniaClient } from "@/lib/fakturownia/client";

function querySnapshot(
  docs: Array<{
    id: string;
    data: () => Record<string, unknown>;
    ref?: unknown;
  }>,
) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

function queryReturning(
  docs: Array<{
    id: string;
    data: () => Record<string, unknown>;
    ref?: unknown;
  }>,
) {
  return {
    get: vi.fn(async () => querySnapshot(docs)),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    startAfter: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };
}

function docRef(id: string) {
  return { id };
}

function collectionWithDocs(
  docs: Array<{
    id: string;
    data: () => Record<string, unknown>;
    ref?: unknown;
  }>,
) {
  const query = queryReturning(docs);
  return {
    ...query,
    doc: vi.fn((id: string) => docRef(id)),
  };
}

const member = { id: "admin-1", name: "Admin" };

describe("Fakturownia cost intelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAll.mockResolvedValue([]);
    mocks.collection.mockImplementation(() => collectionWithDocs([]));
    mocks.collectionGroup.mockImplementation(() => collectionWithDocs([]));
    mocks.runTransaction.mockImplementation(async (callback) =>
      callback({
        get: vi.fn(async () => ({
          data: () => ({
            attributeId: "paper",
            attributeName: "Paper",
            combinationId: "combo-1",
            evidenceId: "evidence-1",
            optionLabel: "Silk 300",
            optionValue: "silk300",
            productId: "product-1",
            productName: "Business Cards",
            sourceSignals: ["ai_match"],
            status: "pending",
            tenantId: "tenant-a",
          }),
          exists: true,
        })),
        update: mocks.transactionUpdate,
      }),
    );
  });

  it("builds truncated sync-state writes without advancing the cursor", () => {
    const payload = buildFakturowniaCostSyncStateWriteData({
      dateTo: "2026-06-01",
      member,
      result: {
        evidenceCreatedOrUpdated: 0,
        incremental: true,
        invoicesScanned: 5000,
        pendingMappingsCreated: 0,
        positionsScanned: 0,
        truncated: true,
      },
      tenantId: "tenant-a",
      truncated: true,
    });

    expect(payload).not.toHaveProperty("lastSyncedAt");
    expect(payload).not.toHaveProperty("lastDateTo");
    expect(payload).toMatchObject({
      result: expect.objectContaining({ truncated: true }),
      tenantId: "tenant-a",
      updatedBy: member,
    });
  });

  it("builds completed sync-state writes with the next incremental cursor", () => {
    const payload = buildFakturowniaCostSyncStateWriteData({
      dateTo: "2026-06-01",
      member,
      result: {
        evidenceCreatedOrUpdated: 1,
        incremental: true,
        invoicesScanned: 1,
        pendingMappingsCreated: 0,
        positionsScanned: 1,
        truncated: false,
      },
      truncated: false,
    });

    expect(payload).toMatchObject({
      lastDateTo: "2026-06-01",
      lastSyncedAt: mocks.serverTimestampSentinel,
    });
  });

  it("clears product and attribute fields when approving a mapping as reference", async () => {
    await updateFakturowniaCostMappingStatus({
      mappingId: "mapping-1",
      member,
      reference: true,
      status: "approved",
      tenantId: "tenant-a",
    });

    expect(mocks.transactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        attributeId: mocks.deleteSentinel,
        attributeName: mocks.deleteSentinel,
        combinationId: mocks.deleteSentinel,
        optionLabel: mocks.deleteSentinel,
        optionValue: mocks.deleteSentinel,
        productId: mocks.deleteSentinel,
        productName: mocks.deleteSentinel,
        reference: true,
        status: "approved",
      }),
    );
  });

  it("indexes approved non-reference mappings for semantic material cost search", async () => {
    const semanticSet = vi.fn(async () => undefined);
    const semanticDelete = vi.fn(async () => undefined);
    mocks.collection.mockImplementation((name: string) => {
      if (name === "fakturowniaCostMappings") {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => ({
              data: () => ({
                attributeId: "material",
                attributeName: "Materiał",
                evidenceId: "evidence-1",
                id,
                optionLabel: "Folia bąbelkowa",
                optionValue: "folia-babelkowa",
                productId: "product-1",
                productName: "Opakowania",
                reference: false,
                sourceSignals: ["supplier_linked_attribute_option"],
                status: "approved",
                tenantId: "tenant-a",
              }),
              exists: true,
              id,
            })),
          })),
        };
      }

      if (name === "fakturowniaCostEvidence") {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => ({
              data: () => ({
                active: true,
                currency: "PLN",
                id,
                invoice: {
                  id: "invoice-1",
                  issueDate: "2026-02-01",
                  number: "FV/1/2026",
                },
                normalizedText: "folia babelkowa rolka",
                position: {
                  code: "BUBBLE",
                  index: 0,
                  name: "Folia bąbelkowa",
                },
                quantity: 1,
                quantityUnit: "rolka",
                source: "fakturownia",
                supplier: {
                  name: "Packaging Supplier",
                },
                tenantId: "tenant-a",
                unitCostNet: 80,
              }),
              exists: true,
              id,
            })),
          })),
        };
      }

      if (name === "fakturowniaMaterialGroups") {
        return queryReturning([
          {
            data: () => ({
              active: true,
              attributeIds: ["material"],
              name: "Materiały opakowaniowe",
              tenantId: "tenant-a",
              valueAliases: {
                "folia-babelkowa": "bubble-wrap",
              },
            }),
            id: "group-1",
          },
        ]);
      }

      if (name === "fakturowniaCostSemanticIndex") {
        return {
          doc: vi.fn(() => ({
            delete: semanticDelete,
            set: semanticSet,
          })),
        };
      }

      return collectionWithDocs([]);
    });

    await updateFakturowniaCostMappingStatus({
      mappingId: "mapping-1",
      member,
      status: "approved",
      tenantId: "tenant-a",
    });

    expect(semanticSet).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        attributeId: "material",
        embeddingDimension: 768,
        embeddingModel: "gemini-embedding-2",
        evidenceId: "evidence-1",
        mappingId: "mapping-1",
        optionValue: "folia-babelkowa",
        searchText: expect.stringContaining("Folia bąbelkowa"),
        tenantId: "tenant-a",
      }),
      { merge: true },
    );
    expect(semanticDelete).not.toHaveBeenCalled();
  });

  it("excludes reference mappings from approved product costs", async () => {
    mocks.collection.mockImplementation((name: string) => {
      if (name === "fakturowniaCostMappings") {
        return collectionWithDocs([
          {
            data: () => ({
              evidenceId: "evidence-reference",
              productId: "product-1",
              reference: true,
              sourceSignals: [],
              status: "approved",
            }),
            id: "mapping-reference",
          },
          {
            data: () => ({
              evidenceId: "evidence-cost",
              productId: "product-1",
              sourceSignals: [],
              status: "approved",
            }),
            id: "mapping-cost",
          },
        ]);
      }

      return collectionWithDocs([]);
    });
    mocks.getAll.mockResolvedValue([
      {
        data: () => ({
          active: true,
          currency: "PLN",
          evidenceId: "evidence-reference",
          id: "evidence-reference",
          invoice: { id: "invoice-reference" },
          normalizedText: "reference",
          position: { index: 0 },
          quantity: 1,
          source: "fakturownia",
          supplier: {},
          unitCostNet: 999,
        }),
        id: "evidence-reference",
      },
      {
        data: () => ({
          active: true,
          currency: "PLN",
          id: "evidence-cost",
          invoice: { id: "invoice-cost" },
          normalizedText: "cost",
          position: { index: 0 },
          quantity: 1,
          source: "fakturownia",
          supplier: {},
          unitCostNet: 10,
        }),
        id: "evidence-cost",
      },
    ]);

    const costs = await getApprovedProductCosts({
      productId: "product-1",
    });

    expect(costs).toHaveLength(1);
    expect(costs[0]?.evidenceId).toBe("evidence-cost");
    expect(costs[0]?.unitCostNet).toBe(10);
  });

  it("returns approved product costs from multi-product links", async () => {
    mocks.collection.mockImplementation((name: string) => {
      if (name === "fakturowniaCostMappings") {
        return collectionWithDocs([
          {
            data: () => ({
              evidenceId: "evidence-cost",
              productId: "product-1",
              productIds: ["product-1", "product-2"],
              productLinks: [
                {
                  attributeId: "paper",
                  attributeName: "Paper",
                  optionLabel: "Silk 300",
                  optionValue: "silk300",
                  productId: "product-1",
                  productName: "Business Cards",
                },
                {
                  attributeId: "paper",
                  attributeName: "Paper",
                  optionLabel: "Silk 300",
                  optionValue: "silk300",
                  productId: "product-2",
                  productName: "Flyers",
                },
              ],
              sourceSignals: [],
              status: "approved",
            }),
            id: "mapping-cost",
          },
        ]);
      }

      return collectionWithDocs([]);
    });
    mocks.getAll.mockResolvedValue([
      {
        data: () => ({
          active: true,
          currency: "PLN",
          id: "evidence-cost",
          invoice: { id: "invoice-cost" },
          normalizedText: "cost",
          position: { index: 0 },
          quantity: 1,
          source: "fakturownia",
          supplier: {},
          unitCostNet: 10,
        }),
        id: "evidence-cost",
      },
    ]);

    const costs = await getApprovedProductCosts({
      attributeId: "paper",
      optionValue: "silk300",
      productId: "product-2",
    });

    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({
      attributeId: "paper",
      evidenceId: "evidence-cost",
      optionValue: "silk300",
      productId: "product-2",
      productName: "Flyers",
      unitCostNet: 10,
    });
  });

  it("includes channel names in cost mapping selector products", async () => {
    mocks.collection.mockImplementation((name: string) => {
      if (name === "attributes") {
        return queryReturning([
          {
            data: () => ({
              active: true,
              name: "Material",
              options: [{ label: "Silk 300", value: "silk300" }],
              tenantId: "tenant-a",
            }),
            id: "paper",
          },
        ]);
      }

      if (name === "channels") {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => ({
              data: () => ({
                active: true,
                name: id === "channel-store" ? "Store" : "Wholesale",
                tenantId: "tenant-a",
              }),
              exists: true,
              id,
            })),
          })),
        };
      }

      if (name === "suppliers") {
        return queryReturning([]);
      }

      return collectionWithDocs([]);
    });
    mocks.collectionGroup.mockImplementation((name: string) => {
      if (name === "products") {
        return queryReturning([
          {
            data: () => ({
              active: true,
              attributes: ["paper"],
              category: { name: "Print" },
              channelId: "channel-store",
              name: "Flyer",
              tenantId: "tenant-a",
            }),
            id: "product-1",
            ref: { parent: { parent: { id: "channel-store" } } },
          },
        ]);
      }

      return collectionWithDocs([]);
    });

    const products = await listFakturowniaCostMappingSelectorProducts({
      tenantId: "tenant-a",
    });

    expect(products).toEqual([
      expect.objectContaining({
        categoryName: "Print",
        channelId: "channel-store",
        channelName: "Store",
        id: "product-1",
        name: "Flyer",
      }),
    ]);
  });

  it("prefills supplier draft from cost evidence supplier identity", async () => {
    vi.mocked(getFakturowniaClient).mockResolvedValue({
      invoices: {
        byId: () => ({
          get: vi.fn(async () => ({
            currency: "PLN",
            sellerCity: "Warszawa",
            sellerEmail: "supplier@example.com",
            sellerName: "Invoice Seller Name",
            sellerPhone: "+48123456789",
            sellerPostCode: "00-001",
            sellerStreet: "Supplier 1",
            sellerTaxNo: "123-456-78-90",
          })),
        }),
      },
    } as never);

    mocks.collection.mockImplementation((name: string) => {
      if (name === "fakturowniaCostEvidence") {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => ({
              data: () => ({
                currency: "PLN",
                id,
                invoice: { id: "invoice-1" },
                normalizedText: "cost",
                position: { index: 0 },
                quantity: 1,
                source: "fakturownia",
                supplier: {
                  name: "Evidence Supplier",
                },
                tenantId: "tenant-a",
              }),
              exists: true,
              id,
            })),
          })),
        };
      }

      if (name === "suppliers") {
        return queryReturning([]);
      }

      return collectionWithDocs([]);
    });

    const draft = await getCostInvoiceSupplierDraft({
      evidenceId: "evidence-1",
      tenantId: "tenant-a",
    });

    expect(draft).toMatchObject({
      companyName: "Evidence Supplier",
      currency: "PLN",
      email: "supplier@example.com",
      name: "Evidence Supplier",
      nip: "1234567890",
      phone: "+48123456789",
    });
    expect(draft.addresses[0]).toMatchObject({
      city: "Warszawa",
      name: "Evidence Supplier",
      street: "Supplier 1",
      type: "BILLING",
      zip: "00-001",
    });
  });

  it("creates approved manual material costs without invoice evidence", async () => {
    const evidenceWrites = new Map<string, Record<string, unknown>>();
    const mappingWrites = new Map<string, Record<string, unknown>>();
    const semanticSet = vi.fn(async () => undefined);
    const semanticDelete = vi.fn(async () => undefined);

    mocks.collection.mockImplementation((name: string) => {
      if (name === "fakturowniaCostEvidence") {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => ({
              data: () => evidenceWrites.get(id),
              exists: evidenceWrites.has(id),
              id,
            })),
            set: vi.fn(async (data: Record<string, unknown>) => {
              evidenceWrites.set(id, data);
            }),
          })),
        };
      }

      if (name === "fakturowniaCostMappings") {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => ({
              data: () => mappingWrites.get(id),
              exists: mappingWrites.has(id),
              id,
            })),
            set: vi.fn(async (data: Record<string, unknown>) => {
              mappingWrites.set(id, data);
            }),
          })),
        };
      }

      if (name === "fakturowniaMaterialGroups") {
        return queryReturning([]);
      }

      if (name === "fakturowniaCostSemanticIndex") {
        return {
          doc: vi.fn(() => ({
            delete: semanticDelete,
            set: semanticSet,
          })),
        };
      }

      return collectionWithDocs([]);
    });

    const result = await createManualFakturowniaCost({
      attributeId: "paper",
      attributeName: "Paper",
      issueDate: "2026-06-13",
      member,
      name: "Silk sheet",
      optionLabel: "Silk 300",
      optionValue: "silk300",
      packaging: {
        sheetHeightMm: 450,
        sheetWidthMm: 320,
      },
      tenantId: "tenant-a",
      unit: "sheet",
      unitCostNet: 1.25,
    });

    const evidence = evidenceWrites.get(result.evidenceId);
    const mapping = mappingWrites.get(result.mappingId);

    expect(evidence).toMatchObject({
      currency: "PLN",
      id: result.evidenceId,
      invoice: {
        id: result.evidenceId,
        issueDate: "2026-06-13",
        number: "Manual cost",
      },
      quantityUnit: "ark",
      source: "manual",
      tenantId: "tenant-a",
      unitCostNet: 1.25,
    });
    expect(mapping).toMatchObject({
      attributeId: "paper",
      confidence: 1,
      evidenceId: result.evidenceId,
      id: result.mappingId,
      optionValue: "silk300",
      packaging: {
        manual: true,
        purchaseUnit: "ark",
        sheetHeightMm: 450,
        sheetWidthMm: 320,
      },
      sourceSignals: ["manual_cost_entry"],
      status: "approved",
      tenantId: "tenant-a",
    });
    expect(semanticSet).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        attributeId: "paper",
        evidenceId: result.evidenceId,
        mappingId: result.mappingId,
        searchText: expect.stringContaining("Silk sheet"),
      }),
      { merge: true },
    );
    expect(semanticDelete).not.toHaveBeenCalled();
  });

  it("returns affected product IDs for stale active evidence and ignores references", async () => {
    const staleRef = { path: "fakturowniaCostEvidence/evidence-stale" };
    mocks.collection.mockImplementation((name: string) => {
      if (name === "fakturowniaCostEvidence") {
        return collectionWithDocs([
          {
            data: () => ({
              active: true,
              invoice: { id: "invoice-1" },
              tenantId: "tenant-a",
            }),
            id: "evidence-stale",
            ref: staleRef,
          },
        ]);
      }

      if (name === "fakturowniaCostMappings") {
        return queryReturning([
          {
            data: () => ({
              evidenceId: "evidence-stale",
              productId: "product-1",
              reference: false,
              status: "approved",
              tenantId: "tenant-a",
            }),
            id: "mapping-cost",
          },
          {
            data: () => ({
              evidenceId: "evidence-stale",
              productId: "reference-product",
              reference: true,
              status: "approved",
              tenantId: "tenant-a",
            }),
            id: "mapping-reference",
          },
          {
            data: () => ({
              evidenceId: "evidence-stale",
              productId: "other-tenant-product",
              status: "approved",
              tenantId: "tenant-b",
            }),
            id: "mapping-other-tenant",
          },
        ]);
      }

      return collectionWithDocs([]);
    });
    const writer = { set: vi.fn() };

    const affected = await deactivateStaleEvidence({
      activeEvidenceIds: new Set(),
      db: mocks.getAdminDb(),
      invoiceId: "invoice-1",
      member,
      tenantId: "tenant-a",
      writer: writer as never,
    });

    expect(Array.from(affected)).toEqual(["product-1"]);
    expect(writer.set).toHaveBeenCalledWith(
      staleRef,
      expect.objectContaining({ active: false }),
      { merge: true },
    );
  });
});
