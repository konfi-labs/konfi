import { AddressTypeEnum } from "@konfi/types";
import { hasShippingDestination } from "../../validators/has-shipping-destination";

describe("hasShippingDestination", () => {
  it("returns true for a complete destination address", () => {
    expect(
      hasShippingDestination({
        name: "Main warehouse",
        type: AddressTypeEnum.SHIPPING,
        nip: "",
        companyName: "",
        street: "Marszalkowska",
        number: "10",
        local: "",
        zip: "00-001",
        city: "Warsaw",
        country: "Polska",
        active: true,
      }),
    ).toBe(true);
  });

  it("returns false when shipping is null", () => {
    expect(hasShippingDestination(null)).toBe(false);
  });

  it("returns false when the destination is incomplete", () => {
    expect(
      hasShippingDestination({
        name: "Pickup point",
        type: AddressTypeEnum.SHIPPING,
        nip: "",
        companyName: "",
        street: "   ",
        number: "",
        local: "",
        zip: "00-001",
        city: "Warsaw",
        country: "Polska",
        active: true,
      }),
    ).toBe(false);
  });

  it("returns false when required address fields are undefined", () => {
    expect(
      hasShippingDestination({
        name: "Pickup point",
        type: AddressTypeEnum.SHIPPING,
        active: true,
      }),
    ).toBe(false);
  });
});
