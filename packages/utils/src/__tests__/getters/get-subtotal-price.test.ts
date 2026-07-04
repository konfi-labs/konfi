import {
  CurrencyEnum,
  Discount,
  OrderItem,
  PriceTypeEnum,
  ShippingTypes,
  Unit,
} from "@konfi/types";
import { getSubtotalPrice } from "../../getters/get-subtotal-price";

describe("getSubtotalPrice", () => {
  it("should return 0 when orderItems is an empty array", () => {
    const orderItems: OrderItem[] = [];
    const result = getSubtotalPrice(orderItems);
    expect(result).toBe(0);
  });

  it("should return the correct subtotal price when orderItems has items", () => {
    const orderItems: OrderItem[] = [
      {
        description: "",
        customFormat: false,
        totalPrice: 30,
        customPrice: 0,
        quantity: 1,
        discount: new Discount(),
        unit: Unit.PCS,
        id: "1",
        name: "",
        product: {
          id: "1",
          name: "Product 1",
          prices: [],
          defaultPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          lowPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          highPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          description: "Product 1 description",
          priceType: PriceTypeEnum.SINGLE,
          volumes: [],
          attributes: [],
          attributeOptions: { test: ["test"] },
          customSize: false,
          allowCustomPrice: true,
          recommended: true,
          difficulty: 0,
          shipping: {
            types: [ShippingTypes.COURIER],
          },
          spec: {
            images: [],
            defaultOrder: 0,
            minimumOrder: 0,
            maximumOrder: 0,
            step: 0,
          },
          category: {
            id: "1",
            name: "Category 1",
          },
          productType: null,
          prefferedUnit: Unit.PCS,
        },
      },
      {
        description: "",
        customFormat: false,
        totalPrice: 30,
        customPrice: 0,
        quantity: 1,
        discount: new Discount(),
        unit: Unit.PCS,
        id: "1",
        name: "",
        product: {
          id: "1",
          name: "Product 1",
          prices: [],
          defaultPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          lowPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          highPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          description: "Product 1 description",
          priceType: PriceTypeEnum.SINGLE,
          volumes: [],
          attributes: [],
          attributeOptions: { test: ["test"] },
          customSize: false,
          allowCustomPrice: true,
          recommended: true,
          difficulty: 0,
          shipping: {
            types: [ShippingTypes.COURIER],
          },
          spec: {
            images: [],
            defaultOrder: 0,
            minimumOrder: 0,
            maximumOrder: 0,
            step: 0,
          },
          category: {
            id: "1",
            name: "Category 1",
          },
          productType: null,
          prefferedUnit: Unit.PCS,
        },
      },
    ];
    const result = getSubtotalPrice(orderItems);
    expect(result).toBe(60);
  });

  it("should round down the subtotal price to the nearest integer", () => {
    const orderItems: OrderItem[] = [
      {
        description: "",
        customFormat: false,
        totalPrice: 30.2,
        customPrice: 0,
        quantity: 1,
        discount: new Discount(),
        unit: Unit.PCS,
        id: "1",
        name: "",
        product: {
          id: "1",
          name: "Product 1",
          prices: [],
          defaultPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          lowPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          highPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          description: "Product 1 description",
          priceType: PriceTypeEnum.SINGLE,
          volumes: [],
          attributes: [],
          attributeOptions: { test: ["test"] },
          customSize: false,
          allowCustomPrice: true,
          recommended: true,
          difficulty: 0,
          shipping: {
            types: [ShippingTypes.COURIER],
          },
          spec: {
            images: [],
            defaultOrder: 0,
            minimumOrder: 0,
            maximumOrder: 0,
            step: 0,
          },
          category: {
            id: "1",
            name: "Category 1",
          },
          productType: null,
          prefferedUnit: Unit.PCS,
        },
      },
      {
        description: "",
        customFormat: false,
        totalPrice: 20.8,
        customPrice: 0,
        quantity: 1,
        discount: new Discount(),
        unit: Unit.PCS,
        id: "1",
        name: "",
        product: {
          id: "1",
          name: "Product 1",
          prices: [],
          defaultPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          lowPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          highPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          description: "Product 1 description",
          priceType: PriceTypeEnum.SINGLE,
          volumes: [],
          attributes: [],
          attributeOptions: { test: ["test"] },
          customSize: false,
          allowCustomPrice: true,
          recommended: true,
          difficulty: 0,
          shipping: {
            types: [ShippingTypes.COURIER],
          },
          spec: {
            images: [],
            defaultOrder: 0,
            minimumOrder: 0,
            maximumOrder: 0,
            step: 0,
          },
          category: {
            id: "1",
            name: "Category 1",
          },
          productType: null,
          prefferedUnit: Unit.PCS,
        },
      },
      {
        description: "",
        customFormat: false,
        totalPrice: 10.5,
        customPrice: 0,
        quantity: 1,
        discount: new Discount(),
        unit: Unit.PCS,
        id: "1",
        name: "",
        product: {
          id: "1",
          name: "Product 1",
          prices: [],
          defaultPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          lowPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          highPrice: {
            value: 0,
            threshold: 0,
            currency: CurrencyEnum.PLN,
          },
          description: "Product 1 description",
          priceType: PriceTypeEnum.SINGLE,
          volumes: [],
          attributes: [],
          attributeOptions: { test: ["test"] },
          customSize: false,
          allowCustomPrice: true,
          recommended: true,
          difficulty: 0,
          shipping: {
            types: [ShippingTypes.COURIER],
          },
          spec: {
            images: [],
            defaultOrder: 0,
            minimumOrder: 0,
            maximumOrder: 0,
            step: 0,
          },
          category: {
            id: "1",
            name: "Category 1",
          },
          productType: null,
          prefferedUnit: Unit.PCS,
        },
      },
    ];
    const result = getSubtotalPrice(orderItems);
    expect(result).toBe(61);
  });
});
