import { detectCourier } from "../../getters/get-courier-by-tracking-number";
import { ShippingOptions } from "@konfi/types";

describe("detectCourier", () => {
  it("should return the courier and tracking link for a valid DHL tracking number", () => {
    const trackingNumber = "1234567890A";
    const result = detectCourier(trackingNumber);
    expect(result).toEqual({
      shippingOption: ShippingOptions.DHL,
      number: trackingNumber,
      link: "https://www.dhl.com/pl-pl/home/tracking.html?tracking-id=1234567890A",
    });
  });

  it("should return the courier and tracking link for a valid DPD tracking number", () => {
    const trackingNumber = "12345678901234";
    const result = detectCourier(trackingNumber);
    expect(result).toEqual({
      shippingOption: ShippingOptions.DPD,
      number: trackingNumber,
      link: "https://tracktrace.dpd.com.pl/parcelDetails?p1=12345678901234",
    });
  });

  it("should return the courier and tracking link for a valid InPost tracking number", () => {
    const trackingNumber = "873234987612340872938732";
    const result = detectCourier(trackingNumber);
    expect(result).toEqual({
      shippingOption: ShippingOptions.PACZKOMATY_INPOST,
      number: trackingNumber,
      link: "https://inpost.pl/sledzenie-przesylek?number=873234987612340872938732",
    });
  });

  it("should return null for an invalid tracking number", () => {
    const trackingNumber = "invalid";
    const result = detectCourier(trackingNumber);
    expect(result).toBeNull();
  });
});
