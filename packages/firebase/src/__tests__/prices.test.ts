import type { DynamicPricingConfig } from "@konfi/types";
import type { Firestore } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteProductDynamicPricing } from "../prices";

const {
  mockDeleteDoc,
  mockDbDoc,
  mockFirestoreGetDoc,
  mockSetDoc,
} = vi.hoisted(() => ({
  mockDeleteDoc: vi.fn(),
  mockDbDoc: vi.fn(),
  mockFirestoreGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  deleteDoc: mockDeleteDoc,
  doc: vi.fn(),
  getDoc: mockFirestoreGetDoc,
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: mockSetDoc,
  writeBatch: vi.fn(),
}));

vi.mock("../firestore", () => ({
  create: vi.fn(),
  db: {
    collection: vi.fn(),
    doc: mockDbDoc,
    query: vi.fn(),
  },
  update: vi.fn(),
}));

describe("deleteProductDynamicPricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbDoc.mockImplementation(
      (_firestore: Firestore, collectionPath: string, docId: string) =>
        `${collectionPath}/${docId}`,
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes the config when Firestore allows it", async () => {
    mockDeleteDoc.mockResolvedValueOnce(undefined);

    const result = await deleteProductDynamicPricing(
      {} as Firestore,
      "channel-1",
      "product-1",
    );

    expect(result).toBe(true);
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      "/channels/channel-1/products/product-1/dynamicPricing/config",
    );
    expect(mockFirestoreGetDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("falls back to disabling the config when delete is permission denied", async () => {
    const existingConfig: DynamicPricingConfig = {
      attributeRules: [],
      baseDeliveryTime: 2,
      basePrice: 49,
      enabled: true,
      globalRules: [],
      inputs: [],
      linkedPresetIds: ["preset-1"],
    };

    mockDeleteDoc.mockRejectedValueOnce({
      code: "permission-denied",
      message: "Missing or insufficient permissions.",
    });
    mockFirestoreGetDoc.mockResolvedValueOnce({
      data: () => existingConfig,
      exists: () => true,
    });
    mockSetDoc.mockResolvedValueOnce(undefined);

    const result = await deleteProductDynamicPricing(
      {} as Firestore,
      "channel-1",
      "product-1",
    );

    expect(result).toBe(true);
    expect(mockSetDoc).toHaveBeenCalledWith(
      "/channels/channel-1/products/product-1/dynamicPricing/config",
      {
        ...existingConfig,
        enabled: false,
      },
    );
  });

  it("treats a missing fallback config as already deleted", async () => {
    mockDeleteDoc.mockRejectedValueOnce({
      code: "permission-denied",
      message: "Missing or insufficient permissions.",
    });
    mockFirestoreGetDoc.mockResolvedValueOnce({
      exists: () => false,
    });

    const result = await deleteProductDynamicPricing(
      {} as Firestore,
      "channel-1",
      "product-1",
    );

    expect(result).toBe(true);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
