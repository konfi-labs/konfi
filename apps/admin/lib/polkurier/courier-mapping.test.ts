import { ShippingOptions } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  findPolkurierCourierForShippingOption,
  mapShippingOptionToPolkurierCourier,
} from "./courier-mapping";

describe("mapShippingOptionToPolkurierCourier", () => {
  it("maps order shipping options to base Polkurier courier codes", () => {
    expect(mapShippingOptionToPolkurierCourier(ShippingOptions.DHL)).toBe(
      "DHL",
    );
    expect(mapShippingOptionToPolkurierCourier(ShippingOptions.DPD)).toBe(
      "DPD",
    );
    expect(mapShippingOptionToPolkurierCourier(ShippingOptions.FEDEX)).toBe(
      "FEDEX",
    );
    expect(mapShippingOptionToPolkurierCourier(ShippingOptions.INPOST)).toBe(
      "INPOST",
    );
    expect(
      mapShippingOptionToPolkurierCourier(ShippingOptions.PACZKOMATY_INPOST),
    ).toBe("INPOST_PACZKOMAT");
  });
});

describe("findPolkurierCourierForShippingOption", () => {
  it("prefers exact courier code matches", () => {
    expect(
      findPolkurierCourierForShippingOption(ShippingOptions.DPD, [
        { value: "DHL" },
        { value: "DPD" },
      ]),
    ).toBe("DPD");
  });

  it("matches service-specific Polkurier codes for courier options", () => {
    expect(
      findPolkurierCourierForShippingOption(ShippingOptions.DPD, [
        { value: "DHL_STANDARD" },
        { value: "DPD_CLASSIC" },
      ]),
    ).toBe("DPD_CLASSIC");
  });

  it("does not preselect parcel lockers for regular InPost courier shipping", () => {
    expect(
      findPolkurierCourierForShippingOption(ShippingOptions.INPOST, [
        { value: "INPOST_PACZKOMAT" },
        { value: "INPOST_KURIER" },
      ]),
    ).toBe("INPOST_KURIER");
  });

  it("preselects parcel lockers for InPost locker shipping", () => {
    expect(
      findPolkurierCourierForShippingOption(ShippingOptions.PACZKOMATY_INPOST, [
        { value: "INPOST_KURIER" },
        { value: "INPOST_PACZKOMAT" },
      ]),
    ).toBe("INPOST_PACZKOMAT");
  });

  it("falls back to DHL for unsupported shipping options when available", () => {
    expect(
      findPolkurierCourierForShippingOption(
        ShippingOptions.PERSONAL_COLLECTION,
        [{ value: "DPD" }, { value: "DHL" }],
      ),
    ).toBe("DHL");
  });
});
