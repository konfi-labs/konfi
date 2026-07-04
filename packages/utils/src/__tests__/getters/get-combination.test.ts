import { Attribute, PriceTypeEnum } from "@konfi/types";
import { describe, expect, it, vi } from "vitest";
import {
  getCombination,
  getDescriptiveCombination,
  resolveCalculatedCombination,
} from "../../getters/get-combination";
import { DEFAULT_COMBINATION } from "../../constants";

describe("getCombination", () => {
  // Mock attributes for testing
  const mockAttributes: Attribute[] = [
    {
      id: "color",
      name: "Color",
      calculated: false,
      options: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
        { value: "green", label: "Green" },
      ],
    } as unknown as Attribute,
    {
      id: "size",
      name: "Size",
      calculated: true,
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
    } as unknown as Attribute,
    {
      id: "material",
      name: "Material",
      calculated: false,
      options: [
        { value: "cotton", label: "Cotton" },
        { value: "polyester", label: "Polyester" },
      ],
    } as unknown as Attribute,
  ];

  it("should generate combination when splitCombination is provided", () => {
    const splitCombination = ["blue", "medium", "cotton"];

    const [combination, calculatedCombination, description, attributeOptions] =
      getCombination(mockAttributes, splitCombination);

    expect(combination).toBe("blue-medium-cotton");
    expect(calculatedCombination).toBe("medium");
    expect(description).toBe("Blue, Medium, Cotton");
    expect(attributeOptions).toEqual({
      color: "blue",
      size: "medium",
      material: "cotton",
    });
  });

  it("should use the first option of each attribute when no splitCombination or searchParams", () => {
    const [combination, calculatedCombination, description, attributeOptions] =
      getCombination(mockAttributes);

    expect(combination).toBe("red-small-cotton");
    expect(calculatedCombination).toBe("small");
    expect(description).toBe("Red, Small, Cotton");
    expect(attributeOptions).toEqual({
      color: "red",
      size: "small",
      material: "cotton",
    });
  });

  it("should fall back to the full combination for dynamic pricing when no calculated attributes exist", () => {
    expect(
      resolveCalculatedCombination({
        combination: "red-cotton",
        calculatedCombination: "",
        priceType: PriceTypeEnum.DYNAMIC,
      }),
    ).toBe("red-cotton");
  });

  it("should fall back to the default combination for dynamic pricing without attributes", () => {
    expect(
      resolveCalculatedCombination({
        combination: "",
        calculatedCombination: "",
        priceType: PriceTypeEnum.DYNAMIC,
      }),
    ).toBe(DEFAULT_COMBINATION);
  });

  it("should use searchParams when provided", () => {
    const mockSearchParams = {
      get: vi.fn((key) => {
        if (key === "color") return "green";
        if (key === "size") return "large";
        if (key === "material") return "polyester";
        return null;
      }),
    } as any;

    const [combination, calculatedCombination, description, attributeOptions] =
      getCombination(mockAttributes, undefined, mockSearchParams);

    expect(combination).toBe("green-large-polyester");
    expect(calculatedCombination).toBe("large");
    expect(description).toBe("Green, Large, Polyester");
    expect(attributeOptions).toEqual({
      color: "green",
      size: "large",
      material: "polyester",
    });
  });

  it("should handle numeric attribute values correctly", () => {
    const numericAttributes: Attribute[] = [
      {
        id: "width",
        name: "Width",
        calculated: true,
        options: [
          { value: "10", label: "10cm" },
          { value: "20", label: "20cm" },
        ],
      } as unknown as Attribute,
      {
        id: "height",
        name: "Height",
        calculated: true,
        options: [
          { value: "30", label: "30cm" },
          { value: "40", label: "40cm" },
        ],
      } as unknown as Attribute,
    ];

    const mockSearchParams = {
      get: vi.fn((key) => {
        if (key === "width") return "20";
        if (key === "height") return "40";
        return null;
      }),
    } as any;

    const [combination, calculatedCombination, description, attributeOptions] =
      getCombination(numericAttributes, undefined, mockSearchParams);

    expect(combination).toBe("20-40");
    expect(calculatedCombination).toBe("20-40");
    expect(description).toBe("20cm, 40cm");
    expect(attributeOptions).toEqual({
      width: "20",
      height: "40",
    });
  });

  it("should fall back to the first option when splitCombination includes an invalid value", () => {
    const invalidSplitCombination = ["invalid-color", "medium", "cotton"];

    const [combination, calculatedCombination, description, attributeOptions] =
      getCombination(mockAttributes, invalidSplitCombination);

    expect(combination).toBe("red-medium-cotton");
    expect(calculatedCombination).toBe("medium");
    expect(description).toBe("Red, Medium, Cotton");
    expect(attributeOptions).toEqual({
      color: "red",
      size: "medium",
      material: "cotton",
    });
  });

  it("should ignore invalid searchParams values and use defaults", () => {
    const mockSearchParams = {
      get: vi.fn((key) => {
        if (key === "color") return "invalid";
        if (key === "size") return "medium";
        if (key === "material") return "cotton";
        return null;
      }),
    } as any;

    const [combination, calculatedCombination, description, attributeOptions] =
      getCombination(mockAttributes, undefined, mockSearchParams);

    expect(combination).toBe("red-medium-cotton");
    expect(calculatedCombination).toBe("medium");
    expect(description).toBe("Red, Medium, Cotton");
    expect(attributeOptions).toEqual({
      color: "red",
      size: "medium",
      material: "cotton",
    });
  });

  it("should prefer splitCombination over searchParams when both are provided", () => {
    const splitCombination = ["red", "medium", "cotton"];

    const mockSearchParams = {
      get: vi.fn((key) => {
        if (key === "color") return "green";
        if (key === "size") return "large";
        if (key === "material") return "polyester";
        return null;
      }),
    } as any;

    const [combination] = getCombination(
      mockAttributes,
      splitCombination,
      mockSearchParams,
    );

    expect(combination).toBe("red-medium-cotton");
  });

  // Tests for dependent attributes
  it("should skip dependent attribute when dependency not met", () => {
    // material depends on size = 'medium'
    const attributeDependencies = {
      material: { dependsOn: "size", dependencyValues: ["medium"] },
    };
    const splitCombination = ["blue", "small", "cotton"];
    const [combination, calculatedCombination, description, attributeOptions] =
      getCombination(
        mockAttributes,
        splitCombination,
        undefined,
        attributeDependencies,
      );
    expect(combination).toBe("blue-small");
    expect(calculatedCombination).toBe("small");
    expect(description).toBe("Blue, Small");
    expect(attributeOptions).toEqual({ color: "blue", size: "small" });
  });

  it("should include dependent attribute when dependency met", () => {
    const attributeDependencies = {
      material: { dependsOn: "size", dependencyValues: ["medium"] },
    };
    const splitCombination = ["blue", "medium", "cotton"];
    const [combination, calculatedCombination, description, attributeOptions] =
      getCombination(
        mockAttributes,
        splitCombination,
        undefined,
        attributeDependencies,
      );
    expect(combination).toBe("blue-medium-cotton");
    expect(calculatedCombination).toBe("medium");
    expect(description).toBe("Blue, Medium, Cotton");
    expect(attributeOptions).toEqual({
      color: "blue",
      size: "medium",
      material: "cotton",
    });
  });
  describe("Enhanced description format", () => {
    it("should include attribute names when includeAttributeNames is true", () => {
      const splitCombination = ["blue", "medium", "cotton"];

      const [
        combination,
        calculatedCombination,
        description,
        attributeOptions,
      ] = getCombination(
        mockAttributes,
        splitCombination,
        undefined,
        undefined,
        true,
      );

      expect(combination).toBe("blue-medium-cotton");
      expect(calculatedCombination).toBe("medium");
      expect(description).toBe("Color: Blue, Size: Medium, Material: Cotton");
      expect(attributeOptions).toEqual({
        color: "blue",
        size: "medium",
        material: "cotton",
      });
    });

    it("should maintain default behavior when includeAttributeNames is false", () => {
      const splitCombination = ["blue", "medium", "cotton"];

      const [
        combination,
        calculatedCombination,
        description,
        attributeOptions,
      ] = getCombination(
        mockAttributes,
        splitCombination,
        undefined,
        undefined,
        false,
      );

      expect(combination).toBe("blue-medium-cotton");
      expect(calculatedCombination).toBe("medium");
      expect(description).toBe("Blue, Medium, Cotton");
      expect(attributeOptions).toEqual({
        color: "blue",
        size: "medium",
        material: "cotton",
      });
    });

    it("should work with searchParams and enhanced descriptions", () => {
      const mockSearchParams = {
        get: vi.fn((key) => {
          if (key === "color") return "green";
          if (key === "size") return "large";
          if (key === "material") return "polyester";
          return null;
        }),
      } as any;

      const [
        combination,
        calculatedCombination,
        description,
        attributeOptions,
      ] = getCombination(
        mockAttributes,
        undefined,
        mockSearchParams,
        undefined,
        true,
      );

      expect(combination).toBe("green-large-polyester");
      expect(calculatedCombination).toBe("large");
      expect(description).toBe(
        "Color: Green, Size: Large, Material: Polyester",
      );
      expect(attributeOptions).toEqual({
        color: "green",
        size: "large",
        material: "polyester",
      });
    });

    it("should handle dependent attributes with enhanced descriptions", () => {
      const attributeDependencies = {
        material: { dependsOn: "size", dependencyValues: ["medium"] },
      };
      const splitCombination = ["blue", "medium", "cotton"];

      const [
        combination,
        calculatedCombination,
        description,
        attributeOptions,
      ] = getCombination(
        mockAttributes,
        splitCombination,
        undefined,
        attributeDependencies,
        true,
      );

      expect(combination).toBe("blue-medium-cotton");
      expect(calculatedCombination).toBe("medium");
      expect(description).toBe("Color: Blue, Size: Medium, Material: Cotton");
      expect(attributeOptions).toEqual({
        color: "blue",
        size: "medium",
        material: "cotton",
      });
    });

    it("should skip dependent attributes in enhanced descriptions when dependency not met", () => {
      const attributeDependencies = {
        material: { dependsOn: "size", dependencyValues: ["medium"] },
      };
      const splitCombination = ["blue", "small", "cotton"];

      const [
        combination,
        calculatedCombination,
        description,
        attributeOptions,
      ] = getCombination(
        mockAttributes,
        splitCombination,
        undefined,
        attributeDependencies,
        true,
      );

      expect(combination).toBe("blue-small");
      expect(calculatedCombination).toBe("small");
      expect(description).toBe("Color: Blue, Size: Small");
      expect(attributeOptions).toEqual({ color: "blue", size: "small" });
    });
  });

  // Tests for getDescriptiveCombination function
  describe("getDescriptiveCombination", () => {
    it("should always include attribute names in descriptions", () => {
      const splitCombination = ["blue", "medium", "cotton"];

      const [
        combination,
        calculatedCombination,
        description,
        attributeOptions,
      ] = getDescriptiveCombination(mockAttributes, splitCombination);

      expect(combination).toBe("blue-medium-cotton");
      expect(calculatedCombination).toBe("medium");
      expect(description).toBe("Color: Blue, Size: Medium, Material: Cotton");
      expect(attributeOptions).toEqual({
        color: "blue",
        size: "medium",
        material: "cotton",
      });
    });

    it("should work with default values", () => {
      const [
        combination,
        calculatedCombination,
        description,
        attributeOptions,
      ] = getDescriptiveCombination(mockAttributes);

      expect(combination).toBe("red-small-cotton");
      expect(calculatedCombination).toBe("small");
      expect(description).toBe("Color: Red, Size: Small, Material: Cotton");
      expect(attributeOptions).toEqual({
        color: "red",
        size: "small",
        material: "cotton",
      });
    });

    it("should handle dependent attributes correctly", () => {
      const attributeDependencies = {
        material: { dependsOn: "size", dependencyValues: ["medium"] },
      };
      const splitCombination = ["blue", "small", "cotton"];

      const [
        combination,
        calculatedCombination,
        description,
        attributeOptions,
      ] = getDescriptiveCombination(
        mockAttributes,
        splitCombination,
        undefined,
        attributeDependencies,
      );

      expect(combination).toBe("blue-small");
      expect(calculatedCombination).toBe("small");
      expect(description).toBe("Color: Blue, Size: Small");
      expect(attributeOptions).toEqual({ color: "blue", size: "small" });
    });
  });
});
