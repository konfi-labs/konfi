import { describe, expect, it, vi } from "vitest";
import {
  buildAllegroExportStoredOfferId,
  createAllegroExportStoredOfferData,
} from "../allegro-export-offers";
import {
  CurrencyEnum,
  PriceTypeEnum,
  Product,
  ShippingTypes,
  Unit,
} from "@konfi/types";
import { Timestamp } from "firebase/firestore";

vi.mock("@/lib/firebase/clientApp", () => ({
  firestore: {},
}));

vi.mock("@konfi/firebase", () => ({
  db: {
    collection: vi.fn(),
    doc: vi.fn(),
  },
}));

function createProduct(): Product {
  const timestamp = Timestamp.now();

  return {
    id: "product/with:unsafe-id",
    active: true,
    allowCustomPrice: false,
    attributeDependencies: {},
    attributeOptions: {},
    attributes: [],
    availability: {
      availableForPurchase: true,
      published: true,
    },
    category: { id: "category-1", name: "Print" },
    createdAt: timestamp,
    createdBy: {
      active: true,
      createdAt: timestamp,
      id: "member-1",
      name: "Admin",
      updatedAt: timestamp,
    },
    customSize: false,
    defaultPrice: { currency: CurrencyEnum.PLN, value: 1000 },
    description: "",
    difficulty: 1,
    highPrice: { currency: CurrencyEnum.PLN, value: 1000 },
    keywords: [],
    lowPrice: { currency: CurrencyEnum.PLN, value: 1000 },
    name: "Business cards",
    prefferedUnit: Unit.PCS,
    prices: [],
    priceType: PriceTypeEnum.MATRIX,
    productType: null,
    recommended: false,
    seo: {
      description: "",
      slug: "business-cards",
      title: "Business cards",
    },
    shipping: {
      types: [ShippingTypes.COURIER],
    },
    spec: {
      defaultOrder: 100,
      images: [],
      maximumOrder: 1000,
      minimumOrder: 100,
      step: 100,
    },
    updatedAt: timestamp,
    updatedBy: {
      active: true,
      createdAt: timestamp,
      id: "member-1",
      name: "Admin",
      updatedAt: timestamp,
    },
    volumes: [{ value: 100 }],
  };
}

describe("allegro export stored offers", () => {
  it("builds stable safe Firestore document ids from product, category, and selection", () => {
    const selectionId = "paper:silk|volume:100|pages:none";

    expect(
      buildAllegroExportStoredOfferId({
        categoryId: "260734",
        productId: "product/with:unsafe-id",
        selectionId,
      }),
    ).toBe(
      buildAllegroExportStoredOfferId({
        categoryId: "260734",
        productId: "product/with:unsafe-id",
        selectionId,
      }),
    );
    expect(
      buildAllegroExportStoredOfferId({
        categoryId: "260734",
        productId: "product/with:unsafe-id",
        selectionId,
      }),
    ).not.toContain("/");
    expect(
      buildAllegroExportStoredOfferId({
        categoryId: "260734",
        productId: "product/with:unsafe-id",
        selectionId,
      }),
    ).toMatch(/^allegroExportOffer_/);
    expect(
      buildAllegroExportStoredOfferId({
        categoryId: "123456",
        productId: "product/with:unsafe-id",
        selectionId,
      }),
    ).not.toBe(
      buildAllegroExportStoredOfferId({
        categoryId: "260734",
        productId: "product/with:unsafe-id",
        selectionId,
      }),
    );
  });

  it("stores the configuration identity needed to regenerate an offer later", () => {
    const now = Timestamp.now();
    const storedOffer = createAllegroExportStoredOfferData({
      channelId: "channel-1",
      now,
      input: {
        calculatedCombination: "silk",
        categoryId: "260734",
        categoryParametersLoaded: true,
        combination: "silk",
        combinationDescription: "Paper: silk",
        formattedPrice: "10.00 PLN",
        priceAmountMinor: 1000,
        product: createProduct(),
        previewOffer: {
          configurationId: "paper:silk|volume:100|pages:none",
          fingerprint:
            "allegro-export|product/with:unsafe-id|260734|paper:silk|volume:100|pages:none",
          mappings: [
            {
              attributeId: "paper",
              attributeName: "Paper",
              parameterId: "parameter-paper",
              parameterName: "Paper",
              status: "mapped",
              valueLabel: "Silk",
            },
          ],
          title: "Business cards Silk 100 pcs",
          warnings: [],
        },
        selectedCategory: {
          id: "260734",
          name: "Business cards",
          path: ["Company", "Printing", "Business cards"],
        },
        selection: {
          id: "paper:silk|volume:100|pages:none",
          pageCount: null,
          selectedAttributeOptions: { paper: "silk" },
          volume: 100,
        },
      },
    });

    expect(storedOffer.channelId).toBe("channel-1");
    expect(storedOffer.productId).toBe("product/with:unsafe-id");
    expect(storedOffer.categoryId).toBe("260734");
    expect(storedOffer.kind).toBe("allegroExportOffer");
    expect(storedOffer.selection.selectedAttributeOptions).toEqual({
      paper: "silk",
    });
    expect(storedOffer.calculatedCombination).toBe("silk");
    expect(storedOffer.priceAmountMinor).toBe(1000);
    expect(storedOffer.status).toBe("draft");
    expect(storedOffer.updatedAt).toBe(now);
  });
});
