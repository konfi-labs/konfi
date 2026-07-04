import { NestedProduct, OrderItem, PriceTypeEnum } from "@konfi/types";
import {
  formatOrderItem,
  formatOrderItemAsAnalyticsItem,
  formatOrderItems,
} from "../../formatters/format-order-items";

describe("Order Items Formatters", () => {
  // Mock data for tests
  const createMockProduct = (priceType: PriceTypeEnum): NestedProduct =>
    ({
      id: "product-123",
      name: "Test Product",
      priceType,
      prices: [
        { id: "price-1", combination: { id: "combo-1" }, price: 1000 },
        { id: "price-2", combination: { id: "combo-2" }, price: 2000 },
      ],
      customSize: false,
      attributes: ["attr1", "attr2"],
      attributeOptions: { attr1: ["option1"], attr2: ["option2"] },
      difficulty: 3,
      productType: "physical",
      category: { id: "cat-1", name: "Test Category" },
      shipping: { types: [] },
      volumes: [],
      spec: null,
      description: "Product description",
      recommended: true,
      allowCustomPrice: false,
      prefferedUnit: "pcs",
      threeDModel: null,
      designSpec: null,
      channelId: "channel-1",
    }) as unknown as NestedProduct;

  const createMockOrderItem = (priceType: PriceTypeEnum): OrderItem => {
    const isMatrixLikeItem =
      priceType === PriceTypeEnum.MATRIX || priceType === PriceTypeEnum.DYNAMIC;

    return ({
      id: "item-1",
      name: "Order Item 1",
      product: createMockProduct(priceType),
      combination: isMatrixLikeItem
        ? { attr1: "option1", attr2: "option2" }
        : null,
      calculatedCombination: isMatrixLikeItem ? "combo-1" : null,
      description: "Custom order description",
      volume: isMatrixLikeItem ? 5 : 0,
      customFormat: null,
      customPrice: 0,
      totalPrice: 1299,
      width: 100,
      height: 200,
      quantity: isMatrixLikeItem ? 1 : 2,
      expressPercent: 20,
      discount: null,
      unit: "pcs",
    }) as unknown as OrderItem;
  };

  describe("formatOrderItems", () => {
    it("should format an array of order items", () => {
      const orderItems = [
        createMockOrderItem(PriceTypeEnum.MATRIX),
        createMockOrderItem(PriceTypeEnum.SINGLE),
      ];

      const formattedItems = formatOrderItems(orderItems);

      expect(formattedItems).toHaveLength(2);
      expect(formattedItems[0]?.id).toBe("item-1");
      expect(formattedItems[1]?.id).toBe("item-1");

      // Verify matrix item has filtered prices
      if (formattedItems[0]?.product?.priceType === PriceTypeEnum.MATRIX) {
        expect(formattedItems[0].product.prices).toHaveLength(1);
        expect(formattedItems[0].product.prices[0].combination?.id).toBe(
          "combo-1",
        );
      }

      // Verify single price item keeps all prices
      if (formattedItems[1]?.product?.priceType === PriceTypeEnum.SINGLE) {
        expect(formattedItems[1].product.prices).toHaveLength(2);
      }
    });

    it("should return empty array when input is empty", () => {
      const result = formatOrderItems([]);
      expect(result).toEqual([]);
    });
  });

  describe("formatOrderItem", () => {
    it("should format a matrix price type order item correctly", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.MATRIX);
      const formattedItem = formatOrderItem(orderItem);

      expect(formattedItem.product?.prices).toHaveLength(1);
      expect(formattedItem.product?.prices[0].combination?.id).toBe("combo-1");
      expect(formattedItem.combination).not.toBeNull();
      expect(formattedItem.calculatedCombination).toBe("combo-1");
      expect(formattedItem.volume).toBe(5);
      expect(formattedItem.quantity).toBe(1);
      expect(formattedItem.product?.description).toBe("Product description");
    });

    it("should format a dynamic price type order item like a matrix item", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.DYNAMIC);
      const formattedItem = formatOrderItem(orderItem);

      expect(formattedItem.product?.prices).toHaveLength(1);
      expect(formattedItem.product?.prices[0].combination?.id).toBe("combo-1");
      expect(formattedItem.combination).not.toBeNull();
      expect(formattedItem.calculatedCombination).toBe("combo-1");
      expect(formattedItem.volume).toBe(5);
      expect(formattedItem.quantity).toBe(1);
      expect(formattedItem.product?.description).toBe("Product description");
    });

    it("should format a single price type order item correctly", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.SINGLE);
      const formattedItem = formatOrderItem(orderItem);

      expect(formattedItem.product?.prices).toHaveLength(2);
      expect(formattedItem.combination).toBeNull();
      expect(formattedItem.calculatedCombination).toBeNull();
      expect(formattedItem.volume).toBe(0);
      expect(formattedItem.quantity).toBe(2);
      expect(formattedItem.product?.description).toBe("");
    });

    it("should format a threshold price type order item correctly", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.THRESHOLD);
      const formattedItem = formatOrderItem(orderItem);

      expect(formattedItem.product?.prices).toHaveLength(2);
      expect(formattedItem.combination).toBeNull();
      expect(formattedItem.calculatedCombination).toBeNull();
    });

    it("should handle missing properties with default values", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.MATRIX);
      delete (orderItem.product as any)?.difficulty;
      delete (orderItem.product as any)?.allowCustomPrice;
      delete (orderItem.product as any)?.recommended;
      delete (orderItem.product as any)?.shipping;
      delete (orderItem.product as any)?.threeDModel;
      delete (orderItem as any)?.customPrice;

      const formattedItem = formatOrderItem(orderItem);

      expect(formattedItem.product?.difficulty).toBe(5);
      expect(formattedItem.product?.allowCustomPrice).toBe(false);
      expect(formattedItem.product?.recommended).toBe(false);
      expect(formattedItem.product?.shipping).toEqual({ types: [] });
      expect(formattedItem.product?.threeDModel).toBeNull();
      expect(formattedItem.customPrice).toBe(0);
    });

    it("should handle floor the total price", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.SINGLE);
      orderItem.totalPrice = 1299.95;

      const formattedItem = formatOrderItem(orderItem);

      expect(formattedItem.totalPrice).toBe(1299);
    });

    it("should preserve express pricing metadata", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.SINGLE);
      const formattedItem = formatOrderItem(orderItem);

      expect(formattedItem.expressPercent).toBe(20);
    });

    it("should preserve advanced finishing selections", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.SINGLE);
      orderItem.advancedAttributeSelections = {
        finishing: {
          preset: "custom",
          reinforcementSides: ["top"],
          tunnelSides: [],
          grommets: {
            sides: ["left"],
            spacing: 40,
            offsetStart: 5,
            offsetEnd: 10,
          },
          cutToSize: false,
        },
      };

      const formattedItem = formatOrderItem(orderItem);

      expect(formattedItem.advancedAttributeSelections).toEqual(
        orderItem.advancedAttributeSelections,
      );
    });

    it("should not modify description when customFormat is false", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.SINGLE);
      orderItem.customFormat = false;
      orderItem.customSizes = [{ width: 100, height: 200, quantity: 2 }];
      orderItem.description = "Base description";

      const formattedItem = formatOrderItem(orderItem);

      expect(formattedItem.description).toBe("Base description");
    });
  });

  describe("formatOrderItemAsAnalyticsItem", () => {
    it("should format an order item for analytics with index", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.SINGLE);
      const analyticsItem = formatOrderItemAsAnalyticsItem(orderItem, 0);

      expect(analyticsItem).toEqual({
        id: "product-123",
        name: "Test Product",
        item_category: "Test Category",
        item_variant: "Custom order description",
        price: "12.99",
        quantity: 2,
      });
    });

    it("should format an order item for analytics without index", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.SINGLE);
      const analyticsItem = formatOrderItemAsAnalyticsItem(orderItem);

      expect(analyticsItem).toEqual({
        id: "product-123",
        name: "Test Product",
        item_category: "Test Category",
        item_variant: "Custom order description",
        price: "12.99",
        quantity: 2,
      });
    });

    it("should handle missing product data", () => {
      const orderItem = createMockOrderItem(PriceTypeEnum.SINGLE);
      orderItem.product = undefined;

      const analyticsItem = formatOrderItemAsAnalyticsItem(orderItem);

      expect(analyticsItem).toEqual({
        id: "",
        name: "",
        item_category: "",
        item_variant: "Custom order description",
        price: "12.99",
        quantity: 2,
      });
    });
  });
});
