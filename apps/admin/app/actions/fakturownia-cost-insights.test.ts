import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovedFakturowniaCostEntry } from "@konfi/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getAdminConfigFlags: vi.fn(),
  getApprovedMaterialGroupCosts: vi.fn(),
  listFakturowniaCostRecipes: vi.fn(),
  listFakturowniaMaterialGroups: vi.fn(),
  requireTenantAdminAuthContext: vi.fn(),
  resolveMaterialGroupScope: vi.fn(),
}));

vi.mock("@/actions", () => ({
  checkFakturowniaEnv: vi.fn(),
  getAdminConfigFlags: mocks.getAdminConfigFlags,
}));

vi.mock("./auth-utils", () => ({
  AdminAuthError: class AdminAuthError extends Error {},
  clearInvalidAdminAuthCookiesForError: vi.fn(),
  getTenantAdminScopeTenantId: () => "tenant-a",
  requireTenantAdminAuthContext: mocks.requireTenantAdminAuthContext,
}));

vi.mock("@/lib/fakturownia/cost-intelligence", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/fakturownia/cost-intelligence")
    >();
  return {
    ...actual,
    computeProductCostRollup: ({
      baseCurrency,
      entries,
      productId,
    }: {
      baseCurrency: string;
      entries: ApprovedFakturowniaCostEntry[];
      productId: string;
    }) => ({
      baseCurrency,
      overall:
        entries.length > 0
          ? {
              sampleCount: entries.length,
              latestUnitCostNetBase: entries[0].unitCostNet,
            }
          : { sampleCount: 0 },
      productId,
    }),
  };
});

vi.mock("@/lib/fakturownia/material-groups", () => ({
  getApprovedMaterialGroupCosts: mocks.getApprovedMaterialGroupCosts,
  listFakturowniaMaterialGroups: mocks.listFakturowniaMaterialGroups,
  resolveMaterialGroupScope: mocks.resolveMaterialGroupScope,
}));

vi.mock("@/lib/fakturownia/cost-recipes", () => ({
  listFakturowniaCostRecipes: mocks.listFakturowniaCostRecipes,
}));

import { getMaterialCostInsights } from "./fakturownia";

function entry(
  attributeId: string,
  optionValue: string,
  unitCostNet: number,
): ApprovedFakturowniaCostEntry {
  return {
    attributeId,
    confidence: 1,
    currency: "PLN",
    evidenceId: `${attributeId}-${optionValue}`,
    invoice: { id: `invoice-${attributeId}-${optionValue}` },
    optionValue,
    position: { index: 0 },
    quantity: 1,
    sourceSignals: [],
    supplier: {},
    unitCostNet,
  };
}

describe("getMaterialCostInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminConfigFlags.mockResolvedValue({
      fakturowniaApiKeyProvided: true,
    });
    mocks.requireTenantAdminAuthContext.mockResolvedValue({
      tenantContext: {},
      uid: "admin-1",
    });
    mocks.listFakturowniaMaterialGroups.mockResolvedValue([]);
    mocks.resolveMaterialGroupScope.mockImplementation(
      (_groups: unknown, attributeId: string, optionValue: string) => ({
        attributeIds: [attributeId],
        optionValues: [optionValue],
      }),
    );
    mocks.getApprovedMaterialGroupCosts.mockImplementation(
      async ({
        attributeIds,
        optionValues,
      }: {
        attributeIds: string[];
        optionValues: string[];
      }) => [
        entry(
          attributeIds[0],
          optionValues[0],
          optionValues[0] === "mat" ? 7 : 11,
        ),
      ],
    );
  });

  it("returns direct material costs when no recipe exists", async () => {
    mocks.listFakturowniaCostRecipes.mockResolvedValue([]);

    const result = await getMaterialCostInsights({
      options: [{ attributeId: "paper", optionValue: "silk" }],
    });

    expect(result?.byOption["paper:silk"]).toMatchObject({
      latestUnitCostNetBase: 11,
      sampleCount: 1,
      source: "direct",
    });
  });

  it("uses recipe components instead of the direct target cost", async () => {
    mocks.listFakturowniaCostRecipes.mockResolvedValue([
      {
        active: true,
        components: [
          { attributeId: "paper", optionValue: "silk" },
          { attributeId: "lamination", factor: 2, optionValue: "mat" },
        ],
        id: "recipe-1",
        name: "Paper + laminate",
        targetAttributeId: "finish",
        targetOptionValue: "silk-mat",
      },
    ]);

    const result = await getMaterialCostInsights({
      options: [{ attributeId: "finish", optionValue: "silk-mat" }],
    });

    expect(result?.byOption["finish:silk-mat"]).toMatchObject({
      source: "recipe",
      recipeId: "recipe-1",
      incomplete: false,
      components: [
        {
          attributeId: "paper",
          optionValue: "silk",
          factor: 1,
          bucket: { latestUnitCostNetBase: 11 },
        },
        {
          attributeId: "lamination",
          optionValue: "mat",
          factor: 2,
          bucket: { latestUnitCostNetBase: 7 },
        },
      ],
    });
    expect(mocks.getApprovedMaterialGroupCosts).not.toHaveBeenCalledWith(
      expect.objectContaining({
        attributeIds: ["finish"],
        optionValues: ["silk-mat"],
      }),
    );
  });
});
