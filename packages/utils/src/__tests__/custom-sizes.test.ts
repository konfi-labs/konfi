import { Configuration, CustomSizeWithQuantity } from "@konfi/types";

describe("Custom Sizes with Quantities", () => {
  describe("Configuration with custom sizes", () => {
    it("should allow multiple custom sizes with quantities", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 100, height: 200, quantity: 2 },
        { width: 150, height: 250, quantity: 3 },
      ];

      const configuration: Configuration = {
        productId: "test-product",
        combination: null,
        calculatedCombination: null,
        descriptionCombination: null,
        selectedAttributeOptions: null,
        quantity: 1,
        volume: undefined,
        customFormat: true,
        width: 100,
        height: 200,
        customSizes,
      };

      expect(configuration.customSizes).toHaveLength(2);
      expect(configuration.customSizes?.[0]).toEqual({
        width: 100,
        height: 200,
        quantity: 2,
      });
      expect(configuration.customSizes?.[1]).toEqual({
        width: 150,
        height: 250,
        quantity: 3,
      });
    });

    it("should calculate total area for multiple custom sizes", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 100, height: 200, quantity: 2 }, // 100*200*2 = 40,000
        { width: 150, height: 250, quantity: 3 }, // 150*250*3 = 112,500
      ];

      const totalArea = customSizes.reduce(
        (total, size) => total + size.width * size.height * size.quantity,
        0,
      );

      expect(totalArea).toBe(152500); // 40,000 + 112,500
    });
  });

  describe("Custom sizes validation", () => {
    it("should allow empty custom sizes array", () => {
      const configuration: Configuration = {
        productId: "test-product",
        combination: null,
        calculatedCombination: null,
        descriptionCombination: null,
        selectedAttributeOptions: null,
        quantity: 1,
        volume: undefined,
        customFormat: false,
        width: 100,
        height: 200,
        customSizes: [],
      };

      expect(configuration.customSizes).toEqual([]);
    });

    it("should allow undefined custom sizes", () => {
      const configuration: Configuration = {
        productId: "test-product",
        combination: null,
        calculatedCombination: null,
        descriptionCombination: null,
        selectedAttributeOptions: null,
        quantity: 1,
        volume: undefined,
        customFormat: false,
        width: 100,
        height: 200,
      };

      expect(configuration.customSizes).toBeUndefined();
    });
  });
});
