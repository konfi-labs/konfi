import { Attribute } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { getAttributes } from "../../getters/get-attributes";

describe("getAttributes", () => {
  const mockAttributes: Attribute[] = [
    {
      id: "color",
      name: "Color",
      options: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
        { value: "green", label: "Green" },
      ],
    } as unknown as Attribute,
    {
      id: "size",
      name: "Size",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
    } as unknown as Attribute,
    {
      id: "material",
      name: "Material",
      options: [
        { value: "cotton", label: "Cotton" },
        { value: "polyester", label: "Polyester" },
      ],
    } as unknown as Attribute,
  ];

  it("should filter attributes based on product attributes and options", () => {
    const productAttributes = ["color", "size"];
    const productAttributeOptions = {
      color: ["red", "blue"],
      size: ["small", "medium"],
    };

    const result = getAttributes(
      mockAttributes,
      productAttributes,
      productAttributeOptions,
    );

    expect(result).toHaveLength(2);

    expect(result?.[0].id).toBe("color");
    expect(result?.[0].options).toHaveLength(2);
    expect(result?.[0].options[0].value).toBe("red");
    expect(result?.[0].options[1].value).toBe("blue");

    expect(result?.[1].id).toBe("size");
    expect(result?.[1].options).toHaveLength(2);
    expect(result?.[1].options[0].value).toBe("small");
    expect(result?.[1].options[1].value).toBe("medium");
  });

  it("should order options according to product configuration and skip unknown values", () => {
    const productAttributes = ["color"];
    const productAttributeOptions = {
      color: ["blue", "purple", "red", "blue"],
    };

    const result = getAttributes(
      mockAttributes,
      productAttributes,
      productAttributeOptions,
    );

    expect(result).toHaveLength(1);
    expect(result?.[0].options.map((option) => option.value)).toEqual([
      "blue",
      "red",
    ]);
  });

  it("should return undefined if attributes are missing", () => {
    const productAttributes = ["color", "size"];
    const productAttributeOptions = {
      color: ["red", "blue"],
      size: ["small", "medium"],
    };

    const result = getAttributes(
      null as unknown as Attribute[],
      productAttributes,
      productAttributeOptions,
    );

    expect(result).toBeUndefined();
  });

  it("should return undefined if productAttributes are missing", () => {
    const productAttributeOptions = {
      color: ["red", "blue"],
      size: ["small", "medium"],
    };

    const result = getAttributes(
      mockAttributes,
      null as unknown as string[],
      productAttributeOptions,
    );

    expect(result).toBeUndefined();
  });

  it("should return undefined if productAttributeOptions are missing", () => {
    const productAttributes = ["color", "size"];

    const result = getAttributes(
      mockAttributes,
      productAttributes,
      null as unknown as Record<string, string[]>,
    );

    expect(result).toBeUndefined();
  });
});
