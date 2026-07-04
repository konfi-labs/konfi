import { paymentOptionsForShippingOptions, swrConfig } from "../constants";

describe("constants", () => {
  it("paymentOptionsForShippingOptions", () => {
    expect(paymentOptionsForShippingOptions).toEqual({
      CUSTOM: [
        "ON_DELIVERY",
        "ON_PICKUP",
        "PROFORMA",
        "BANK_TRANSFER",
        "DEFERRED",
        "STRIPE",
        "PRZELEWY24",
        "ALLEGRO",
      ],
      COMPANY_COURIER: [
        "ON_DELIVERY",
        "ON_PICKUP",
        "PROFORMA",
        "BANK_TRANSFER",
        "DEFERRED",
        "STRIPE",
        "PRZELEWY24",
        "ALLEGRO",
      ],
      DHL: [
        "ON_DELIVERY",
        "ON_PICKUP",
        "PROFORMA",
        "BANK_TRANSFER",
        "DEFERRED",
        "STRIPE",
        "PRZELEWY24",
        "ALLEGRO",
      ],
      DPD: [
        "ON_DELIVERY",
        "ON_PICKUP",
        "PROFORMA",
        "BANK_TRANSFER",
        "DEFERRED",
        "STRIPE",
        "PRZELEWY24",
        "ALLEGRO",
      ],
      FEDEX: [
        "ON_DELIVERY",
        "ON_PICKUP",
        "PROFORMA",
        "BANK_TRANSFER",
        "DEFERRED",
        "STRIPE",
        "PRZELEWY24",
        "ALLEGRO",
      ],
      INPOST: [
        "ON_DELIVERY",
        "ON_PICKUP",
        "PROFORMA",
        "BANK_TRANSFER",
        "DEFERRED",
        "STRIPE",
        "PRZELEWY24",
        "ALLEGRO",
      ],
      PACZKOMATY_INPOST: [
        "ON_PICKUP",
        "PROFORMA",
        "BANK_TRANSFER",
        "DEFERRED",
        "STRIPE",
        "PRZELEWY24",
        "ALLEGRO",
      ],
      PERSONAL_COLLECTION: [
        "ON_DELIVERY",
        "ON_PICKUP",
        "PROFORMA",
        "BANK_TRANSFER",
        "DEFERRED",
        "STRIPE",
        "PRZELEWY24",
        "ALLEGRO",
      ],
    });
  });

  it("swrConfig", () => {
    expect(swrConfig).toEqual({
      revalidateOnFocus: false,
    });
  });
});
