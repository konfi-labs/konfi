import { ShippingOptions, ShippingTypes } from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  createDefaultShippingMethodsSettings,
  createShippingMethodId,
  getEnabledShippingMethodDefinitions,
  getShippingMethodDefinition,
  getShippingMethodIcon,
  getShippingMethodLabel,
  getShippingMethodOptions,
  getShippingMethodPrice,
  hasMissingDefaultShippingMethods,
  humanizeShippingMethodId,
  isShippingMethodEligible,
  mapShippingProviderToMethodId,
  mergeShippingMethodsSettingsWithDefaults,
  normalizeShippingMethodsSettings,
} from "../shipping-methods";

describe("shipping-methods", () => {
  it("creates legacy defaults with preserved ids and pickup metadata", () => {
    const settings = createDefaultShippingMethodsSettings();

    expect(settings.methods.map((method) => method.id)).toEqual([
      ShippingOptions.CUSTOM,
      ShippingOptions.COMPANY_COURIER,
      ShippingOptions.PERSONAL_COLLECTION,
      ShippingOptions.INPOST,
      ShippingOptions.PACZKOMATY_INPOST,
      ShippingOptions.DHL,
      ShippingOptions.DPD,
      ShippingOptions.FEDEX,
    ]);
    expect(
      getShippingMethodDefinition(ShippingOptions.PACZKOMATY_INPOST, settings)
        ?.supportsPickupPoint,
    ).toBe(true);
    expect(
      getShippingMethodDefinition(ShippingOptions.PERSONAL_COLLECTION, settings)
        ?.kind,
    ).toBe(ShippingTypes.PERSONAL_COLLECTION);
  });

  it("generates stable slug ids and resolves collisions", () => {
    expect(createShippingMethodId("UPS + Access Point")).toBe(
      "ups-access-point",
    );
    expect(createShippingMethodId("Zażółć gęślą jaźń")).toBe(
      "zazo-c-gesla-jazn",
    );
    expect(
      createShippingMethodId("UPS Access Point", ["ups-access-point"]),
    ).toBe("ups-access-point-2");
  });

  it("keeps archived methods readable but removes them from enabled options", () => {
    const settings = normalizeShippingMethodsSettings({
      methods: [
        {
          id: "bike-courier",
          name: "Bike Courier",
          kind: ShippingTypes.COURIER,
          provider: "bike",
          supportsPickupPoint: false,
          icon: "delivery_truck_speed",
          colorPalette: "green",
          enabled: false,
          archived: true,
          order: 0,
        },
      ],
    });

    expect(getShippingMethodDefinition("bike-courier", settings)?.name).toBe(
      "Bike Courier",
    );
    expect(getShippingMethodLabel("bike-courier", settings)).toBe(
      "Bike Courier",
    );
    expect(
      getEnabledShippingMethodDefinitions(settings).some(
        (method) => method.id === "bike-courier",
      ),
    ).toBe(false);
    expect(getShippingMethodOptions(settings)).not.toContainEqual({
      label: "Bike Courier",
      value: "bike-courier",
    });
  });

  it("uses translated legacy labels and humanizes unknown ids", () => {
    const t = (key: string, options?: { defaultValue?: string }) =>
      key === "ShippingOptions.DPD"
        ? "DPD translated"
        : (options?.defaultValue ?? key);

    expect(getShippingMethodLabel(ShippingOptions.DPD, undefined, t)).toBe(
      "DPD translated",
    );
    expect(getShippingMethodLabel("same-day-bike")).toBe("Same Day Bike");
    expect(humanizeShippingMethodId("PACZKOMATY_INPOST")).toBe(
      "Paczkomaty Inpost",
    );
    expect(getShippingMethodIcon("same-day-bike")).toBe("local_shipping");
  });

  it("maps provider names to configured methods with legacy fallback", () => {
    const settings = normalizeShippingMethodsSettings({
      methods: [
        {
          id: "ups-standard",
          name: "UPS Standard",
          kind: ShippingTypes.COURIER,
          provider: "ups",
          supportsPickupPoint: false,
          icon: "local_shipping",
          colorPalette: "brown",
          enabled: true,
          archived: false,
          order: 0,
        },
      ],
    });

    expect(
      mapShippingProviderToMethodId("InPost Paczkomat 24/7", settings),
    ).toBe(ShippingOptions.PACZKOMATY_INPOST);
    expect(mapShippingProviderToMethodId("DHL Express", settings)).toBe(
      ShippingOptions.DHL,
    );
    expect(mapShippingProviderToMethodId("UPS Standard", settings)).toBe(
      "ups-standard",
    );
    expect(mapShippingProviderToMethodId("Unknown Carrier", settings)).toBe(
      ShippingOptions.CUSTOM,
    );
  });

  it("merges missing defaults without removing existing definitions", () => {
    const settings = {
      methods: [
        {
          id: ShippingOptions.DHL,
          name: "DHL Express",
          kind: ShippingTypes.COURIER,
          provider: "dhl",
          supportsPickupPoint: false,
          icon: "local_shipping",
          colorPalette: "red",
          enabled: false,
          archived: true,
          order: 0,
        },
      ],
    };

    expect(hasMissingDefaultShippingMethods(settings)).toBe(true);

    const merged = mergeShippingMethodsSettingsWithDefaults(settings);

    expect(hasMissingDefaultShippingMethods(merged)).toBe(false);
    expect(merged.methods.map((method) => method.id)).toEqual(
      expect.arrayContaining([
        ShippingOptions.CUSTOM,
        ShippingOptions.COMPANY_COURIER,
        ShippingOptions.PERSONAL_COLLECTION,
        ShippingOptions.INPOST,
        ShippingOptions.PACZKOMATY_INPOST,
        ShippingOptions.DHL,
        ShippingOptions.DPD,
        ShippingOptions.FEDEX,
      ]),
    );
    expect(
      getShippingMethodDefinition(ShippingOptions.DHL, merged),
    ).toMatchObject({
      archived: true,
      enabled: false,
      name: "DHL Express",
    });
  });

  it("filters methods by optional eligibility rules", () => {
    const settings = normalizeShippingMethodsSettings({
      methods: [
        {
          id: "warsaw-bike",
          name: "Warsaw Bike",
          kind: ShippingTypes.COURIER,
          provider: "bike",
          supportsPickupPoint: false,
          icon: "delivery_truck_speed",
          colorPalette: "green",
          enabled: true,
          archived: false,
          order: 0,
          rules: {
            enabled: true,
            conditions: {
              countries: ["pl"],
              postalCodePrefixes: ["00", "01"],
              productTypeIds: ["business-cards"],
              minSubtotal: 5000,
              maxSubtotal: 50000,
            },
          },
        },
      ],
    });
    const method = getShippingMethodDefinition("warsaw-bike", settings);

    expect(method).toBeDefined();
    expect(
      method &&
        isShippingMethodEligible(method, {
          country: "PL",
          postalCode: "00-001",
          productTypeIds: ["business-cards"],
          subtotal: 10000,
        }),
    ).toBe(true);
    expect(
      method &&
        isShippingMethodEligible(method, {
          country: "DE",
          postalCode: "00-001",
          productTypeIds: ["business-cards"],
          subtotal: 10000,
        }),
    ).toBe(false);
    expect(
      method &&
        isShippingMethodEligible(method, {
          country: "PL",
          postalCode: "02-001",
          productTypeIds: ["business-cards"],
          subtotal: 10000,
        }),
    ).toBe(false);
  });

  it("applies method-specific free shipping thresholds", () => {
    const settings = normalizeShippingMethodsSettings({
      methods: [
        {
          id: ShippingOptions.DPD,
          name: "DPD",
          kind: ShippingTypes.COURIER,
          provider: "dpd",
          supportsPickupPoint: false,
          icon: "local_shipping",
          colorPalette: "purple",
          enabled: true,
          archived: false,
          order: 0,
          rules: {
            enabled: true,
            freeShippingThreshold: 20000,
          },
        },
      ],
    });

    expect(
      getShippingMethodPrice(ShippingOptions.DPD, 3000, settings, {
        subtotal: 19999,
      }),
    ).toBe(3000);
    expect(
      getShippingMethodPrice(ShippingOptions.DPD, 3000, settings, {
        subtotal: 20000,
      }),
    ).toBe(0);
  });
});
