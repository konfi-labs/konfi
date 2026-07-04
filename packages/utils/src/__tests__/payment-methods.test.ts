import { PaymentType, ShippingOptions } from "@konfi/types";
import { describe, expect, it } from "vitest";

import type { PaymentMethodsSettings } from "@konfi/types";
import {
  DEFAULT_PAYMENT_METHOD_IDS,
  createPaymentMethodId,
  getAvailablePaymentMethodIds,
  getEnabledPaymentMethodDefinitions,
  getPaymentMethodDefinition,
  getPaymentMethodIdsAllowedForShippingMethod,
  getPaymentMethodLabel,
  getPaymentMethodOptions,
  getPaymentMethodProviderKind,
  hasMissingPaymentMethodDefaultDefinitions,
  humanizePaymentMethodId,
  mergePaymentMethodDefaultDefinitions,
  normalizePaymentMethodsSettings,
} from "../payment-methods";

describe("payment-methods", () => {
  it("generates stable slug ids and resolves collisions", () => {
    expect(createPaymentMethodId("Pay By Link")).toBe("pay-by-link");
    expect(createPaymentMethodId("Płatność odroczona")).toBe(
      "p-atnosc-odroczona",
    );
    expect(createPaymentMethodId("Pay by Link", ["pay-by-link"])).toBe(
      "pay-by-link-2",
    );
  });

  it("creates defaults with legacy ids, providers, and shipping eligibility", () => {
    const settings = normalizePaymentMethodsSettings();

    expect(settings.methods.map((method) => method.id)).toEqual(
      DEFAULT_PAYMENT_METHOD_IDS,
    );
    expect(getPaymentMethodProviderKind(PaymentType.STRIPE, settings)).toBe(
      "stripe",
    );
    expect(
      getPaymentMethodDefinition(PaymentType.STRIPE, settings)
        ?.storefrontEnabled,
    ).toBe(true);
    expect(
      getPaymentMethodDefinition(PaymentType.ON_DELIVERY, settings)
        ?.storefrontEnabled,
    ).toBe(false);
    expect(
      getPaymentMethodIdsAllowedForShippingMethod(
        ShippingOptions.PACZKOMATY_INPOST,
        settings,
      ),
    ).not.toContain(PaymentType.ON_DELIVERY);
  });

  it("keeps archived methods readable but removes them from enabled options", () => {
    const settings = normalizePaymentMethodsSettings({
      methods: [
        {
          id: "terminal",
          name: "Terminal",
          providerKind: "manual",
          allowedShippingMethodIds: [ShippingOptions.PERSONAL_COLLECTION],
          icon: "point_of_sale",
          colorPalette: "teal",
          enabled: false,
          archived: true,
          order: 0,
        },
      ],
    });

    expect(getPaymentMethodDefinition("terminal", settings)?.name).toBe(
      "Terminal",
    );
    expect(getPaymentMethodLabel("terminal", settings)).toBe("Terminal");
    expect(
      getEnabledPaymentMethodDefinitions(settings).some(
        (method) => method.id === "terminal",
      ),
    ).toBe(false);
    expect(getPaymentMethodOptions(settings)).not.toContainEqual({
      label: "Terminal",
      value: "terminal",
    });
  });

  it("uses translated legacy labels and humanizes unknown ids", () => {
    const t = (key: string, options?: { defaultValue?: string }) =>
      key === "PaymentType.BANK_TRANSFER"
        ? "Bank transfer translated"
        : (options?.defaultValue ?? key);

    expect(getPaymentMethodLabel(PaymentType.BANK_TRANSFER, undefined, t)).toBe(
      "Bank transfer translated",
    );
    expect(getPaymentMethodLabel("terminal-payment")).toBe("Terminal Payment");
    expect(humanizePaymentMethodId("ON_DELIVERY")).toBe("On Delivery");
  });

  it("preserves legacy availability when settings are absent", () => {
    expect(
      getAvailablePaymentMethodIds(ShippingOptions.DHL, {
        isStore: true,
      }),
    ).toEqual([PaymentType.STRIPE, PaymentType.PRZELEWY24]);

    expect(
      getAvailablePaymentMethodIds(ShippingOptions.DHL, {
        allowedDeferredPayments: true,
        isStore: false,
      }),
    ).toEqual([
      PaymentType.STRIPE,
      PaymentType.BANK_TRANSFER,
      PaymentType.ON_DELIVERY,
      PaymentType.ON_PICKUP,
      PaymentType.PROFORMA,
      PaymentType.DEFERRED,
      PaymentType.ALLEGRO,
    ]);
  });

  it("uses configured eligibility, enabled state, and provider kind filters", () => {
    const settings = normalizePaymentMethodsSettings({
      methods: [
        {
          id: PaymentType.STRIPE,
          name: "Stripe",
          providerKind: "stripe",
          allowedShippingMethodIds: [ShippingOptions.DHL],
          icon: "credit_card",
          colorPalette: "purple",
          enabled: false,
          archived: false,
          order: 0,
        },
        {
          id: "terminal",
          name: "Terminal",
          providerKind: "manual",
          allowedShippingMethodIds: [ShippingOptions.DHL],
          icon: "point_of_sale",
          colorPalette: "teal",
          enabled: true,
          archived: false,
          order: 1,
        },
      ],
    } satisfies Partial<PaymentMethodsSettings>);

    expect(
      getAvailablePaymentMethodIds(ShippingOptions.DHL, {
        settings,
        isStore: true,
      }),
    ).toEqual([PaymentType.PRZELEWY24]);
    expect(
      getAvailablePaymentMethodIds(ShippingOptions.DHL, {
        settings,
        isStore: false,
      }),
    ).toContain("terminal");
    expect(
      getAvailablePaymentMethodIds(ShippingOptions.DHL, {
        settings,
        isStore: false,
      }),
    ).not.toContain(PaymentType.PRZELEWY24);
  });

  it("requires explicit storefront enablement for delivery payment methods", () => {
    const settings = normalizePaymentMethodsSettings({
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
    } satisfies Partial<PaymentMethodsSettings>);

    expect(
      getAvailablePaymentMethodIds(ShippingOptions.DHL, {
        settings,
        isStore: true,
      }),
    ).toContain(PaymentType.ON_DELIVERY);
    expect(
      getAvailablePaymentMethodIds(ShippingOptions.INPOST, {
        settings,
        isStore: true,
      }),
    ).not.toContain(PaymentType.ON_DELIVERY);
    expect(
      getAvailablePaymentMethodIds(ShippingOptions.DHL, {
        anonymousPackageShipping: true,
        settings,
        isStore: true,
      }),
    ).not.toContain(PaymentType.ON_DELIVERY);
  });

  it("keeps delivery payment methods out of store checkout by default", () => {
    const settings = normalizePaymentMethodsSettings({
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
        },
      ],
    } satisfies Partial<PaymentMethodsSettings>);

    expect(
      getAvailablePaymentMethodIds(ShippingOptions.DHL, {
        settings,
        isStore: true,
      }),
    ).not.toContain(PaymentType.ON_DELIVERY);
  });

  it("merges missing defaults without dropping existing custom methods", () => {
    const settings = {
      methods: [
        {
          id: "terminal",
          name: "Terminal",
          providerKind: "manual",
          allowedShippingMethodIds: [ShippingOptions.PERSONAL_COLLECTION],
          icon: "point_of_sale",
          colorPalette: "teal",
          enabled: true,
          archived: false,
          order: 0,
        },
      ],
    } satisfies Partial<PaymentMethodsSettings>;

    expect(hasMissingPaymentMethodDefaultDefinitions(settings)).toBe(true);

    const merged = mergePaymentMethodDefaultDefinitions(settings);

    expect(hasMissingPaymentMethodDefaultDefinitions(merged)).toBe(false);
    expect(merged.methods.some((method) => method.id === "terminal")).toBe(
      true,
    );
  });
});
