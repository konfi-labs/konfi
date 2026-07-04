import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockProductsGet = vi.fn();
  const mockInvoiceGet = vi.fn();
  const mockInvoicesPost = vi.fn();
  const mockWarehousesGet = vi.fn();
  const mockDepartmentsGet = vi.fn();
  const mockIssuersGet = vi.fn();
  const mockIssuerByIdGet = vi.fn();
  const mockCheckFakturowniaEnv = vi.fn();
  const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
  };
  const createMockClient = () => ({
    productsJson: {
      get: mockProductsGet,
    },
    invoicesJson: {
      post: mockInvoicesPost,
    },
    invoices: {
      byId: vi.fn(() => ({
        get: mockInvoiceGet,
      })),
    },
    warehousesJson: {
      get: mockWarehousesGet,
    },
    departmentsJson: {
      get: mockDepartmentsGet,
    },
    issuersJson: {
      get: mockIssuersGet,
    },
    issuers: {
      byIdJson: vi.fn(() => ({
        get: mockIssuerByIdGet,
      })),
    },
  });

  return {
    mockProductsGet,
    mockInvoiceGet,
    mockInvoicesPost,
    mockWarehousesGet,
    mockDepartmentsGet,
    mockIssuersGet,
    mockIssuerByIdGet,
    mockCheckFakturowniaEnv,
    mockCookieStore,
    createMockClient,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mocks.mockCookieStore),
}));

vi.mock("@sblyvwx/cloud-contracts", () => ({
  buildTenantMembershipId: (tenantId: string, uid: string) =>
    `${tenantId}_${uid}`,
  TenantMembershipStatus: {
    ACTIVE: "active",
  },
  TenantRole: {
    ADMIN: "admin",
    MEMBER: "member",
    OWNER: "owner",
  },
}));

vi.mock("@konfi/types", () => ({
  PaymentType: {
    BANK_TRANSFER: "BANK_TRANSFER",
    CASH: "CASH",
    CASH_ON_DELIVERY: "CASH_ON_DELIVERY",
    CARD: "CARD",
    DEFERRED: "DEFERRED",
    ONLINE: "ONLINE",
  },
}));

vi.mock("@konfi/utils", () => ({
  FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS: {},
  normalizeCurrencyCode: vi.fn((value: unknown) =>
    typeof value === "string" && value.trim()
      ? value.trim().toUpperCase()
      : undefined,
  ),
}));

vi.mock("@konfi/fakturownia", () => ({
  ApiKeyAuthenticationProvider: vi.fn(),
  ApiKeyLocation: {
    QueryParameter: "query_parameter",
  },
  createFakturowniaClient: vi.fn(() => mocks.createMockClient()),
  FetchRequestAdapter: vi.fn(
    function FetchRequestAdapter(this: { baseUrl?: string }) {
      this.baseUrl = undefined;
    },
  ),
}));

vi.mock("@konfi/fakturownia/client/models", () => ({
  InvoiceKindObject: {
    Estimate: "estimate",
    Proforma: "proforma",
    Receipt: "receipt",
    Vat: "vat",
  },
}));

vi.mock("@konfi/fakturownia/out/client/invoicesJson", () => ({}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
  getTenantContextForRequest: vi.fn(() => ({ tenantId: "tenant-1" })),
  verifySessionCookie: vi.fn(),
}));

vi.mock("@/lib/integration-secret-crypto", () => ({
  decryptIntegrationSecret: vi.fn(() => "api-key"),
  isEncryptedIntegrationSecret: vi.fn(() => true),
}));

vi.mock("@/lib/integration-runtime-config", () => ({
  assertProcessEnvIntegrationAllowed: vi.fn(),
}));

vi.mock("@/lib/tenant-runtime", () => ({
  isSharedSaasTenantRuntime: vi.fn(() => false),
}));

