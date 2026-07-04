import { OrderItemSchema } from "../../schemas";
import {
  CurrencyEnum,
  PriceTypeEnum,
  ShippingTypes,
  Unit,
  DiscountTypeEnum,
} from "@konfi/types";

describe("OrderItemSchema with Fakturownia products", () => {
  describe("Fakturownia product validation", () => {
    it("should validate a Fakturownia product with minimal price fields", () => {
      // This simulates what mapFakturowniaToNativeProduct creates
      const fakturowniaProduct = {
        id: "fk_12345",
        name: "Fakturownia Product",
        prices: [],
        defaultPrice: { currency: CurrencyEnum.PLN },
        lowPrice: { currency: CurrencyEnum.PLN },
        highPrice: { currency: CurrencyEnum.PLN },
        provider: { type: "FAKTUROWNIA", productId: "12345" },
        disablePriceFetch: true,
        description: "Test product from Fakturownia",
        volumes: [{ value: 1 }],
        attributes: [],
        attributeOptions: {},
        attributeDependencies: {},
        customSize: false,
        allowCustomPrice: true,
        recommended: false,
        difficulty: 1,
        shipping: {
          types: [
            ShippingTypes.CUSTOM,
            ShippingTypes.PERSONAL_COLLECTION,
            ShippingTypes.COURIER,
            ShippingTypes.PARCEL_DELIVERY_LOCKER,
          ],
        },
        spec: {
          images: [],
          defaultOrder: 1,
          minimumOrder: 1,
          maximumOrder: 1000000,
          step: 1,
        },
        category: { id: "fk", name: "Fakturownia" },
        seo: {
          slug: "fk_12345",
          title: "Fakturownia Product",
          description: "Test",
        },
        productType: null,
        priceType: PriceTypeEnum.SINGLE,
        prefferedUnit: Unit.PCS,
        keywords: [],
        channelId: undefined,
      };

      const orderItemData = {
        id: "order-item-1",
        name: "Test Order Item",
        product: fakturowniaProduct,
        description: "Order item with Fakturownia product",
        combination: null,
        calculatedCombination: null,
        volume: 1,
        customFormat: false,
        totalPrice: 100,
        customPrice: 100,
        width: 0,
        height: 0,
        quantity: 1,
        discount: {
          type: DiscountTypeEnum.PERCENTAGE,
          discountValue: 0,
          discountedAmount: 0,
          code: null,
        },
        unit: Unit.PCS,
        carriedOutBy: [],
      };

      // Should not throw
      const result = OrderItemSchema.validateSync(orderItemData, {
        abortEarly: false,
      });
      expect(result.product?.id).toBe("fk_12345");
      expect(result.product?.provider?.type).toBe("FAKTUROWNIA");
    });

    it("should validate a Fakturownia product without combination and volume in price", () => {
      // Test that price objects without combination and volume are valid
      const productWithMinimalPrice = {
        id: "fk_67890",
        name: "Minimal Price Product",
        prices: [],
        defaultPrice: {
          currency: CurrencyEnum.PLN,
          value: 100,
          // No combination or volume
        },
        lowPrice: { currency: CurrencyEnum.PLN },
        highPrice: { currency: CurrencyEnum.PLN },
        provider: { type: "FAKTUROWNIA", productId: "67890" },
        disablePriceFetch: true,
        description: "",
        volumes: [{ value: 1 }],
        attributes: [],
        attributeOptions: {},
        customSize: false,
        allowCustomPrice: true,
        recommended: false,
        difficulty: 1,
        shipping: {
          types: [ShippingTypes.PERSONAL_COLLECTION],
        },
        spec: {
          images: [],
          defaultOrder: 1,
          minimumOrder: 1,
          maximumOrder: 100,
          step: 1,
        },
        category: { id: "fk", name: "Fakturownia" },
        seo: { slug: "fk_67890", title: "Test", description: "" },
        productType: null,
        priceType: PriceTypeEnum.SINGLE,
        prefferedUnit: Unit.PCS,
        keywords: [],
      };

      const orderItemData = {
        id: "order-item-2",
        name: "Test",
        product: productWithMinimalPrice,
        description: "",
        combination: null,
        calculatedCombination: null,
        volume: 1,
        customFormat: false,
        totalPrice: 100,
        customPrice: 100,
        quantity: 1,
        discount: {
          type: DiscountTypeEnum.PERCENTAGE,
          discountValue: 0,
          discountedAmount: 0,
          code: null,
        },
        unit: Unit.PCS,
        carriedOutBy: [],
      };

      // Should not throw - this was the bug before the fix
      const result = OrderItemSchema.validateSync(orderItemData, {
        abortEarly: false,
      });
      expect(result.product?.provider?.type).toBe("FAKTUROWNIA");
    });

    it("should still validate products with full price objects", () => {
      // Test that products with complete price objects still work
      const productWithFullPrice = {
        id: "konfi-product-1",
        name: "Full Price Product",
        prices: [],
        defaultPrice: {
          currency: CurrencyEnum.PLN,
          value: 200,
          threshold: 10,
          combination: {
            id: "default",
            active: true,
            customFormat: false,
          },
          volume: {
            value: 1,
            deliveryTime: 2,
          },
        },
        lowPrice: {
          currency: CurrencyEnum.PLN,
          value: 150,
          combination: { id: "default", active: true, customFormat: false },
          volume: { value: 1, deliveryTime: 2 },
        },
        highPrice: {
          currency: CurrencyEnum.PLN,
          value: 300,
          combination: { id: "default", active: true, customFormat: false },
          volume: { value: 1, deliveryTime: 2 },
        },
        provider: { type: "KONFI", productId: "konfi-product-1" },
        description: "Regular product",
        volumes: [{ value: 1 }],
        attributes: [],
        attributeOptions: {},
        customSize: false,
        allowCustomPrice: false,
        recommended: false,
        difficulty: 1,
        shipping: {
          types: [ShippingTypes.PERSONAL_COLLECTION],
        },
        spec: {
          images: [],
          defaultOrder: 1,
          minimumOrder: 1,
          maximumOrder: 100,
          step: 1,
        },
        category: { id: "cat1", name: "Category 1" },
        seo: { slug: "product-1", title: "Test", description: "" },
        productType: null,
        priceType: PriceTypeEnum.SINGLE,
        prefferedUnit: Unit.PCS,
        keywords: [],
      };

      const orderItemData = {
        id: "order-item-3",
        name: "Test",
        product: productWithFullPrice,
        description: "",
        combination: null,
        calculatedCombination: null,
        volume: 1,
        customFormat: false,
        totalPrice: 200,
        customPrice: null,
        quantity: 1,
        discount: {
          type: DiscountTypeEnum.PERCENTAGE,
          discountValue: 0,
          discountedAmount: 0,
          code: null,
        },
        unit: Unit.PCS,
        carriedOutBy: [],
      };

      const result = OrderItemSchema.validateSync(orderItemData, {
        abortEarly: false,
      });
      expect(result.product?.defaultPrice?.value).toBe(200);
      expect(result.product?.defaultPrice?.combination?.id).toBe("default");
    });
  });
});
