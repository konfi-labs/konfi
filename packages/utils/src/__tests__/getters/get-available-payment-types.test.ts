import { getAvailablePaymentTypes } from "../../getters/get-available-payment-types";
import { PaymentType, ShippingOptions } from "@konfi/types";
import { normalizePaymentMethodsSettings } from "../../payment-methods";

describe("getAvailablePaymentTypes", () => {
  it("should return empty array when shipping option is not provided", () => {
    expect(getAvailablePaymentTypes(undefined as any)).toEqual([]);
  });

  it("should return appropriate payment types for DHL shipping when isStore=true", () => {
    const result = getAvailablePaymentTypes(ShippingOptions.DHL, true);

    // Store orders should have STRIPE and PRZELEWY24
    expect(result).toContain(PaymentType.STRIPE);
    expect(result).toContain(PaymentType.PRZELEWY24);

    // Should not have BANK_TRANSFER without allowedBankPayments flag
    expect(result).not.toContain(PaymentType.BANK_TRANSFER);

    // Should not have DEFERRED without allowedDefferedPayments flag
    expect(result).not.toContain(PaymentType.DEFERRED);
  });

  it("should return appropriate payment types for DHL shipping when isStore=false", () => {
    const result = getAvailablePaymentTypes(ShippingOptions.DHL, false);

    // Non-store orders should include Stripe so admins can create manual payment links.
    expect(result).toContain(PaymentType.STRIPE);
    expect(result).toContain(PaymentType.BANK_TRANSFER);
    expect(result).toContain(PaymentType.ON_DELIVERY);
    expect(result).toContain(PaymentType.ON_PICKUP);
    expect(result).toContain(PaymentType.PROFORMA);
    expect(result).toContain(PaymentType.ALLEGRO);

    // Przelewy24 still requires the store checkout flow.
    expect(result).not.toContain(PaymentType.PRZELEWY24);

    // Should not have DEFERRED without allowedDefferedPayments flag
    expect(result).not.toContain(PaymentType.DEFERRED);
  });

  it("should include BANK_TRANSFER when allowedBankPayments is true for store orders", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      true, // isStore
      true, // allowedBankPayments
    );

    expect(result).toContain(PaymentType.BANK_TRANSFER);
  });

  it("should always include BANK_TRANSFER for non-store orders", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      false, // isStore
    );

    expect(result).toContain(PaymentType.BANK_TRANSFER);
  });

  it("should include DEFERRED when allowedDefferedPayments is true for non-store orders", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      false,
      false,
      true, // allowedDefferedPayments
    );

    expect(result).toContain(PaymentType.DEFERRED);
  });

  it("should include DEFERRED when allowedDefferedPayments is true for store orders", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      true, // isStore
      false,
      true, // allowedDefferedPayments
    );

    expect(result).toContain(PaymentType.DEFERRED);
  });

  it("should include ON_DELIVERY for non-store orders when supported by shipping option", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      false, // isStore
    );

    expect(result).toContain(PaymentType.ON_DELIVERY);
  });

  it("should not include ON_DELIVERY for store orders", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      true, // isStore
    );

    expect(result).not.toContain(PaymentType.ON_DELIVERY);
  });

  it("should include ON_DELIVERY for store orders when enabled in payment method settings", () => {
    const paymentMethodsSettings = normalizePaymentMethodsSettings({
      methods: [
        {
          id: PaymentType.ON_DELIVERY,
          name: "Cash on delivery",
          providerKind: "delivery",
          allowedShippingMethodIds: [ShippingOptions.DHL],
          icon: "local_shipping",
          colorPalette: "orange",
          enabled: true,
          archived: false,
          order: 0,
          storefrontEnabled: true,
        },
      ],
    });
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      true,
      false,
      false,
      false,
      undefined,
      false,
      paymentMethodsSettings,
    );

    expect(result).toContain(PaymentType.ON_DELIVERY);
  });

  it("should remove ON_DELIVERY for anonymous package shipping", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      false,
      false,
      false,
      false,
      undefined,
      true,
    );

    expect(result).not.toContain(PaymentType.ON_DELIVERY);
    expect(result).toContain(PaymentType.BANK_TRANSFER);
  });

  it("should remove configured ON_DELIVERY from store orders for anonymous package shipping", () => {
    const paymentMethodsSettings = normalizePaymentMethodsSettings({
      methods: [
        {
          id: PaymentType.ON_DELIVERY,
          name: "Cash on delivery",
          providerKind: "delivery",
          allowedShippingMethodIds: [ShippingOptions.DHL],
          icon: "local_shipping",
          colorPalette: "orange",
          enabled: true,
          archived: false,
          order: 0,
          storefrontEnabled: true,
        },
      ],
    });
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      true,
      false,
      false,
      false,
      undefined,
      true,
      paymentMethodsSettings,
    );

    expect(result).not.toContain(PaymentType.ON_DELIVERY);
  });

  it("should include STRIPE and PRZELEWY24 for store orders", () => {
    const result = getAvailablePaymentTypes(ShippingOptions.DHL, true);

    // Should include STRIPE and PRZELEWY24 for store orders
    expect(result).toContain(PaymentType.STRIPE);
    expect(result).toContain(PaymentType.PRZELEWY24);

    // The first two elements should be STRIPE and PRZELEWY24
    expect(result[0]).toBe(PaymentType.STRIPE);
    expect(result[1]).toBe(PaymentType.PRZELEWY24);
  });

  it("should include all eligible payment types for isStore=true scenario", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.DHL,
      true, // isStore
      true, // allowedBankPayments
      true, // allowedDefferedPayments
    );

    // Should include all the standard types plus the store-allowed ones
    expect(result).toContain(PaymentType.STRIPE);
    expect(result).toContain(PaymentType.PRZELEWY24);
    expect(result).toContain(PaymentType.BANK_TRANSFER);
    expect(result).toContain(PaymentType.DEFERRED);
  });

  it("should include payment types for PERSONAL_COLLECTION shipping (store)", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.PERSONAL_COLLECTION,
      true,
    );

    expect(result).toContain(PaymentType.STRIPE);
    expect(result).toContain(PaymentType.PRZELEWY24);
  });

  it("should include payment types for PERSONAL_COLLECTION shipping (non-store)", () => {
    const result = getAvailablePaymentTypes(
      ShippingOptions.PERSONAL_COLLECTION,
      false,
    );

    expect(result).toContain(PaymentType.ON_DELIVERY);
    expect(result).toContain(PaymentType.ON_PICKUP);
    expect(result).toContain(PaymentType.PROFORMA);
    expect(result).toContain(PaymentType.BANK_TRANSFER);
    expect(result).toContain(PaymentType.STRIPE);
    expect(result).toContain(PaymentType.ALLEGRO);
  });

  it("should include ON_PICKUP for store orders only when allowed and supported (PERSONAL_COLLECTION)", () => {
    const resultAllowed = getAvailablePaymentTypes(
      ShippingOptions.PERSONAL_COLLECTION,
      true, // isStore
      false, // allowedBankPayments
      false, // allowedDefferedPayments
      true, // allowedOnPickupPayments
    );
    expect(resultAllowed).toContain(PaymentType.ON_PICKUP);

    const resultNotAllowed = getAvailablePaymentTypes(
      ShippingOptions.PERSONAL_COLLECTION,
      true, // isStore
      false, // allowedBankPayments
      false, // allowedDefferedPayments
      false, // allowedOnPickupPayments
    );
    expect(resultNotAllowed).not.toContain(PaymentType.ON_PICKUP);
  });
});
