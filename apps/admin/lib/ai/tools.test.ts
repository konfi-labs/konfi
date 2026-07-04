import { describe, expect, it, vi } from "vitest";
import type { Attribute, NestedMember, TenantContext } from "@konfi/types";
import type { TFunction } from "i18next";
import { createAssistantTools } from "./tools";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/search", () => ({
  searchWeb: vi.fn(),
}));

vi.mock("@konfi/meilisearch", () => ({
  searchCustomersIndex: vi.fn(),
}));

vi.mock("../../app/actions/fakturownia", () => ({
  getClientById: vi.fn(),
  getClients: vi.fn(),
  getInvoiceById: vi.fn(),
  getInvoices: vi.fn(),
  getOverdueInvoicesForClient: vi.fn(),
  listFakturowniaDepartments: vi.fn(),
}));

const toolLayerMocks = vi.hoisted(() => ({
  createInternalToolAuthContext: vi.fn((input: unknown) => ({
    authInput: input,
  })),
  createInternalToolRuntime: vi.fn((auth: unknown) => ({
    auth,
    runtime: true,
  })),
  searchMaterialCostsByQuery: vi.fn(async () => ({
    baseCurrency: "PLN",
    matches: [],
    noResultReason: "No approved indexed Fakturownia cost matched this query.",
    notes: [
      "Cost data contains only admin-approved Fakturownia cost mappings.",
    ],
    query: "folia bąbelkowa",
    summary: {
      sampleCount: 0,
    },
    totalReturned: 0,
  })),
  suggestOrderItems: vi.fn(),
}));

vi.mock("@/lib/ai/tool-layer", () => toolLayerMocks);

const t = ((key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key) as TFunction;

const tenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
} as TenantContext;

const member: NestedMember = {
  id: "admin-1",
  name: "Admin",
};

describe("createAssistantTools", () => {
  it("exposes material cost search through the shared costs-read tool layer", async () => {
    const tools = createAssistantTools({
      attributes: [] as Attribute[],
      channelId: "channel-1",
      createdBy: member,
      firestore: {} as FirebaseFirestore.Firestore,
      t,
      tenantContext,
    });

    const materialCostTool = tools.searchFakturowniaMaterialCosts as {
      execute: (input: { query: string }) => Promise<unknown>;
    };
    const result = await materialCostTool.execute({
      query: "Ile kosztuje nas folia bąbelkowa?",
    });

    expect(toolLayerMocks.createInternalToolAuthContext).toHaveBeenCalledWith({
      channelId: "channel-1",
      createdBy: member,
      scopes: ["costs:read"],
      source: "admin-assistant",
      tenantId: "tenant-a",
    });
    expect(toolLayerMocks.searchMaterialCostsByQuery).toHaveBeenCalledWith(
      expect.objectContaining({ runtime: true }),
      {
        query: "Ile kosztuje nas folia bąbelkowa?",
      },
    );
    expect(result).toMatchObject({
      baseCurrency: "PLN",
      totalReturned: 0,
    });
  });
});
