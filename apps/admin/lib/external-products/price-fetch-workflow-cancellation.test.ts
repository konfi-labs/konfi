import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockGetFirebaseAdminApp = vi.fn(() => ({}));
  const mockGet = vi.fn();
  const mockDoc = vi.fn(() => ({
    get: mockGet,
  }));
  const mockCollection = vi.fn(() => ({
    doc: mockDoc,
  }));
  const mockGetFirestore = vi.fn(() => ({
    collection: mockCollection,
  }));

  return {
    mockGetFirebaseAdminApp,
    mockGet,
    mockDoc,
    mockCollection,
    mockGetFirestore,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetFirestore,
  getFirebaseAdminApp: mocks.mockGetFirebaseAdminApp,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mocks.mockGetFirestore,
}));

import {
  abortActiveExternalProductPriceFetchWorkflowRun,
  createExternalProductPriceFetchWorkflowCancellation,
  ExternalProductPriceFetchWorkflowCancelledError,
} from "./price-fetch-workflow-cancellation";

describe("price fetch workflow cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        priceFetchWorkflow: {
          runId: "run-1",
          status: "running",
        },
      }),
    });
  });

  it("aborts immediately when the run is cancelled in-process", async () => {
    const cancellation = createExternalProductPriceFetchWorkflowCancellation({
      externalProductId: "product-1",
      workflowRunId: "run-1",
    });

    expect(cancellation).toBeDefined();

    abortActiveExternalProductPriceFetchWorkflowRun("run-1");

    await expect(
      cancellation?.throwIfCancelled("fetching external prices"),
    ).rejects.toBeInstanceOf(ExternalProductPriceFetchWorkflowCancelledError);

    expect(mocks.mockGet).not.toHaveBeenCalled();
    cancellation?.dispose();
  });

  it("detects a remotely persisted cancelled workflow", async () => {
    mocks.mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        priceFetchWorkflow: {
          runId: "run-1",
          status: "cancelled",
        },
      }),
    });

    const cancellation = createExternalProductPriceFetchWorkflowCancellation({
      externalProductId: "product-1",
      workflowRunId: "run-1",
    });

    expect(cancellation).toBeDefined();

    await expect(
      cancellation?.throwIfCancelled("fetching external prices"),
    ).rejects.toBeInstanceOf(ExternalProductPriceFetchWorkflowCancelledError);

    expect(mocks.mockGet).toHaveBeenCalledOnce();
    cancellation?.dispose();
  });
});
