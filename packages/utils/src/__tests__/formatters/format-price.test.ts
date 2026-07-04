import { formatPrice } from "../../formatters";
import { CurrencyEnum } from "@konfi/types";

describe("formatPrice", () => {
  it("should format the price correctly without currency and unit", () => {
    const price = 1000;
    const expected = "10.00".replace(/\s/g, "");
    const result = formatPrice(price).replace(/\s/g, "");
    expect(result).toBe(expected);
  });

  it("should format the price correctly with currency and unit", () => {
    const price = 1000;
    const currency = CurrencyEnum.PLN;
    const unit = "kg";
    const expected = "10,00 zł/kg".replace(/\s/g, "");
    const result = formatPrice(price, currency, undefined, unit).replace(
      /\s/g,
      "",
    );
    expect(result).toBe(expected);
  });

  it("should show 3 decimal places for sub-penny prices like 0.005 PLN", () => {
    // raw stored value of 0.5 (groszy) → 0.5 / 100 = 0.005 PLN
    const price = 0.5;
    const result = formatPrice(price, CurrencyEnum.PLN).replace(/\s/g, "");
    expect(result).toBe("0,005zł");
  });

  it("should show 3 decimal places without currency for 0.005 PLN", () => {
    const price = 0.5;
    const result = formatPrice(price);
    expect(result).toBe("0.005");
  });

  it("should show 4 decimal places for 0.0005 PLN values", () => {
    // raw value 0.05 → 0.05 / 100 = 0.0005 PLN
    const price = 0.05;
    const result = formatPrice(price, CurrencyEnum.PLN).replace(/\s/g, "");
    expect(result).toBe("0,0005zł");
  });

  it("should keep 2 decimal places for prices >= 0.01 PLN", () => {
    // raw value 1 → 1 / 100 = 0.01 PLN
    const price = 1;
    const result = formatPrice(price, CurrencyEnum.PLN).replace(/\s/g, "");
    expect(result).toBe("0,01zł");
  });

  it("falls back to the default locale for invalid locale values", () => {
    const result = formatPrice(
      1000,
      CurrencyEnum.PLN,
      undefined,
      undefined,
      "enhttps:",
    ).replace(/\s/g, "");

    expect(result).toBe("10,00zł");
  });

  it("formats currencies that use zero minor unit digits", () => {
    const result = formatPrice(1234, "JPY", undefined, undefined, "en", {
      minorUnitDigits: 0,
    }).replace(/\s/g, "");

    expect(result).toBe("¥1,234");
  });
});
