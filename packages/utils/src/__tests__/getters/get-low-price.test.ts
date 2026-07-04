import { getLowPrice } from "../../getters/get-low-price";
import { CurrencyEnum } from "@konfi/types";
import { formatPrice } from "../../formatters";

describe("getLowPrice", () => {
  it("should return formatted price when prices are provided", () => {
    const prices = [
      { value: 10, threshold: 5, currency: CurrencyEnum.PLN },
      { value: 20, threshold: 10, currency: CurrencyEnum.PLN },
      { value: 30, threshold: 15, currency: CurrencyEnum.PLN },
    ];
    const minOrder = 7;
    const expectedPrice = formatPrice(10, CurrencyEnum.PLN);

    const result = getLowPrice(prices, minOrder);

    expect(result).toBe(expectedPrice);
  });

  it("should return formatted price when prices contain undefined values", () => {
    const prices = [
      { value: undefined, threshold: 5, currency: CurrencyEnum.PLN },
      { value: 20, threshold: 10, currency: CurrencyEnum.PLN },
      { value: 30, threshold: 15, currency: CurrencyEnum.PLN },
    ];
    const minOrder = 7;
    const expectedPrice = formatPrice(20, CurrencyEnum.PLN);

    const result = getLowPrice(prices, minOrder);

    expect(result).toBe(expectedPrice);
  });

  it("should return formatted price when prices contain NaN values", () => {
    const prices = [
      { value: NaN, threshold: 5, currency: CurrencyEnum.PLN },
      { value: 20, threshold: 10, currency: CurrencyEnum.PLN },
      { value: 30, threshold: 15, currency: CurrencyEnum.PLN },
    ];
    const minOrder = 7;
    const expectedPrice = formatPrice(20, CurrencyEnum.PLN);

    const result = getLowPrice(prices, minOrder);

    expect(result).toBe(expectedPrice);
  });

  it("should return formatted price when prices contain undefined and NaN values", () => {
    const prices = [
      { value: undefined, threshold: 5, currency: CurrencyEnum.PLN },
      { value: NaN, threshold: 10, currency: CurrencyEnum.PLN },
      { value: 30, threshold: 15, currency: CurrencyEnum.PLN },
    ];
    const minOrder = 7;
    const expectedPrice = formatPrice(30, CurrencyEnum.PLN);

    const result = getLowPrice(prices, minOrder);

    expect(result).toBe(expectedPrice);
  });

  it("should return formatted price when prices contain volume values", () => {
    const prices = [
      {
        value: 10,
        threshold: 5,
        volume: { value: 2, deliveryTime: 2 },
        currency: CurrencyEnum.PLN,
      },
      {
        value: 20,
        threshold: 10,
        volume: { value: 3, deliveryTime: 2 },
        currency: CurrencyEnum.PLN,
      },
      {
        value: 30,
        threshold: 15,
        volume: { value: 4, deliveryTime: 2 },
        currency: CurrencyEnum.PLN,
      },
    ];
    const minOrder = 7;
    const expectedPrice = formatPrice(10, CurrencyEnum.PLN);

    const result = getLowPrice(prices, minOrder);

    expect(result).toBe(expectedPrice);
  });

  it("should return formatted price when prices contain negative values", () => {
    const prices = [
      { value: -10, threshold: 5, currency: CurrencyEnum.PLN },
      { value: -20, threshold: 10, currency: CurrencyEnum.PLN },
      { value: -30, threshold: 15, currency: CurrencyEnum.PLN },
    ];
    const minOrder = 7;
    const expectedPrice = formatPrice(-10, CurrencyEnum.PLN);

    const result = getLowPrice(prices, minOrder);

    expect(result).toBe(expectedPrice);
  });

  it("should return formatted price when prices contain zero values", () => {
    const prices = [
      { value: 0, threshold: 5, currency: CurrencyEnum.PLN },
      { value: 0, threshold: 10, currency: CurrencyEnum.PLN },
      { value: 0, threshold: 15, currency: CurrencyEnum.PLN },
    ];
    const minOrder = 7;
    const expectedPrice = formatPrice(0, CurrencyEnum.PLN);

    const result = getLowPrice(prices, minOrder);

    expect(result).toBe(expectedPrice);
  });
});
