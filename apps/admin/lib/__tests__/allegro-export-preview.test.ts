import { describe, expect, it } from "vitest";
import {
  buildAllegroExportParameterMappings,
  buildAllegroExportPreviewOffer,
  buildAllegroExportSelectionId,
  getProductExportAttributes,
  type AllegroCategoryParameter,
} from "../allegro-export-preview";
import {
  Attribute,
  AttributeInputTypeEnum,
  CurrencyEnum,
  Member,
  PriceTypeEnum,
  Product,
  ShippingTypes,
  Unit,
} from "@konfi/types";
import { Timestamp } from "firebase/firestore";

function createMember(): Member {
  const timestamp = Timestamp.now();

  return {
    active: true,
    createdAt: timestamp,
    id: "member-1",
    name: "Admin",
    updatedAt: timestamp,
  };
}

function createAttribute(
  id: string,
  name: string,
  values: string[],
): Attribute {
  const member = createMember();
  const timestamp = Timestamp.now();

  return {
    id,
    active: true,
    calculated: true,
    createdAt: timestamp,
    createdBy: member,
    format: false,
    keywords: [],
    name,
    options: values.map((value) => ({
      customFormat: false,
      hidden: false,
      label: value.toUpperCase(),
      value,
    })),
    required: true,
    trackStock: false,
    type: AttributeInputTypeEnum.DROPDOWN,
    updatedAt: timestamp,
    updatedBy: member,
  };
}

