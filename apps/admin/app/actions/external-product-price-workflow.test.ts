import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockCheckAdmin = vi.fn();
  const mockGetRun = vi.fn();
  const mockUpdateTag = vi.fn();
  const mockGetFirebaseAdminApp = vi.fn(() => ({}));
  const mockGetExpectedPricingConfigurationCount = vi.fn(() => 1);
  const mockGetProviderOnlyPricingSelections = vi.fn(() => ({}));
  const mockAbortActiveExternalProductPriceFetchWorkflowRun = vi.fn();
  const mockGet = vi.fn();
  const mockUpdate = vi.fn();
  const mockDoc = vi.fn(() => ({
    get: mockGet,
    update: mockUpdate,
  }));
  const mockCollection = vi.fn(() => ({
    doc: mockDoc,
  }));
  const mockGetFirestore = vi.fn(() => ({
    collection: mockCollection,
  }));
  const mockServerTimestamp = vi.fn(() => "server-timestamp");

  return {
    mockCheckAdmin,
    mockGetRun,
    mockUpdateTag,
    mockGetFirebaseAdminApp,
    mockGetExpectedPricingConfigurationCount,
    mockGetProviderOnlyPricingSelections,
    mockAbortActiveExternalProductPriceFetchWorkflowRun,
    mockGet,
    mockUpdate,
    mockDoc,
    mockCollection,
    mockGetFirestore,
    mockServerTimestamp,
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetFirestore,
  getFirebaseAdminApp: mocks.mockGetFirebaseAdminApp,
}));

vi.mock("@/lib/external-products/provider-pricing", () => ({
  getExpectedPricingConfigurationCount:
    mocks.mockGetExpectedPricingConfigurationCount,
  getProviderOnlyPricingSelections: mocks.mockGetProviderOnlyPricingSelections,
}));

vi.mock("@/lib/external-products/price-fetch-workflow-cancellation", () => ({
  abortActiveExternalProductPriceFetchWorkflowRun:
    mocks.mockAbortActiveExternalProductPriceFetchWorkflowRun,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: mocks.mockServerTimestamp,
  },
  getFirestore: mocks.mockGetFirestore,
}));

vi.mock("next/cache", () => ({
  updateTag: mocks.mockUpdateTag,
}));

vi.mock("workflow/api", () => ({
  getRun: mocks.mockGetRun,
  start: vi.fn(),
}));

vi.mock("./index", () => ({
  checkAdmin: mocks.mockCheckAdmin,
}));

import { cancelExternalProductPriceFetchWorkflow } from "./external-product-price-workflow";

describe("cancelExternalProductPriceFetchWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        priceFetchWorkflow: {
          runId: "run-1",
          mode: "apply",
          status: "running",
          startedAt: "started-at",
          estimatedConfigurationCount: 12,
          marginPercent: 10,
          taxPercent: 23,
          discountPercent: 5,
        },
      }),
    });
    mocks.mockUpdate.mockResolvedValue(undefined);
  });

  it("cancels an active workflow and persists the cancelled state", async () => {
    const mockCancel = vi.fn().mockResolvedValue(undefined);

    mocks.mockGetRun.mockReturnValue({
      exists: Promise.resolve(true),
      status: Promise.resolve("running"),
      cancel: mockCancel,
    });

    const result = await cancelExternalProductPriceFetchWorkflow(
      "product-1",
      "run-1",
    );

    expect(result).toEqual({ success: true, status: "cancelled" });
    expect(mocks.mockCheckAdmin).toHaveBeenCalledOnce();
    expect(mockCancel).toHaveBeenCalledOnce();
    expect(
      mocks.mockAbortActiveExternalProductPriceFetchWorkflowRun,
    ).toHaveBeenCalledWith("run-1");
    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      priceFetchWorkflow: {
        runId: "run-1",
        mode: "apply",
        status: "cancelled",
        startedAt: "started-at",
        cancelRequestedAt: "server-timestamp",
        completedAt: "server-timestamp",
        estimatedConfigurationCount: 12,
        marginPercent: 10,
        taxPercent: 23,
        discountPercent: 5,
      },
      updatedAt: "server-timestamp",
    });
    expect(mocks.mockUpdateTag).toHaveBeenCalledWith("external-products");
  });

  it("returns the latest terminal status instead of cancelling a completed run", async () => {
    const mockCancel = vi.fn().mockResolvedValue(undefined);

    mocks.mockGetRun.mockReturnValue({
      exists: Promise.resolve(true),
      status: Promise.resolve("completed"),
      cancel: mockCancel,
      returnValue: Promise.resolve({
        externalProductId: "product-1",
        mode: "apply",
        fetchedConfigurationCount: 7,
      }),
    });

    const result = await cancelExternalProductPriceFetchWorkflow(
      "product-1",
      "run-1",
    );

    expect(result).toEqual({ success: true, status: "completed" });
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      priceFetchWorkflow: {
        runId: "run-1",
        mode: "apply",
        status: "completed",
        startedAt: "started-at",
        completedAt: "server-timestamp",
        estimatedConfigurationCount: 12,
        fetchedConfigurationCount: 7,
        marginPercent: 10,
        taxPercent: 23,
        discountPercent: 5,
      },
      updatedAt: "server-timestamp",
    });
  });
});
