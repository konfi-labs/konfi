import { Configuration, NestedProduct, PriceTypeEnum } from "@konfi/types";
import { DEFAULT_COMBINATION } from "../../constants";
import { canAddToCart } from "../../validators/can-add-to-cart";

// Mock the imported utilities
vi.mock("../../ratio", () => ({
  getRatio: vi.fn((width: number, height: number) => width / height),
  isValidRatio: vi
    .fn()
    .mockImplementation(
      (width: any, height: any, min: any, max: any, ratio: any) => {
        return ratio >= min && ratio <= max;
      },
    ),
}));

vi.mock("../../validators/is-valid-size", () => ({
  isValidSize: vi.fn().mockReturnValue(true),
}));

import { Mock } from "vitest";
import { getRatio, isValidRatio } from "../../ratio";
import { isValidSize } from "../../validators/is-valid-size";

describe("canAddToCart", () => {
  const mockMatrixProduct: NestedProduct = {
    id: "product1",
    priceType: PriceTypeEnum.MATRIX,
    spec: {
      minimumOrder: 1,
      maximumOrder: 100,
      minimumRatio: 0.2,
      maximumRatio: 5,
      validateRatio: true,
    },
  } as NestedProduct;

  const mockSingleProduct: NestedProduct = {
    id: "product2",
    priceType: PriceTypeEnum.SINGLE,
    spec: {
      minimumOrder: 1,
      maximumOrder: 10,
      minimumRatio: 0.2,
      maximumRatio: 5,
      validateRatio: true,
    },
  } as NestedProduct;

  beforeEach(() => {
    vi.clearAllMocks();
    (isValidSize as Mock).mockReturnValue(true);
  });

  it("should return false if product is not provided", () => {
    const config: Configuration = {} as Configuration;
    expect(canAddToCart(null as any, config)).toBe(false);
  });

  describe("Matrix Product", () => {
    it("should return false if quantity is less than 1", () => {
      const config: Configuration = {
        quantity: 0,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(false);
    });

    it("should allow out-of-spec quantity and volume when allowOutOfSpec is true", () => {
      const config: Configuration = {
        quantity: 0,
        volume: 150,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
      } as unknown as Configuration;

      expect(
        canAddToCart(mockMatrixProduct, config, { allowOutOfSpec: true }),
      ).toBe(true);
    });

    it("should return false if volume exceeds maximum order", () => {
      const config: Configuration = {
        quantity: 1,
        volume: 150, // Exceeds maximum of 100
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(false);
    });

    it("should return false if volume is less than minimum order", () => {
      const config: Configuration = {
        quantity: 1,
        volume: 0.5, // Less than minimum of 1
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(false);
    });

    it("should return false if calculatedCombination is missing", () => {
      const config: Configuration = {
        quantity: 1,
        combination: { attr1: "value1" },
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(false);
    });

    it("should return false if combination is missing", () => {
      const config: Configuration = {
        quantity: 1,
        calculatedCombination: "combo1",
      } as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(false);
    });

    it("should allow default matrix-like configuration without attributes", () => {
      const config: Configuration = {
        quantity: 1,
        volume: 1,
        calculatedCombination: DEFAULT_COMBINATION,
        combination: null,
      } as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(true);
    });

    it("should return true for valid matrix product configuration", () => {
      const config: Configuration = {
        quantity: 1,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(true);
    });
  });

  describe("Single/Fixed Price Product", () => {
    it("should return false if quantity exceeds maximum order", () => {
      const config: Configuration = {
        quantity: 15, // Exceeds maximum of 10
      } as Configuration;

      expect(canAddToCart(mockSingleProduct, config)).toBe(false);
    });

    it("should allow quantity above maximum when allowOutOfSpec is true", () => {
      const config: Configuration = {
        quantity: 15,
      } as Configuration;

      expect(
        canAddToCart(mockSingleProduct, config, { allowOutOfSpec: true }),
      ).toBe(true);
    });

    it("should return false if quantity is less than minimum order", () => {
      const config: Configuration = {
        quantity: 0, // Less than minimum of 1
      } as Configuration;

      expect(canAddToCart(mockSingleProduct, config)).toBe(false);
    });

    it("should allow quantity below minimum when allowOutOfSpec is true", () => {
      const config: Configuration = {
        quantity: 0,
      } as Configuration;

      expect(
        canAddToCart(mockSingleProduct, config, { allowOutOfSpec: true }),
      ).toBe(true);
    });

    it("should return true for valid single product configuration", () => {
      const config: Configuration = {
        quantity: 5,
      } as Configuration;

      expect(canAddToCart(mockSingleProduct, config)).toBe(true);
    });

    it("should reject page counts outside selected option constraints", () => {
      const product: NestedProduct = {
        ...mockSingleProduct,
        pageCount: {
          constraints: [
            {
              conditions: [
                {
                  attributeId: "paper",
                  optionValues: ["premium"],
                },
              ],
              maximum: 32,
            },
          ],
          coverPages: 4,
          enabled: true,
          maximum: 64,
          minimum: 16,
          step: 16,
        },
      };
      const config: Configuration = {
        pageCount: 64,
        quantity: 5,
        selectedAttributeOptions: {
          paper: "premium",
        },
      } as Configuration;

      expect(canAddToCart(product, config)).toBe(false);
    });
  });

  describe("Custom Format", () => {
    it("should return false if width is missing for custom format", () => {
      const config: Configuration = {
        quantity: 1,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
        customFormat: true,
        height: 50,
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(false);
    });

    it("should return false if height is missing for custom format", () => {
      const config: Configuration = {
        quantity: 1,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
        customFormat: true,
        width: 100,
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(false);
    });

    it("should return false if size is invalid", () => {
      (isValidSize as Mock).mockReturnValueOnce(false);

      const config: Configuration = {
        quantity: 1,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
        customFormat: true,
        width: 100,
        height: 50,
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(false);
      expect(isValidSize).toHaveBeenCalledWith(
        100,
        50,
        mockMatrixProduct,
        config,
      );
    });

    it("should bypass size and ratio validation when allowOutOfSpec is true", () => {
      const config: Configuration = {
        quantity: 1,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
        customFormat: true,
        width: 100,
        height: 10,
      } as unknown as Configuration;

      expect(
        canAddToCart(mockMatrixProduct, config, { allowOutOfSpec: true }),
      ).toBe(true);
      expect(isValidSize).not.toHaveBeenCalled();
      expect(getRatio).not.toHaveBeenCalled();
      expect(isValidRatio).not.toHaveBeenCalled();
    });

    it("should return false if ratio is invalid", () => {
      (isValidRatio as Mock).mockReturnValueOnce(false);

      const config: Configuration = {
        quantity: 1,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
        customFormat: true,
        width: 100,
        height: 10, // This would result in a ratio of 10:1, which exceeds the max of 5:1
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(false);
      expect(getRatio).toHaveBeenCalledWith(100, 10);
      expect(isValidRatio).toHaveBeenCalled();
    });

    it("should return true for valid custom format configuration", () => {
      (getRatio as Mock).mockReturnValueOnce(1.5); // Good ratio between min 0.2 and max 5
      (isValidRatio as Mock).mockReturnValueOnce(true);

      const config: Configuration = {
        quantity: 1,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
        customFormat: true,
        width: 300,
        height: 200,
      } as unknown as Configuration;

      expect(canAddToCart(mockMatrixProduct, config)).toBe(true);
      expect(isValidSize).toHaveBeenCalledWith(
        300,
        200,
        mockMatrixProduct,
        config,
      );
      expect(getRatio).toHaveBeenCalledWith(300, 200);
      expect(isValidRatio).toHaveBeenCalled();
    });

    it("should skip ratio validation if product does not require it", () => {
      const productWithoutRatioValidation = {
        ...mockMatrixProduct,
        spec: {
          ...mockMatrixProduct.spec,
          validateRatio: false,
        },
      };

      const config: Configuration = {
        quantity: 1,
        calculatedCombination: "combo1",
        combination: { attr1: "value1" },
        customFormat: true,
        width: 300,
        height: 200,
      } as unknown as Configuration;

      expect(canAddToCart(productWithoutRatioValidation, config)).toBe(true);
      expect(isValidSize).toHaveBeenCalled();
      expect(getRatio).not.toHaveBeenCalled();
      expect(isValidRatio).not.toHaveBeenCalled();
    });
  });
});
