import { ShippingOptions, Tracking } from "@konfi/types";
export function detectCourier(trackingNumber: string): Tracking | null {
  const couriers = [
    {
      shippingOption: ShippingOptions.DHL,
      pattern: /^[A-Z0-9]{11}$/,
      link: "https://www.dhl.com/pl-pl/home/tracking.html?tracking-id=",
    },
    {
      shippingOption: ShippingOptions.DPD,
      pattern: /^[A-Z0-9]{14}$/,
      link: "https://tracktrace.dpd.com.pl/parcelDetails?p1=",
    },
    {
      shippingOption: ShippingOptions.PACZKOMATY_INPOST,
      pattern: /^[A-Z0-9]{24}$/,
      link: "https://inpost.pl/sledzenie-przesylek?number=",
    },
  ];

  for (const courier of couriers) {
    if (courier.pattern.test(trackingNumber)) {
      return {
        shippingOption: courier.shippingOption,
        number: trackingNumber,
        link: `${courier.link}${trackingNumber}`,
      };
    }
  }

  return null;
}
