import {
  Attribute,
  AttributeInputTypeEnum,
  Configuration,
  PriceTypeEnum,
  Product,
} from "@konfi/types";
import { MockedFunction } from "vitest";
import { getCombination } from "../../getters/get-combination";
import {
  validateConfiguration,
  validateDependentAttributes,
} from "../../validators/validate-configuration";

// Mock getCombination
vi.mock("../../getters/get-combination", () => ({
  getCombination: vi
    .fn()
    .mockReturnValue([
      "combo1",
      "calcCombo1",
      "Attribute 1: Value 1",
      { attr1: "val1" },
    ]),
  resolveCalculatedCombination: vi.fn(
    ({ combination, calculatedCombination, priceType }) =>
      priceType === PriceTypeEnum.DYNAMIC
        ? calculatedCombination || combination || "default"
        : calculatedCombination || "",
  ),
}));

const mockGetCombination = getCombination as MockedFunction<
  typeof getCombination
>;

describe("validateConfiguration", () => {
  const mockProduct: Product = {
    id: "product1",
    priceType: PriceTypeEnum.MATRIX,
    spec: {
      minimumOrder: 5,
      maximumOrder: 100,
    },
  } as Product;

  const mockAttributes: Attribute[] = [
    {
      id: "attr1",
      name: "Attribute 1",
      options: [{ value: "val1", label: "Value 1" }],
    } as unknown as Attribute,
  ];

  const baseConfig: Configuration = {
    productId: "product1",
    quantity: 10,
    volume: 50,
    selectedAttributeOptions: {},
    combination: null,
    calculatedCombination: null,
    descriptionCombination: null,
  } as Configuration;

  describe("Matrix Product Type", () => {
    it("should enforce minimum quantity of 1", () => {
      const result = validateConfiguration(
        baseConfig,
        { quantity: 0 },
        mockProduct,
        mockAttributes,
      );

      expect(result.quantity).toBe(1);
    });

    it("should allow quantity below 1 when allowOutOfSpec is true", () => {
      const result = validateConfiguration(
        baseConfig,
        { quantity: 0.5 },
        mockProduct,
        mockAttributes,
        undefined,
        { allowOutOfSpec: true },
      );

      expect(result.quantity).toBe(0.5);
    });

    it("should enforce minimum volume", () => {
      const result = validateConfiguration(
        baseConfig,
        { volume: 3 }, // Less than minimum of 5
        mockProduct,
        mockAttributes,
      );

      expect(result.volume).toBe(5);
    });

    it("should enforce maximum volume", () => {
      const result = validateConfiguration(
        baseConfig,
        { volume: 150 }, // More than maximum of 100
        mockProduct,
        mockAttributes,
      );

      expect(result.volume).toBe(100);
    });

    it("should maintain valid volume", () => {
      const validVolume = 50;
      const result = validateConfiguration(
        baseConfig,
        { volume: validVolume },
        mockProduct,
        mockAttributes,
      );

      expect(result.volume).toBe(validVolume);
    });
  });

  describe("Single/Fixed Price Type", () => {
    const singlePriceProduct = {
      ...mockProduct,
      priceType: PriceTypeEnum.SINGLE,
    };

    it("should clear volume for non-matrix price types", () => {
      const result = validateConfiguration(
        baseConfig,
        {},
        singlePriceProduct,
        mockAttributes,
      );

      expect(result.volume).toBeUndefined();
    });

    it("should enforce minimum quantity", () => {
      const result = validateConfiguration(
        baseConfig,
        { quantity: 3 }, // Less than minimum of 5
        singlePriceProduct,
        mockAttributes,
      );

      expect(result.quantity).toBe(5);
    });

    it("should enforce maximum quantity", () => {
      const result = validateConfiguration(
        baseConfig,
        { quantity: 150 }, // More than maximum of 100
        singlePriceProduct,
        mockAttributes,
      );

      expect(result.quantity).toBe(100);
    });

    it("should allow quantity below 1 when allowOutOfSpec is true", () => {
      const result = validateConfiguration(
        baseConfig,
        { quantity: 0.5 },
        singlePriceProduct,
        mockAttributes,
        undefined,
        { allowOutOfSpec: true },
      );

      expect(result.quantity).toBe(0.5);
    });

    it("should maintain valid quantity", () => {
      const validQuantity = 50;
      const result = validateConfiguration(
        baseConfig,
        { quantity: validQuantity },
        singlePriceProduct,
        mockAttributes,
      );

      expect(result.quantity).toBe(validQuantity);
    });

    it("should normalize pageCount when the product enables it", () => {
      const result = validateConfiguration(
        {
          ...baseConfig,
          pageCount: 8,
        },
        { pageCount: 10 },
        {
          ...singlePriceProduct,
          pageCount: {
            enabled: true,
            minimum: 8,
            maximum: 24,
            step: 4,
            coverPages: 4,
          },
        } as Product,
        mockAttributes,
      );

      expect(result.pageCount).toBe(12);
    });

    it("should clear pageCount when the product does not enable it", () => {
      const result = validateConfiguration(
        {
          ...baseConfig,
          pageCount: 12,
        },
        {},
        singlePriceProduct,
        mockAttributes,
      );

      expect(result.pageCount).toBeUndefined();
    });
  });

  describe("Attribute Options Handling", () => {
    it("should merge new selectedAttributeOptions with existing ones", () => {
      const prevConfig = {
        ...baseConfig,
        selectedAttributeOptions: { attr1: "val1" },
      };

      const result = validateConfiguration(
        prevConfig,
        { selectedAttributeOptions: { attr2: "val2" } },
        mockProduct,
        mockAttributes,
      );

      expect(result.selectedAttributeOptions).toEqual({
        attr1: "val1",
        attr2: "val2",
      });
    });

    it("should clear combinations when selectedAttributeOptions is null", () => {
      const prevConfig = {
        ...baseConfig,
        combination: "combo1",
        calculatedCombination: "calc1",
        descriptionCombination: "desc1",
        selectedAttributeOptions: null,
      };

      const result = validateConfiguration(
        prevConfig,
        {},
        mockProduct,
        mockAttributes,
      );

      expect(result.combination).toBeNull();
      expect(result.calculatedCombination).toBe("default");
      expect(result.descriptionCombination).toBeNull();
    });

    it("should update combinations based on selectedAttributeOptions", () => {
      const prevConfig = {
        ...baseConfig,
        selectedAttributeOptions: { attr1: "val1" },
      };

      const result = validateConfiguration(
        prevConfig,
        {},
        mockProduct,
        mockAttributes,
      );

      expect(result.combination).toBe("combo1");
      expect(result.calculatedCombination).toBe("calcCombo1");
      expect(result.descriptionCombination).toBe("Attribute 1: Value 1");
    });

    it("should derive advanced selections from the selected finishing preset", () => {
      const finishingAttributes: Attribute[] = [
        {
          id: "finishing",
          name: "Finishing",
          type: AttributeInputTypeEnum.ADVANCED_FINISHING,
          options: [
            {
              value: "reinforced",
              label: "Reinforced",
              advancedPreset: {
                reinforcementSides: ["top", "bottom"],
                grommets: {
                  sides: ["left"],
                  spacing: 40,
                  offsetStart: 5,
                  offsetEnd: 10,
                },
              },
            },
          ],
        } as unknown as Attribute,
      ];

      const result = validateConfiguration(
        {
          ...baseConfig,
          selectedAttributeOptions: { finishing: "reinforced" },
          advancedAttributeSelections: undefined,
        },
        {},
        mockProduct,
        finishingAttributes,
      );

      expect(result.advancedAttributeSelections).toEqual({
        finishing: {
          preset: "reinforced",
          reinforcementSides: ["top", "bottom"],
          tunnelSides: [],
          grommets: {
            sides: ["left"],
            spacing: 40,
            offsetStart: 5,
            offsetEnd: 10,
          },
          cutToSize: false,
        },
      });
    });

    it("should call getCombination with includeAttributeNames set to true", () => {
      const prevConfig = {
        ...baseConfig,
        selectedAttributeOptions: { attr1: "val1" },
      };

      validateConfiguration(prevConfig, {}, mockProduct, mockAttributes);

      // Verify getCombination was called with includeAttributeNames: true
      expect(mockGetCombination).toHaveBeenCalledWith(
        mockAttributes,
        ["val1"],
        undefined,
        undefined,
        true,
      );
    });
  });

  it("should build splitCombination in attributes array order", () => {
    const multiAttrAttributes: Attribute[] = [
      {
        id: "attr1",
        name: "Attribute 1",
        options: [{ value: "val1", label: "Value 1" }],
      } as unknown as Attribute,
      {
        id: "attr2",
        name: "Attribute 2",
        options: [{ value: "val2", label: "Value 2" }],
      } as unknown as Attribute,
      {
        id: "attr3",
        name: "Attribute 3",
        options: [{ value: "val3", label: "Value 3" }],
      } as unknown as Attribute,
    ];

    const prevConfig = {
      ...baseConfig,
      selectedAttributeOptions: {
        attr3: "val3",
        attr1: "val1",
        attr2: "val2",
      },
    };

    validateConfiguration(prevConfig, {}, mockProduct, multiAttrAttributes);

    // Should be called with values in attributes array order, not object key order
    expect(mockGetCombination).toHaveBeenCalledWith(
      multiAttrAttributes,
      ["val1", "val2", "val3"],
      undefined,
      undefined,
      true,
    );
  });

  it("should filter out null and undefined values from splitCombination", () => {
    const multiAttrAttributes: Attribute[] = [
      {
        id: "attr1",
        name: "Attribute 1",
        options: [{ value: "val1", label: "Value 1" }],
      } as unknown as Attribute,
      {
        id: "attr2",
        name: "Attribute 2",
        options: [{ value: "val2", label: "Value 2" }],
      } as unknown as Attribute,
      {
        id: "attr3",
        name: "Attribute 3",
        options: [{ value: "val3", label: "Value 3" }],
      } as unknown as Attribute,
    ];

    const prevConfig = {
      ...baseConfig,
      selectedAttributeOptions: {
        attr1: "val1",
        // attr2 is missing
        attr3: "val3",
      },
    };

    validateConfiguration(prevConfig, {}, mockProduct, multiAttrAttributes);

    // Should only include defined values
    expect(mockGetCombination).toHaveBeenCalledWith(
      multiAttrAttributes,
      ["val1", "val3"],
      undefined,
      undefined,
      true,
    );
  });

  it("should handle volume correctly when mixed with other attributes", () => {
    const multiAttrAttributes: Attribute[] = [
      {
        id: "attr1",
        name: "Attribute 1",
        options: [{ value: "val1", label: "Value 1" }],
      } as unknown as Attribute,
      {
        id: "attr2",
        name: "Attribute 2",
        options: [{ value: "val2", label: "Value 2" }],
      } as unknown as Attribute,
    ];

    const prevConfig = {
      ...baseConfig,
      selectedAttributeOptions: {
        attr1: "val1",
        volume: "50",
        attr2: "val2",
      },
    };

    validateConfiguration(prevConfig, {}, mockProduct, multiAttrAttributes);

    // Volume should not be in splitCombination
    expect(mockGetCombination).toHaveBeenCalledWith(
      multiAttrAttributes,
      ["val1", "val2"],
      undefined,
      undefined,
      true,
    );
  });

  it("should apply dependent attributes validation", () => {
    const productWithDependencies = {
      ...mockProduct,
      attributeDependencies: {
        size: {
          dependsOn: "color",
          dependencyValues: ["red"],
        },
      },
    };

    const prevConfig = {
      ...baseConfig,
      selectedAttributeOptions: {
        color: "blue", // This should exclude the dependent 'size' attribute
        size: "small",
      },
    };

    const result = validateConfiguration(
      prevConfig,
      {},
      productWithDependencies,
      mockAttributes,
    );

    // Should only include 'color', 'size' should be filtered out
    expect(result.selectedAttributeOptions).toEqual({
      color: "blue",
    });
  });

  it("should always update productId to match product", () => {
    const result = validateConfiguration(
      { ...baseConfig, productId: "old-id" },
      {},
      { ...mockProduct, id: "new-id" },
      mockAttributes,
    );

    expect(result.productId).toBe("new-id");
  });

  it("should handle search params when calculating combinations", () => {
    const mockSearchParams = {
      get: vi.fn().mockReturnValue("searchValue"),
    } as any;

    const result = validateConfiguration(
      baseConfig,
      { selectedAttributeOptions: { attr1: "val1" } },
      mockProduct,
      mockAttributes,
      mockSearchParams,
    );

    // The combinations should still be set from the mocked getCombination
    expect(result.combination).toBe("combo1");
    expect(result.calculatedCombination).toBe("calcCombo1");
    expect(result.descriptionCombination).toBe("Attribute 1: Value 1");
  });

  describe("Edge cases and boundary conditions", () => {
    it("should handle empty attributes array", () => {
      const prevConfig = {
        ...baseConfig,
        selectedAttributeOptions: { attr1: "val1" },
      };

      validateConfiguration(prevConfig, {}, mockProduct, []);

      expect(mockGetCombination).toHaveBeenCalledWith(
        [],
        [],
        undefined,
        undefined,
        true,
      );
    });

    it("should handle THRESHOLD price type like SINGLE", () => {
      const thresholdProduct = {
        ...mockProduct,
        priceType: PriceTypeEnum.THRESHOLD,
      };

      const result = validateConfiguration(
        baseConfig,
        { quantity: 3 },
        thresholdProduct,
        mockAttributes,
      );

      expect(result.volume).toBeUndefined();
      expect(result.quantity).toBe(5); // Enforces minimum
    });

    it("should not modify configuration when next is empty object", () => {
      const prevConfig = {
        ...baseConfig,
        quantity: 50,
        volume: 50,
        selectedAttributeOptions: { attr1: "val1" },
      };

      const result = validateConfiguration(
        prevConfig,
        {},
        mockProduct,
        mockAttributes,
      );

      expect(result.quantity).toBe(50);
      expect(result.volume).toBe(50);
    });

    it("should handle zero volume correctly", () => {
      const result = validateConfiguration(
        baseConfig,
        { volume: 0 },
        mockProduct,
        mockAttributes,
      );

      // Zero volume is falsy, so it bypasses the min/max checks and remains 0
      expect(result.volume).toBe(0);
    });

    it("should handle negative quantity correctly", () => {
      const result = validateConfiguration(
        baseConfig,
        { quantity: -10 },
        mockProduct,
        mockAttributes,
      );

      // Negative quantity should be replaced with 1
      expect(result.quantity).toBe(1);
    });

    it("should stringify numeric attribute values", () => {
      const prevConfig = {
        ...baseConfig,
        selectedAttributeOptions: {
          attr1: 123 as any,
          attr2: 456 as any,
        },
      };

      const productWithDeps = {
        ...mockProduct,
        attributeDependencies: {},
      };

      validateConfiguration(prevConfig, {}, productWithDeps, mockAttributes);

      // Should stringify numeric values before validation
      expect(mockGetCombination).toHaveBeenCalled();
    });

    it("should handle boolean attribute values by converting to string", () => {
      const prevConfig = {
        ...baseConfig,
        selectedAttributeOptions: {
          attr1: true as any,
          attr2: false as any,
        },
      };

      validateConfiguration(prevConfig, {}, mockProduct, mockAttributes);

      // Should convert booleans to strings
      expect(mockGetCombination).toHaveBeenCalled();
    });

    it("should preserve other configuration properties", () => {
      const prevConfig = {
        ...baseConfig,
        customFormat: true,
        width: 100,
        height: 200,
        customSizes: [{ width: 50, height: 50 }],
      } as Configuration;

      const result = validateConfiguration(
        prevConfig,
        { quantity: 25 },
        mockProduct,
        mockAttributes,
      );

      expect(result.customFormat).toBe(true);
      expect(result.width).toBe(100);
      expect(result.height).toBe(200);
      expect(result.customSizes).toEqual([{ width: 50, height: 50 }]);
    });

    it("should override properties from next parameter", () => {
      const prevConfig = {
        ...baseConfig,
        width: 100,
        height: 200,
      } as Configuration;

      const result = validateConfiguration(
        prevConfig,
        { width: 300, height: 400 },
        mockProduct,
        mockAttributes,
      );

      expect(result.width).toBe(300);
      expect(result.height).toBe(400);
    });

    it("should handle undefined volume in next parameter", () => {
      const prevConfig = {
        ...baseConfig,
        volume: 50,
      };

      const result = validateConfiguration(
        prevConfig,
        { volume: undefined },
        mockProduct,
        mockAttributes,
      );

      // undefined volume should be preserved in MATRIX type
      expect(result.volume).toBeUndefined();
    });

    it("should handle partial attribute updates correctly", () => {
      const multiAttrAttributes: Attribute[] = [
        {
          id: "color",
          name: "Color",
          options: [{ value: "red", label: "Red" }],
        } as unknown as Attribute,
        {
          id: "size",
          name: "Size",
          options: [{ value: "large", label: "Large" }],
        } as unknown as Attribute,
      ];

      const prevConfig = {
        ...baseConfig,
        selectedAttributeOptions: {
          color: "red",
          size: "small",
        },
      };

      const result = validateConfiguration(
        prevConfig,
        { selectedAttributeOptions: { size: "large" } },
        mockProduct,
        multiAttrAttributes,
      );

      // Should merge and keep color, update size
      expect(result.selectedAttributeOptions).toEqual({
        color: "red",
        size: "large",
      });
    });
  });

  describe("Attribute ordering consistency", () => {
    it("should maintain consistent ordering when attributes have different ids", () => {
      const orderedAttributes: Attribute[] = [
        {
          id: "z-last",
          name: "Z",
          options: [{ value: "z", label: "Z" }],
        } as unknown as Attribute,
        {
          id: "a-first",
          name: "A",
          options: [{ value: "a", label: "A" }],
        } as unknown as Attribute,
        {
          id: "m-middle",
          name: "M",
          options: [{ value: "m", label: "M" }],
        } as unknown as Attribute,
      ];

      const prevConfig = {
        ...baseConfig,
        selectedAttributeOptions: {
          "a-first": "a",
          "m-middle": "m",
          "z-last": "z",
        },
      };

      validateConfiguration(prevConfig, {}, mockProduct, orderedAttributes);

      // Should follow attributes array order: z-last, a-first, m-middle
      expect(mockGetCombination).toHaveBeenCalledWith(
        orderedAttributes,
        ["z", "a", "m"],
        undefined,
        undefined,
        true,
      );
    });

    it("should handle when selectedAttributeOptions has extra keys not in attributes", () => {
      const prevConfig = {
        ...baseConfig,
        selectedAttributeOptions: {
          attr1: "val1",
          extraAttr: "extraVal",
          anotherExtra: "anotherVal",
        },
      };

      validateConfiguration(prevConfig, {}, mockProduct, mockAttributes);

      // Should only include attr1 which exists in attributes array
      expect(mockGetCombination).toHaveBeenCalledWith(
        mockAttributes,
        ["val1"],
        undefined,
        undefined,
        true,
      );
    });
  });
});

