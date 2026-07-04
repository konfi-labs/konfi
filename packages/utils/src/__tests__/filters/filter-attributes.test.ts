import { Attribute, PriceTypeEnum, Product } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { filterAttributes } from "../../filters/filter-attributes";

describe("filterAttributes", () => {
  it("should return empty array if product is undefined", () => {
    const attributes: Attribute[] = [
      {
        id: "1",
        name: "Color",
        options: [{ value: "red", label: "Red" }],
      } as Attribute,
    ];
    expect(filterAttributes(attributes, undefined)).toEqual([]);
  });

  it("should return empty array if product is null", () => {
    const attributes: Attribute[] = [
      {
        id: "1",
        name: "Color",
        options: [{ value: "red", label: "Red" }],
      } as Attribute,
    ];
    expect(filterAttributes(attributes, null as unknown as Product)).toEqual(
      [],
    );
  });

  it("should return empty array if attributes is null", () => {
    const product: Product = {
      id: "1",
      name: "Test Product",
      attributes: ["1"],
      attributeOptions: { "1": ["red"] },
      priceType: PriceTypeEnum.MATRIX,
    } as unknown as Product;
    expect(filterAttributes(null, product)).toEqual([]);
  });

  it("should filter attributes according to product data for matrix pricing", () => {
    const attributes: Attribute[] = [
      {
        id: "1",
        name: "Color",
        options: [
          { value: "red", label: "Red" },
          { value: "blue", label: "Blue" },
          { value: "green", label: "Green" },
        ],
      } as Attribute,
      {
        id: "2",
        name: "Size",
        options: [
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
        ],
      } as Attribute,
    ];

    const product: Product = {
      id: "1",
      name: "Test Product",
      attributes: ["1"],
      attributeOptions: { "1": ["red", "blue"] },
      priceType: PriceTypeEnum.MATRIX,
    } as unknown as Product;

    const expectedResult = [
      {
        id: "1",
        name: "Color",
        options: [
          { value: "red", label: "Red" },
          { value: "blue", label: "Blue" },
        ],
      },
    ];

    expect(filterAttributes(attributes, product)).toEqual(expectedResult);
  });

  it("should order attribute options according to product configuration", () => {
    const attributes: Attribute[] = [
      {
        id: "1",
        name: "Color",
        options: [
          { value: "red", label: "Red" },
          { value: "blue", label: "Blue" },
          { value: "green", label: "Green" },
        ],
      } as Attribute,
    ];

    const product: Product = {
      id: "1",
      name: "Test Product",
      attributes: ["1"],
      attributeOptions: { "1": ["blue", "purple", "red", "blue"] },
      priceType: PriceTypeEnum.MATRIX,
    } as unknown as Product;

    const result = filterAttributes(attributes, product);

    expect(result).toHaveLength(1);
    expect(result[0].options.map((option) => option.value)).toEqual([
      "blue",
      "red",
    ]);
  });

  it("should fallback to attribute options when product attributeOptions are empty", () => {
    const attributes: Attribute[] = [
      {
        id: "1",
        name: "Color",
        options: [
          { value: "red", label: "Red" },
          { value: "blue", label: "Blue" },
        ],
      } as Attribute,
    ];

    const product: Product = {
      id: "1",
      name: "Test Product",
      attributes: ["1"],
      attributeOptions: { "1": [] },
      priceType: PriceTypeEnum.MATRIX,
    } as unknown as Product;

    expect(filterAttributes(attributes, product)).toEqual([
      {
        ...attributes[0],
        options: attributes[0].options,
      },
    ]);
  });

  it("should return empty array for non-matrix pricing", () => {
    const attributes: Attribute[] = [
      {
        id: "1",
        name: "Color",
        options: [{ value: "red", label: "Red" }],
      } as Attribute,
    ];

    const product: Product = {
      id: "1",
      name: "Test Product",
      attributes: ["1"],
      attributeOptions: { "1": ["red"] },
      priceType: PriceTypeEnum.SINGLE,
    } as unknown as Product;

    expect(filterAttributes(attributes, product)).toEqual([]);
  });

  it("should return empty array if attribute not found", () => {
    const attributes: Attribute[] = [
      {
        id: "2",
        name: "Size",
        options: [{ value: "small", label: "Small" }],
      } as Attribute,
    ];

    const product: Product = {
      id: "1",
      name: "Test Product",
      attributes: ["1"],
      attributeOptions: { "1": ["red"] },
      priceType: PriceTypeEnum.MATRIX,
    } as unknown as Product;

    expect(filterAttributes(attributes, product)).toEqual([]);
  });
});
