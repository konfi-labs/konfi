import { describe, expect, it } from "vitest";
import type { BusinessTaxonomyDefinition } from "@konfi/types";

import {
  createBusinessTaxonomyId,
  getConfigurableDefinitionLabel,
  getConfigurableOptions,
  humanizeBusinessTaxonomyId,
  isValidBusinessTaxonomyId,
  normalizeConfigurableDefinitions,
} from "../business-taxonomy";

describe("business-taxonomy", () => {
  const defaults: BusinessTaxonomyDefinition[] = [
    {
      id: "LEGACY",
      name: "Legacy",
      icon: "tag",
      colorPalette: "blue",
      enabled: true,
      archived: false,
      isDefault: true,
      order: 0,
    },
  ];

  it("creates immutable slug ids with collision suffixes", () => {
    expect(createBusinessTaxonomyId("Zażółć gęślą jaźń")).toBe(
      "zazo-c-gesla-jazn",
    );
    expect(createBusinessTaxonomyId("Custom Value", ["custom-value"])).toBe(
      "custom-value-2",
    );
  });

  it("keeps collision suffixes within the configured maximum id length", () => {
    const id = createBusinessTaxonomyId(
      "A very long custom value",
      ["a-very-long"],
      {
        maxLength: 11,
      },
    );

    expect(id).toBe("a-very-lo-2");
    expect(isValidBusinessTaxonomyId(id, 11)).toBe(true);
  });

  it("normalizes defaults, keeps archived values readable, and hides them from options", () => {
    const definitions = normalizeConfigurableDefinitions(defaults, [
      {
        id: "legacy",
        name: "",
        enabled: false,
        archived: true,
        order: 1,
      },
    ]);

    expect(definitions.map((definition) => definition.id)).toEqual([
      "LEGACY",
      "legacy",
    ]);
    expect(getConfigurableOptions(definitions)).toEqual([
      { label: "Legacy", value: "LEGACY" },
    ]);
    expect(getConfigurableDefinitionLabel("legacy", definitions)).toBe(
      "Legacy",
    );
  });

  it("uses translated default labels and humanizes unknown ids", () => {
    const definitions = normalizeConfigurableDefinitions(defaults, []);
    const t = (key: string, options?: { defaultValue?: string }) =>
      key === "Taxonomy.LEGACY" ? "Translated" : (options?.defaultValue ?? key);

    expect(
      getConfigurableDefinitionLabel("LEGACY", definitions, {
        t,
        translationKeyPrefix: "Taxonomy",
      }),
    ).toBe("Translated");
    expect(humanizeBusinessTaxonomyId("CUSTOM_STATUS")).toBe("Custom Status");
  });

  it("translates default option labels and keeps custom names untouched", () => {
    const definitions = normalizeConfigurableDefinitions(defaults, [
      {
        id: "custom-value",
        name: "Custom Value",
        enabled: true,
        archived: false,
        order: 1,
      },
    ]);
    const t = (key: string, options?: { defaultValue?: string }) =>
      key === "Taxonomy.LEGACY" ? "Translated" : (options?.defaultValue ?? key);

    expect(
      getConfigurableOptions(definitions, {
        t,
        translationKeyPrefix: "Taxonomy",
      }),
    ).toEqual([
      { label: "Translated", value: "LEGACY" },
      { label: "Custom Value", value: "custom-value" },
    ]);
  });

  it("normalizes localized names and prefers the requested locale for custom labels", () => {
    const definitions = normalizeConfigurableDefinitions(defaults, [
      {
        id: "custom-value",
        name: "Custom Value",
        localizedNames: {
          en: "English Value",
          pl: "Polska wartość",
          de: "Nicht unterstützt",
        } as unknown as BusinessTaxonomyDefinition["localizedNames"],
        enabled: true,
        archived: false,
        order: 1,
      },
    ]);

    expect(definitions[1].localizedNames).toEqual({
      de: "Nicht unterstützt",
      en: "English Value",
      pl: "Polska wartość",
    });
    expect(
      getConfigurableDefinitionLabel("custom-value", definitions, {
        locale: "de-DE",
      }),
    ).toBe("Nicht unterstützt");
    expect(
      getConfigurableDefinitionLabel("custom-value", definitions, {
        locale: "pl-PL",
      }),
    ).toBe("Polska wartość");
    expect(
      getConfigurableOptions(definitions, {
        locale: "en",
      })[1],
    ).toEqual({ label: "English Value", value: "custom-value" });
  });
});
