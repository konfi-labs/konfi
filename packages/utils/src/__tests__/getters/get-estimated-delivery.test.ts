import {
  CurrencyEnum,
  Discount,
  OrderItem,
  PriceTypeEnum,
  ShippingTypes,
  Unit,
} from "@konfi/types";
import { getEstimatedDelivery } from "../../getters/get-estimated-delivery";

describe("getEstimatedDelivery", () => {
  it("should return null if items is null", () => {
    const items = null;
    const result = getEstimatedDelivery(items);
    expect(result).toBeNull();
  });

  it("should return null if items is undefined", () => {
    const items = undefined;
    const result = getEstimatedDelivery(items);
    expect(result).toBeNull();
  });

  it("should return null if items array is empty", () => {
    const items: OrderItem[] = [];
    const result = getEstimatedDelivery(items);
    expect(result).toBeNull();
  });

  it("should return null if no items with MATRIX price type", () => {
    //Create mock items
    const items: OrderItem[] = [
      {
        description: "",
        customFormat: false,
        totalPrice: 0,
        customPrice: 0,
        quantity: 0,
        discount: new Discount(),
        unit: Unit.PCS,
        id: "1",
        name: "",
        product: {
          id: "1",
          name: "Product 1",
          prices: [],
          defaultPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          lowPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          highPrice: {
            value: 100,
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
    const result = getEstimatedDelivery(items);
    expect(result).toBeNull();
  });

  it("should return the correct estimated delivery date", () => {
    const items: OrderItem[] = [
      {
        description: "",
        customFormat: false,
        totalPrice: 0,
        customPrice: 0,
        quantity: 0,
        discount: new Discount(),
        calculatedCombination: "combination1",
        unit: Unit.PCS,
        id: "1",
        name: "",
        volume: 10,
        product: {
          id: "1",
          name: "Product 1",
          prices: [
            {
              currency: CurrencyEnum.PLN,
              value: 100,
              combination: {
                id: "combination1",
                active: true,
                customFormat: false,
              },
              volume: {
                value: 10,
                deliveryTime: 2,
              },
            },
          ],
          defaultPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          lowPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          highPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          description: "Product 1 description",
          priceType: PriceTypeEnum.MATRIX,
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

    const result = getEstimatedDelivery(items);

    const workDay = new Date();

    // Adjust for after-hours
    if (workDay.getHours() >= 16) {
      workDay.setDate(workDay.getDate() + 1);
    }

    const year = workDay.getFullYear();
    const publicHolidays = [
      new Date(year, 0, 1),
      new Date(year, 0, 6),
      new Date(year, 3, 21),
      new Date(year, 4, 1),
      new Date(year, 4, 3),
      new Date(year, 4, 19),
      new Date(year, 4, 30),
      new Date(year, 7, 15),
      new Date(year, 10, 1),
      new Date(year, 10, 11),
      new Date(year, 11, 25),
      new Date(year, 11, 26),
    ];

    const isHoliday = (date: Date) => {
      return publicHolidays.some(
        (h) =>
          h.getDate() === date.getDate() &&
          h.getMonth() === date.getMonth() &&
          h.getFullYear() === date.getFullYear(),
      );
    };

    // Skip weekends and public holidays
    const skipNonWorkingDays = (date: Date) => {
      while (
        date.getDay() === 6 || // Saturday
        date.getDay() === 0 || // Sunday
        isHoliday(date)
      ) {
        date.setDate(date.getDate() + 1);
      }
    };

    skipNonWorkingDays(workDay);

    let timeToDeliver = 2;
    let estimatedDelivery = new Date(workDay);

    while (timeToDeliver > 0) {
      estimatedDelivery.setDate(estimatedDelivery.getDate() + 1);

      if (
        estimatedDelivery.getDay() === 6 || // Saturday
        estimatedDelivery.getDay() === 0 || // Sunday
        isHoliday(estimatedDelivery)
      ) {
        continue;
      }

      timeToDeliver--;
    }

    // Set milliseconds to zero to prevent minor discrepancies
    result?.setMilliseconds(0);
    estimatedDelivery.setMilliseconds(0);

    expect(result?.getTime()).toEqual(estimatedDelivery.getTime());
  });

  it("should use resolved dynamic price delivery times", () => {
    const items: OrderItem[] = [
      {
        description: "",
        customFormat: false,
        totalPrice: 0,
        customPrice: 0,
        quantity: 1,
        discount: new Discount(),
        calculatedCombination: "combination1",
        unit: Unit.PCS,
        id: "1",
        name: "",
        volume: 10,
        product: {
          id: "1",
          name: "Product 1",
          prices: [
            {
              currency: CurrencyEnum.PLN,
              value: 100,
              combination: {
                id: "combination1",
                active: true,
                customFormat: false,
              },
              volume: {
                value: 10,
                deliveryTime: 3,
              },
            },
          ],
          defaultPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          lowPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          highPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          description: "Product 1 description",
          priceType: PriceTypeEnum.DYNAMIC,
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

    const result = getEstimatedDelivery(items);
    const expected = getEstimatedDelivery(3);

    result?.setMilliseconds(0);
    expected?.setMilliseconds(0);

    expect(result?.getTime()).toEqual(expected?.getTime());
  });

  it("uses a product deadline override when linked channel estimates require a later store deadline", () => {
    const items: OrderItem[] = [
      {
        description: "",
        customFormat: false,
        totalPrice: 0,
        customPrice: 0,
        quantity: 1,
        discount: new Discount(),
        calculatedCombination: "combination1",
        unit: Unit.PCS,
        id: "1",
        name: "",
        volume: 10,
        product: {
          id: "1",
          name: "Product 1",
          deadlineDeliveryTime: 3,
          prices: [
            {
              currency: CurrencyEnum.PLN,
              value: 100,
              combination: {
                id: "combination1",
                active: true,
                customFormat: false,
              },
              volume: {
                value: 10,
                deliveryTime: 1,
              },
            },
          ],
          defaultPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          lowPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          highPrice: {
            value: 100,
            currency: CurrencyEnum.PLN,
          },
          description: "Product 1 description",
          priceType: PriceTypeEnum.MATRIX,
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

    const result = getEstimatedDelivery(items);
    const expected = getEstimatedDelivery(3);

    result?.setMilliseconds(0);
    expected?.setMilliseconds(0);

    expect(result?.getTime()).toEqual(expected?.getTime());
  });
});
