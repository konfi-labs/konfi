import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import { DEFAULT_ALLEGRO_PUBLICATION_SETTINGS } from "@/lib/allegro-import-settings";

vi.mock("server-only", () => ({}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, connection: vi.fn() };
});

const { mockRequireAdminAuth, mockGetAllegroAccessToken } = vi.hoisted(() => ({
  mockRequireAdminAuth: vi.fn(),
  mockGetAllegroAccessToken: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  requireAdminAuth: mockRequireAdminAuth,
}));

vi.mock("@/lib/allegro-auth", () => ({
  getAllegroAccessToken: mockGetAllegroAccessToken,
  getAllegroApiBase: vi.fn(() => "https://api.allegro.example.test"),
}));

let POST: (typeof import("./route"))["POST"];

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/allegro/product-offers", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/allegro/product-offers POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockGetAllegroAccessToken.mockResolvedValue({
      accessToken: "token",
      tokenData: {
        accessToken: "token",
        expiresAt: Date.now() + 1000,
        refreshToken: "refresh",
        userId: "user-1",
        userLogin: "seller",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("publishes a new product offer to Allegro sandbox", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "offer-1",
          publication: { status: "ACTIVATING" },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      createRequest({
        categoryId: "260734",
        configurationDescription: "Paper: silk",
        currency: "PLN",
        descriptionHtml:
          "<h1>Business cards</h1><p>Premium <b>silk</b> paper. No line break tag.</p><ul><li>Fast print</li><li>Packed safely</li></ul><h2>Konfiguracja</h2>",
        externalId: "allegro-export|product|260734|paper:silk",
        handlingTime: "P5D",
        imageUrls: ["https://cdn.example.test/image.jpg"],
        manualParameters: [
          {
            parameterId: "parameter-brand",
            parameterName: "Brand",
            valueId: "brand-konfi",
            valueLabel: "KONFI",
          },
        ],
        parameters: [
          {
            attributeId: "paper",
            attributeName: "Paper",
            describesProduct: true,
            parameterId: "parameter-paper",
            status: "mapped",
            valueLabel: "Silk",
          },
          {
            attributeId: "product-volume",
            attributeName: "Liczba sztuk w ofercie",
            parameterId: "248489",
            status: "mapped",
            valueLabel: "100",
          },
        ],
        publicationSettings: {
          ...DEFAULT_ALLEGRO_PUBLICATION_SETTINGS,
          defaultStock: 7,
          enabled: true,
          handlingTime: "P2D",
          responsibleProducerId: "producer-1",
          returnPolicyId: "return-policy-1",
          shippingRatesId: "shipping-rates-1",
        },
        priceAmountMinor: 1234,
        productName: "Business cards",
        quantity: 100,
        safetyInformationDescription: "Safe when used as intended.",
        title: "Business cards Silk 100 pcs",
      }),
    );
    const payload = (await response.json()) as {
      offerId: string;
      publicationStatus: string;
    };

    expect(response.status).toBe(200);
    expect(payload.offerId).toBe("offer-1");
    expect(payload.publicationStatus).toBe("ACTIVATING");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.allegro.example.test/sale/product-offers",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "Content-Type": "application/vnd.allegro.public.v1+json",
        }),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      afterSalesServices: { returnPolicy: { id: string } };
      delivery: { handlingTime: string; shippingRates: { id: string } };
      description: { sections: Array<{ items: Array<{ content?: string }> }> };
      external: { id: string };
      parameters: Array<{
        id: string;
        values?: string[];
        valuesIds?: string[];
      }>;
      productSet: Array<{
        product: {
          parameters: Array<{
            id: string;
            values?: string[];
            valuesIds?: string[];
          }>;
        };
        responsibleProducer: { id: string; type: string };
        safetyInformation: { description: string; type: string };
      }>;
      sellingMode: { price: { amount: string } };
      publication: { status: string };
      stock: { available: number };
      taxSettings: {
        exemption: string;
        rates: Array<{ countryCode: string; rate: string }>;
        subject: string;
      };
    };
    expect(body.external.id).toBe("allegro-export|product|260734|paper:silk");
    expect(body.sellingMode.price.amount).toBe("12.34");
    expect(body.publication.status).toBe("ACTIVE");
    expect(body.delivery.shippingRates.id).toBe("shipping-rates-1");
    expect(body.delivery.handlingTime).toBe("P5D");
    expect(body.afterSalesServices.returnPolicy.id).toBe("return-policy-1");
    expect(body.stock.available).toBe(7);
    expect(body.taxSettings).toEqual({
      exemption: "MONEY_EQUIVALENT",
      rates: [{ countryCode: "PL", rate: "23.00" }],
      subject: "GOODS",
    });
    expect(body.description.sections[0]?.items[0]?.content).toContain(
      "<h1>Business cards</h1>",
    );
    expect(body.description.sections[0]?.items[0]?.content).toContain(
      "<p>Premium <b>silk</b> paper. No line break tag.</p>",
    );
    expect(body.description.sections[0]?.items[0]?.content).not.toContain(
      "<br",
    );
    expect(body.description.sections[0]?.items[0]?.content).not.toContain(
      "&#8725;",
    );
    expect(body.description.sections[0]?.items[0]?.content).toContain(
      "<ul><li>Fast print</li><li>Packed safely</li></ul>",
    );
    expect(body.description.sections[0]?.items[0]?.content).toContain(
      "<h2>Konfiguracja</h2>",
    );
    expect(body.parameters).toContainEqual({
      id: "parameter-brand",
      valuesIds: ["brand-konfi"],
    });
    expect(body.parameters).toContainEqual({
      id: "248489",
      values: ["100"],
    });
    expect(body.productSet[0]?.product.parameters).not.toContainEqual({
      id: "248489",
      values: ["100"],
    });
    expect(body.parameters).not.toContainEqual({
      id: "parameter-paper",
      values: ["Silk"],
    });
    expect(body.productSet[0]?.product.parameters).toContainEqual({
      id: "parameter-paper",
      values: ["Silk"],
    });
    expect(body.productSet[0]?.responsibleProducer).toEqual({
      id: "producer-1",
      type: "ID",
    });
    expect(body.productSet[0]?.safetyInformation).toEqual({
      description: "Safe when used as intended.",
      type: "TEXT",
    });
  });

  it("keeps publication disabled until enabled in Allegro settings", async () => {
    const response = await POST(
      createRequest({
        categoryId: "260734",
        configurationDescription: "Paper: silk",
        currency: "PLN",
        descriptionHtml: "<p>Business cards</p>",
        externalId: "external",
        imageUrls: [],
        parameters: [],
        publicationSettings: DEFAULT_ALLEGRO_PUBLICATION_SETTINGS,
        priceAmountMinor: 1234,
        productName: "Business cards",
        quantity: 100,
        safetyInformationDescription: "Safe when used as intended.",
        title: "Business cards Silk 100 pcs",
      }),
    );

    expect(response.status).toBe(403);
    expect(mockGetAllegroAccessToken).not.toHaveBeenCalled();
  });

  it("limits Allegro external reference to 100 characters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "offer-1" }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const longExternalId = `allegro-export|${"very-long-product-id-".repeat(6)}|260734|${"attribute:value|".repeat(6)}`;
    const response = await POST(
      createRequest({
        categoryId: "260734",
        configurationDescription: "Paper: silk",
        currency: "PLN",
        descriptionHtml: "<p>Business cards</p>",
        externalId: longExternalId,
        imageUrls: [],
        parameters: [],
        publicationSettings: {
          ...DEFAULT_ALLEGRO_PUBLICATION_SETTINGS,
          enabled: true,
        },
        priceAmountMinor: 1234,
        productName: "Business cards",
        quantity: 100,
        safetyInformationDescription: "Safe when used as intended.",
        title: "Business cards Silk 100 pcs",
      }),
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      external: { id: string };
    };
    expect(response.status).toBe(200);
    expect(body.external.id).toHaveLength(100);
    expect(body.external.id).toMatch(/\|[a-f0-9]{16}$/);
  });
});
