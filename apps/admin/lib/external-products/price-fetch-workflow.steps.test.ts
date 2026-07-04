import { beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

const mocks = vi.hoisted(() => ({
  mockFetchExternalProductPricesSystem: vi.fn(),
  mockStageExternalProductPricesForReviewSystem: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/external-products/price-fetch-system", () => ({
  fetchExternalProductPricesSystem: mocks.mockFetchExternalProductPricesSystem,
  stageExternalProductPricesForReviewSystem:
    mocks.mockStageExternalProductPricesForReviewSystem,
}));

import { runExternalProductPriceFetchStep } from "./price-fetch-workflow.steps";

describe("runExternalProductPriceFetchStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails fatally when the 1 hour runtime limit is exceeded", async () => {
    mocks.mockFetchExternalProductPricesSystem.mockResolvedValue({
      success: false,
      error:
        "Workflow exceeded maximum runtime of 1 hour while fetching batched external product prices.",
    });

    await expect(
      runExternalProductPriceFetchStep({
        externalProductId: "product-1",
        mode: "apply",
        marginPercent: 10,
        taxPercent: 23,
        discountPercent: 5,
        workflowStartedAtMs: 123,
        workflowRunId: "run-1",
      }),
    ).rejects.toBeInstanceOf(FatalError);

    expect(mocks.mockFetchExternalProductPricesSystem).toHaveBeenCalledWith(
      "product-1",
      10,
      23,
      5,
      "reuse",
      123,
      "run-1",
    );
  });

  it("passes the shared start time through stage mode", async () => {
    mocks.mockStageExternalProductPricesForReviewSystem.mockResolvedValue({
      success: true,
      priceConfigurations: [],
    });

    await expect(
      runExternalProductPriceFetchStep({
        externalProductId: "product-2",
        fetchStrategy: "full",
        mode: "stage",
        marginPercent: 0,
        taxPercent: 0,
        discountPercent: 0,
        workflowStartedAtMs: 456,
        workflowRunId: "run-2",
      }),
    ).resolves.toEqual({
      externalProductId: "product-2",
      fetchStrategy: "full",
      mode: "stage",
      fetchedConfigurationCount: 0,
    });

    expect(
      mocks.mockStageExternalProductPricesForReviewSystem,
    ).toHaveBeenCalledWith("product-2", 0, 0, 0, "full", 456, "run-2");
  });
});