function createProduct(): Product {
  const member = createMember();
  const timestamp = Timestamp.now();

  return {
    id: "product-1",
    active: true,
    allowCustomPrice: false,
    attributeDependencies: {},
    attributeOptions: {
      finish: ["matte"],
      paper: ["silk", "offset"],
    },
    attributes: ["paper", "finish"],
    availability: {
      availableForPurchase: true,
      published: true,
    },
    category: { id: "category-1", name: "Print" },
    createdAt: timestamp,
    createdBy: member,
    customSize: false,
    defaultPrice: { currency: CurrencyEnum.PLN, value: 1000 },
    description: "",
    difficulty: 1,
    highPrice: { currency: CurrencyEnum.PLN, value: 1000 },
    keywords: [],
    lowPrice: { currency: CurrencyEnum.PLN, value: 1000 },
    name: "Flyers",
    pageCount: {
      coverPages: 0,
      enabled: true,
      maximum: 32,
      minimum: 4,
      step: 4,
    },
    prefferedUnit: Unit.PCS,
    prices: [],
    priceType: PriceTypeEnum.MATRIX,
    productType: null,
    recommended: false,
    seo: {
      description: "",
      slug: "flyers",
      title: "Flyers",
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
    updatedBy: member,
    volumes: [{ value: 100 }],
  };
}

describe("allegro export preview helpers", () => {
  it("limits export attributes to options enabled on the product", () => {
    const attributes = [
      createAttribute("paper", "Paper", ["silk", "offset", "recycled"]),
      createAttribute("finish", "Finish", ["matte", "gloss"]),
    ];

    const exportAttributes = getProductExportAttributes(
      createProduct(),
      attributes,
    );

    expect(exportAttributes).toHaveLength(2);
    expect(exportAttributes[0]?.options.map((option) => option.value)).toEqual([
      "silk",
      "offset",
    ]);
    expect(exportAttributes[1]?.options.map((option) => option.value)).toEqual([
      "matte",
    ]);
  });

  it("keeps base attribute options when product options are not explicit", () => {
    const attributes = [
      createAttribute("paper", "Paper", ["silk", "offset", "recycled"]),
      createAttribute("finish", "Finish", ["matte", "gloss"]),
    ];
    const product = {
      ...createProduct(),
      attributeOptions: {
        paper: ["silk"],
      },
    };

    const exportAttributes = getProductExportAttributes(product, attributes);

    expect(exportAttributes[0]?.options.map((option) => option.value)).toEqual([
      "silk",
    ]);
    expect(exportAttributes[1]?.options.map((option) => option.value)).toEqual([
      "matte",
      "gloss",
    ]);
  });

  it("maps matching category parameters and keeps unsupported values visible", () => {
    const attributes = [
      createAttribute("paper", "Paper", ["silk"]),
      createAttribute("finish", "Finish", ["matte"]),
    ];
    const parameters: AllegroCategoryParameter[] = [
      { id: "parameter-paper", name: "Paper" },
    ];

    const mappings = buildAllegroExportParameterMappings({
      attributes,
      categoryParameters: parameters,
      selection: {
        id: "selection-1",
        selectedAttributeOptions: { finish: "matte", paper: "silk" },
        volume: 100,
      },
    });

    expect(mappings).toEqual([
      {
        attributeId: "paper",
        attributeName: "Paper",
        parameterId: "parameter-paper",
        parameterName: "Paper",
        status: "mapped",
        valueLabel: "SILK",
      },
      {
        attributeId: "finish",
        attributeName: "Finish",
        parameterId: undefined,
        parameterName: undefined,
        status: "title_description_only",
        valueLabel: "MATTE",
      },
    ]);
  });

  it("builds stable selection IDs independent of attribute key order", () => {
    const left = buildAllegroExportSelectionId({
      pageCount: 8,
      selectedAttributeOptions: { paper: "silk", finish: "matte" },
      volume: 100,
    });
    const right = buildAllegroExportSelectionId({
      pageCount: 8,
      selectedAttributeOptions: { finish: "matte", paper: "silk" },
      volume: 100,
    });

    expect(left).toBe(right);
  });

  it("includes custom format dimensions in selection IDs", () => {
    const standard = buildAllegroExportSelectionId({
      pageCount: 8,
      selectedAttributeOptions: { paper: "silk" },
      volume: 100,
    });
    const custom = buildAllegroExportSelectionId({
      customFormat: true,
      height: 80,
      pageCount: 8,
      selectedAttributeOptions: { paper: "silk" },
      volume: 100,
      width: 120,
    });

    expect(custom).not.toBe(standard);
    expect(custom).toContain("format:120x80");
  });

  it("surfaces unmapped values and generated offer count inputs in preview", () => {
    const offer = buildAllegroExportPreviewOffer({
      attributes: [
        createAttribute("paper", "Paper", ["silk"]),
        createAttribute("finish", "Finish", ["matte"]),
      ],
      categoryId: "257931",
      categoryParameters: [
        { id: "parameter-paper", name: "Paper" },
        { id: "parameter-pages", name: "Number of Pages" },
      ],
      product: createProduct(),
      selection: {
        id: "selection-1",
        pageCount: 8,
        selectedAttributeOptions: { finish: "matte", paper: "silk" },
        volume: 100,
      },
    });

    expect(offer.title).toContain("Flyers");
    expect(offer.title).toContain("100 pcs");
    expect(offer.title).not.toContain("SILK");
    expect(offer.title).not.toContain("8 pages");
    expect(offer.mappings).toContainEqual({
      attributeId: "product-page-count",
      attributeName: "Page Count",
      parameterId: "parameter-pages",
      parameterName: "Number of Pages",
      status: "mapped",
      valueLabel: "8 pages",
    });
    expect(offer.warnings).toContain(
      "Finish: MATTE has no matching Allegro parameter.",
    );
    expect(offer.fingerprint).toContain("product-1");
    expect(offer.fingerprint).toContain("257931");
  });

  it("keeps long offer names under Allegro title limit with volume visible", () => {
    const offer = buildAllegroExportPreviewOffer({
      attributes: [],
      categoryId: "257931",
      categoryParameters: [],
      product: {
        ...createProduct(),
        name: "Very long premium business cards with many custom finishing options and extra descriptive words",
      },
      selection: {
        id: "selection-1",
        selectedAttributeOptions: {},
        volume: 1000,
      },
    });

    expect(offer.title.length).toBeLessThanOrEqual(75);
    expect(offer.title).toContain("1000 pcs");
  });

  it("includes custom format dimensions in offer title", () => {
    const offer = buildAllegroExportPreviewOffer({
      attributes: [],
      categoryId: "257931",
      categoryParameters: [],
      product: createProduct(),
      selection: {
        customFormat: true,
        height: 80,
        id: "selection-1",
        selectedAttributeOptions: {},
        volume: 100,
        width: 120,
      },
    });

    expect(offer.title).toContain("120 x 80 mm");
    expect(offer.title).toContain("100 pcs");
  });
});
