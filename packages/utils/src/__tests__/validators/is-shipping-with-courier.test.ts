import { isShippingWithCourier } from "../../validators/is-shipping-with-courier";
import {
  ShippingOptions,
  ShippingTypes,
  type ShippingMethodsSettings,
} from "@konfi/types";

describe("isShippingWithCourier", () => {
  it("should return true for courier shipping options", () => {
    expect(isShippingWithCourier(ShippingOptions.COMPANY_COURIER)).toBe(true);
    expect(isShippingWithCourier(ShippingOptions.DHL)).toBe(true);
    expect(isShippingWithCourier(ShippingOptions.DPD)).toBe(true);
    expect(isShippingWithCourier(ShippingOptions.FEDEX)).toBe(true);
    expect(isShippingWithCourier(ShippingOptions.INPOST)).toBe(true);
    expect(isShippingWithCourier(ShippingOptions.PACZKOMATY_INPOST)).toBe(true);
  });

  it("should return false for non-courier shipping options", () => {
    expect(isShippingWithCourier(ShippingOptions.PERSONAL_COLLECTION)).toBe(
      false,
    );
  });

  it("should return false for null shipping option", () => {
    expect(isShippingWithCourier(null)).toBe(false);
  });

  it("should use configured shipping method kind for custom courier ids", () => {
    const settings: ShippingMethodsSettings = {
      methods: [
        {
          id: "bike-courier",
          name: "Bike Courier",
          label: "Bike Courier",
          kind: ShippingTypes.COURIER,
          provider: "bike",
          supportsPickupPoint: false,
          enabled: true,
          archived: false,
          order: 0,
          icon: "pedal_bike",
          colorPalette: "green",
        },
        {
          id: "front-desk",
          name: "Front Desk",
          label: "Front Desk",
          kind: ShippingTypes.PERSONAL_COLLECTION,
          provider: "pickup",
          supportsPickupPoint: false,
          enabled: true,
          archived: false,
          order: 1,
          icon: "storefront",
          colorPalette: "gray",
        },
      ],
    };

    expect(isShippingWithCourier("bike-courier", true, settings)).toBe(true);
    expect(isShippingWithCourier("front-desk", true, settings)).toBe(false);
  });
});