describe("validateDependentAttributes", () => {
  const attributeDependencies = {
    size: {
      dependsOn: "color",
      dependencyValues: ["red"],
    },
    material: {
      dependsOn: "color",
      // No dependencyValues means any value of color works
    },
  };

  describe("Independent attributes", () => {
    it("should include attributes without dependencies", () => {
      const selectedOptions = {
        color: "red",
        finish: "matte",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        attributeDependencies,
      );

      expect(result).toEqual({
        color: "red",
        finish: "matte",
      });
    });
  });

  describe("Dependent attributes with specific dependency values", () => {
    it("should include dependent attribute when dependency value matches", () => {
      const selectedOptions = {
        color: "red",
        size: "small",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        attributeDependencies,
      );

      expect(result).toEqual({
        color: "red",
        size: "small",
      });
    });

    it("should exclude dependent attribute when dependency value does not match", () => {
      const selectedOptions = {
        color: "blue",
        size: "small",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        attributeDependencies,
      );

      expect(result).toEqual({
        color: "blue",
      });
    });

    it("should exclude dependent attribute when parent is not selected", () => {
      const selectedOptions = {
        size: "small",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        attributeDependencies,
      );

      expect(result).toEqual({});
    });
  });

  describe("Dependent attributes without specific dependency values", () => {
    it("should include dependent attribute when parent has any value", () => {
      const selectedOptions = {
        color: "blue",
        material: "cotton",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        attributeDependencies,
      );

      expect(result).toEqual({
        color: "blue",
        material: "cotton",
      });
    });

    it("should exclude dependent attribute when parent is not selected", () => {
      const selectedOptions = {
        material: "cotton",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        attributeDependencies,
      );

      expect(result).toEqual({});
    });
  });

  describe("Complex scenarios", () => {
    it("should handle multiple dependent and independent attributes", () => {
      const selectedOptions = {
        color: "red",
        size: "large",
        material: "silk",
        finish: "glossy",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        attributeDependencies,
      );

      expect(result).toEqual({
        color: "red",
        finish: "glossy",
        size: "large",
        material: "silk",
      });
    });

    it("should exclude only invalid dependent attributes", () => {
      const selectedOptions = {
        color: "blue",
        size: "large", // Should be excluded (color is blue, not red)
        material: "silk", // Should be included (any color value works)
        finish: "glossy", // Should be included (independent)
      };

      const result = validateDependentAttributes(
        selectedOptions,
        attributeDependencies,
      );

      expect(result).toEqual({
        color: "blue",
        finish: "glossy",
        material: "silk",
      });
    });
  });

  describe("Edge cases", () => {
    it("should return selectedAttributeOptions when selectedAttributeOptions is undefined", () => {
      const result = validateDependentAttributes(
        undefined,
        attributeDependencies,
      );
      expect(result).toEqual({});
    });

    it("should return selectedAttributeOptions when attributeDependencies is undefined", () => {
      const selectedOptions = {
        color: "red",
        size: "small",
      };
      const result = validateDependentAttributes(selectedOptions, undefined);
      expect(result).toEqual({
        color: "red",
        size: "small",
      });
    });

    it("should handle empty selectedAttributeOptions", () => {
      const result = validateDependentAttributes({}, attributeDependencies);
      expect(result).toEqual({});
    });

    it("should handle empty attributeDependencies", () => {
      const selectedOptions = {
        color: "red",
        size: "small",
      };

      const result = validateDependentAttributes(selectedOptions, {});
      expect(result).toEqual({
        color: "red",
        size: "small",
      });
    });

    it("should handle null selectedAttributeOptions", () => {
      const result = validateDependentAttributes(
        null as any,
        attributeDependencies,
      );
      expect(result).toEqual({});
    });

    it("should handle null attributeDependencies", () => {
      const selectedOptions = {
        color: "red",
        size: "small",
      };
      const result = validateDependentAttributes(selectedOptions, null as any);
      expect(result).toEqual({
        color: "red",
        size: "small",
      });
    });
  });

  describe("Chained dependencies", () => {
    it("should handle multiple levels of dependencies", () => {
      const chainedDependencies = {
        size: {
          dependsOn: "color",
          dependencyValues: ["red"],
        },
        pattern: {
          dependsOn: "size",
          dependencyValues: ["large"],
        },
      };

      const selectedOptions = {
        color: "red",
        size: "large",
        pattern: "striped",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        chainedDependencies,
      );

      // All should be included as dependencies are satisfied
      expect(result).toEqual({
        color: "red",
        size: "large",
        pattern: "striped",
      });
    });

    it("should exclude chained dependencies when first level fails", () => {
      const chainedDependencies = {
        size: {
          dependsOn: "color",
          dependencyValues: ["red"],
        },
        pattern: {
          dependsOn: "size",
          dependencyValues: ["large"],
        },
      };

      const selectedOptions = {
        color: "blue", // Wrong color, should exclude size and pattern
        size: "large",
        pattern: "striped",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        chainedDependencies,
      );

      // Only color should be included
      expect(result).toEqual({
        color: "blue",
      });
    });

    it("should exclude second level when first level is satisfied but second fails", () => {
      const chainedDependencies = {
        size: {
          dependsOn: "color",
          dependencyValues: ["red"],
        },
        pattern: {
          dependsOn: "size",
          dependencyValues: ["large"],
        },
      };

      const selectedOptions = {
        color: "red",
        size: "small", // Wrong size for pattern
        pattern: "striped",
      };

      const result = validateDependentAttributes(
        selectedOptions,
        chainedDependencies,
      );

      // Color and size included, but not pattern
      expect(result).toEqual({
        color: "red",
        size: "small",
      });
    });
  });

  describe("Special dependency value scenarios", () => {
    it('should handle empty dependencyValues array as "any value works"', () => {
      const deps = {
        material: {
          dependsOn: "color",
          dependencyValues: [],
        },
      };

      const selectedOptions = {
        color: "blue",
        material: "cotton",
      };

      const result = validateDependentAttributes(selectedOptions, deps);

      expect(result).toEqual({
        color: "blue",
        material: "cotton",
      });
    });

    it("should handle multiple valid dependency values", () => {
      const deps = {
        size: {
          dependsOn: "color",
          dependencyValues: ["red", "blue", "green"],
        },
      };

      const selectedOptions = {
        color: "green",
        size: "large",
      };

      const result = validateDependentAttributes(selectedOptions, deps);

      expect(result).toEqual({
        color: "green",
        size: "large",
      });
    });

    it("should exclude when value not in multiple dependency values", () => {
      const deps = {
        size: {
          dependsOn: "color",
          dependencyValues: ["red", "blue", "green"],
        },
      };

      const selectedOptions = {
        color: "yellow",
        size: "large",
      };

      const result = validateDependentAttributes(selectedOptions, deps);

      expect(result).toEqual({
        color: "yellow",
      });
    });

    it("should handle numeric dependency values as strings", () => {
      const deps = {
        finish: {
          dependsOn: "thickness",
          dependencyValues: ["5", "10"],
        },
      };

      const selectedOptions = {
        thickness: "10",
        finish: "glossy",
      };

      const result = validateDependentAttributes(selectedOptions, deps);

      expect(result).toEqual({
        thickness: "10",
        finish: "glossy",
      });
    });
  });

  describe("Multiple dependencies on same parent", () => {
    it("should handle multiple attributes depending on same parent", () => {
      const deps = {
        size: {
          dependsOn: "color",
          dependencyValues: ["red"],
        },
        material: {
          dependsOn: "color",
          dependencyValues: ["red"],
        },
      };

      const selectedOptions = {
        color: "red",
        size: "large",
        material: "silk",
      };

      const result = validateDependentAttributes(selectedOptions, deps);

      expect(result).toEqual({
        color: "red",
        size: "large",
        material: "silk",
      });
    });

    it("should exclude all when parent does not match for multiple dependents", () => {
      const deps = {
        size: {
          dependsOn: "color",
          dependencyValues: ["red"],
        },
        material: {
          dependsOn: "color",
          dependencyValues: ["red"],
        },
      };

      const selectedOptions = {
        color: "blue",
        size: "large",
        material: "silk",
      };

      const result = validateDependentAttributes(selectedOptions, deps);

      expect(result).toEqual({
        color: "blue",
      });
    });

    it("should handle different dependency values for same parent", () => {
      const deps = {
        size: {
          dependsOn: "color",
          dependencyValues: ["red"],
        },
        material: {
          dependsOn: "color",
          dependencyValues: ["blue"],
        },
      };

      const selectedOptions = {
        color: "red",
        size: "large",
        material: "silk",
      };

      const result = validateDependentAttributes(selectedOptions, deps);

      // Size included, material excluded
      expect(result).toEqual({
        color: "red",
        size: "large",
      });
    });
  });

  describe("Dependency chains", () => {
    it("resolves nested dependent attributes regardless of selected option order", () => {
      const deps = {
        finish: {
          dependsOn: "paper",
          dependencyValues: ["matte"],
        },
        lamination: {
          dependsOn: "finish",
          dependencyValues: ["soft"],
        },
      };

      const selectedOptions = {
        lamination: "gloss",
        finish: "soft",
        paper: "matte",
      };

      const result = validateDependentAttributes(selectedOptions, deps);

      expect(result).toEqual({
        paper: "matte",
        finish: "soft",
        lamination: "gloss",
      });
    });
  });
});