vi.mock("@/lib/fakturownia/client", () => ({
  getFakturowniaClient: vi.fn(() => mocks.createMockClient()),
  getFakturowniaConfig: vi.fn(),
}));

vi.mock("./index", () => ({
  checkFakturowniaEnv: mocks.mockCheckFakturowniaEnv,
  getAdminConfigFlags: vi.fn(() => ({ fakturowniaApiKeyProvided: true })),
}));

import { AdminAuthError } from "./auth-utils";
import {
  createInvoice,
  createInvoiceAction,
  createVatInvoiceFromProforma,
  loadFakturowniaInvoiceReferenceDataAction,
  searchFakturowniaProductsAction,
  type CreateFakturowniaInvoiceParams,
} from "./fakturownia";

const minimalInvoiceInput: CreateFakturowniaInvoiceParams = {
  issueDate: "2026-06-02",
  sellDate: "2026-06-02",
  paymentTo: "2026-06-09",
  buyerName: "Buyer",
  positions: [
    {
      name: "Print",
      quantity: 1,
      priceNet: 10,
      priceGross: 12.3,
      tax: 23,
    },
  ],
};

describe("Fakturownia integration action errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockCheckFakturowniaEnv.mockResolvedValue(undefined);
    mocks.mockProductsGet.mockResolvedValue([]);
    mocks.mockInvoiceGet.mockResolvedValue(undefined);
    mocks.mockInvoicesPost.mockResolvedValue({ id: 123, number: "FV/1" });
    mocks.mockWarehousesGet.mockResolvedValue([]);
    mocks.mockDepartmentsGet.mockResolvedValue([]);
    mocks.mockIssuersGet.mockResolvedValue([]);
    mocks.mockIssuerByIdGet.mockResolvedValue(null);
  });

  it("returns a controlled auth failure and clears cookies in the server action path", async () => {
    mocks.mockCheckFakturowniaEnv.mockRejectedValue(
      new AdminAuthError("Unauthorized: Staff access required", 401),
    );

    const result = await createInvoice(minimalInvoiceInput);

    expect(result).toEqual({
      ok: false,
      reason: "auth",
      message: "Unauthorized: Staff access required",
      statusCode: 401,
    });
    expect(mocks.mockCookieStore.set).toHaveBeenCalledWith(
      "__session",
      "",
      expect.objectContaining({
        maxAge: 0,
        path: "/",
      }),
    );
  });

  it("normalizes product lookup upstream 500 failures", async () => {
    mocks.mockProductsGet.mockRejectedValueOnce(
      new Error(
        "the server returned an unexpected status code and no error class is registered for this code 500",
      ),
    );

    const result = await searchFakturowniaProductsAction("paper");

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "upstream_unavailable",
        retryable: true,
        diagnostic: {
          context: "Failed to fetch products",
          source: "fakturownia",
          statusCode: 500,
        },
      },
    });
  });

  it("returns department reference data errors without throwing", async () => {
    mocks.mockWarehousesGet.mockResolvedValueOnce([{ id: 1, name: "Main" }]);
    mocks.mockDepartmentsGet.mockRejectedValueOnce(
      new Error(
        "the server returned an unexpected status code and no error class is registered for this code 502",
      ),
    );
    mocks.mockIssuersGet.mockResolvedValueOnce([{ id: 2, name: "Issuer" }]);

    const result = await loadFakturowniaInvoiceReferenceDataAction();

    expect(result.warehouses).toHaveLength(1);
    expect(result.departments).toEqual([]);
    expect(result.issuers).toHaveLength(1);
    expect(result.errors.departments).toMatchObject({
      kind: "upstream_unavailable",
      retryable: true,
      diagnostic: {
        context: "Failed to fetch departments",
        source: "fakturownia",
        statusCode: 502,
      },
    });
  });

  it("normalizes unknown invoice creation failures", async () => {
    mocks.mockInvoicesPost.mockRejectedValueOnce({});

    const result = await createInvoiceAction(minimalInvoiceInput);

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "unknown",
        retryable: true,
        diagnostic: {
          context: "Failed to create invoice",
          source: "fakturownia",
        },
      },
    });
  });

  it("truncates overlong invoice item descriptions before posting", async () => {
    const longDescription = "Synthetic folded leaflet options ".repeat(20);

    const result = await createInvoiceAction({
      ...minimalInvoiceInput,
      kind: "estimate",
      positions: [
        {
          ...minimalInvoiceInput.positions[0]!,
          name: "Synthetic folded leaflet",
          description: longDescription,
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      data: { id: 123, number: "FV/1" },
    });
    expect(mocks.mockInvoicesPost).toHaveBeenCalledWith({
      invoice: expect.objectContaining({
        positions: [
          expect.objectContaining({
            name: "Synthetic folded leaflet",
            description: longDescription.slice(0, 256),
          }),
        ],
      }),
    });
  });

  it("does not add an explicit issuer for department-backed VAT invoices", async () => {
    const result = await createInvoiceAction({
      ...minimalInvoiceInput,
      kind: "vat",
      departmentId: 44,
      issuerId: 7,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { id: 123, number: "FV/1" },
    });
    expect(mocks.mockIssuerByIdGet).not.toHaveBeenCalled();
    expect(mocks.mockInvoicesPost).toHaveBeenCalledWith({
      invoice: expect.objectContaining({
        kind: "vat",
        departmentId: 44,
        issuers: undefined,
      }),
    });
  });

  it("does not add an explicit issuer for department-backed estimate invoices", async () => {
    const result = await createInvoiceAction({
      ...minimalInvoiceInput,
      kind: "estimate",
      departmentId: 44,
      issuerId: 7,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { id: 123, number: "FV/1" },
    });
    expect(mocks.mockIssuerByIdGet).not.toHaveBeenCalled();
    expect(mocks.mockInvoicesPost).toHaveBeenCalledWith({
      invoice: expect.objectContaining({
        kind: "estimate",
        departmentId: 44,
        issuers: undefined,
      }),
    });
  });

  it("creates a VAT invoice from proforma through the direct copy payload", async () => {
    const result = await createVatInvoiceFromProforma(321, " Operator ");

    expect(result).toMatchObject({
      ok: true,
      data: { id: 123, number: "FV/1" },
    });
    expect(mocks.mockInvoiceGet).not.toHaveBeenCalled();
    expect(mocks.mockInvoicesPost).toHaveBeenCalledWith({
      invoice: {
        copyInvoiceFrom: 321,
        kind: "vat",
        sellerPerson: "Operator",
      },
    });
  });

  it("omits seller person from the proforma copy payload when it is blank", async () => {
    const result = await createVatInvoiceFromProforma(321, " ");

    expect(result).toMatchObject({
      ok: true,
      data: { id: 123, number: "FV/1" },
    });
    expect(mocks.mockInvoiceGet).not.toHaveBeenCalled();
    expect(mocks.mockInvoicesPost).toHaveBeenCalledWith({
      invoice: {
        copyInvoiceFrom: 321,
        kind: "vat",
      },
    });
  });

  it("returns an integration error when the proforma conversion post fails", async () => {
    mocks.mockInvoicesPost.mockRejectedValueOnce(
      new Error("temporary conversion error"),
    );

    const result = await createVatInvoiceFromProforma(321, "Operator");

    expect(result).toMatchObject({
      ok: false,
      error: {
        diagnostic: {
          context: "Failed to create VAT invoice from Proforma",
        },
      },
    });
    expect(mocks.mockInvoiceGet).not.toHaveBeenCalled();
    expect(mocks.mockInvoicesPost).toHaveBeenCalledWith({
      invoice: {
        copyInvoiceFrom: 321,
        kind: "vat",
        sellerPerson: "Operator",
      },
    });
  });
});
