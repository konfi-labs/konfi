import { ProofingOptions, Unit } from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  createProofingMethodId,
  createUnitId,
  getEnabledProofingMethodDefinitions,
  getEnabledUnitDefinitions,
  getProofingMethodDefinition,
  getProofingMethodLabel,
  getProofingMethodOptions,
  getUnitAbbreviation,
  getUnitDefinition,
  getUnitLabel,
  getUnitOptions,
  getUnitPrecision,
  humanizeProofingMethodId,
  humanizeUnitId,
  normalizeUnitsProofingSettings,
} from "../units-proofing";

describe("units-proofing", () => {
  it("generates stable slug ids and resolves collisions", () => {
    expect(createUnitId("Square yard")).toBe("square-yard");
    expect(createUnitId("Zażółć gęślą jaźń")).toBe("zazo-c-gesla-jazn");
    expect(createUnitId("Square yard", ["square-yard"])).toBe("square-yard-2");

    expect(createProofingMethodId("Customer PDF proof")).toBe(
      "customer-pdf-proof",
    );
    expect(
      createProofingMethodId("Customer PDF proof", ["customer-pdf-proof"]),
    ).toBe("customer-pdf-proof-2");
  });

  it("merges legacy defaults and keeps archived custom units readable", () => {
    const settings = normalizeUnitsProofingSettings({
      units: [
        {
          id: Unit.PCS,
          name: "Items",
          abbreviation: "it.",
          precision: 9,
          enabled: true,
          order: 10,
        },
        {
          id: "linear-foot",
          name: "Linear foot",
          abbreviation: "lf",
          precision: 2,
          icon: "straighten",
          colorPalette: "cyan",
          enabled: false,
          archived: true,
          order: 0,
        },
      ],
    });

    expect(settings.units.map((unit) => unit.id)).toContain(Unit.M2);
    expect(getUnitDefinition(Unit.PCS, settings)).toMatchObject({
      abbreviation: "it.",
      isDefault: true,
      name: "Items",
      precision: 6,
    });
    expect(getUnitDefinition("linear-foot", settings)?.name).toBe(
      "Linear foot",
    );
    expect(getUnitAbbreviation("linear-foot", settings)).toBe("lf");
    expect(
      getEnabledUnitDefinitions(settings).some(
        (unit) => unit.id === "linear-foot",
      ),
    ).toBe(false);
    expect(getUnitOptions(settings)).not.toContainEqual({
      label: "lf",
      value: "linear-foot",
    });
  });

  it("keeps archived proofing methods readable but removes them from enabled options", () => {
    const settings = normalizeUnitsProofingSettings({
      proofingMethods: [
        {
          id: "soft-proof",
          name: "Soft proof",
          icon: "image_search",
          colorPalette: "blue",
          enabled: false,
          archived: true,
          order: 0,
        },
      ],
    });

    expect(settings.proofingMethods.map((method) => method.id)).toContain(
      ProofingOptions.RUN_AS_IS,
    );
    expect(getProofingMethodDefinition("soft-proof", settings)?.name).toBe(
      "Soft proof",
    );
    expect(getProofingMethodLabel("soft-proof", settings)).toBe("Soft proof");
    expect(
      getEnabledProofingMethodDefinitions(settings).some(
        (method) => method.id === "soft-proof",
      ),
    ).toBe(false);
    expect(getProofingMethodOptions(settings)).not.toContainEqual({
      label: "Soft proof",
      value: "soft-proof",
    });
  });

  it("uses translated legacy labels and humanizes unknown ids", () => {
    const t = (key: string, options?: { defaultValue?: string }) =>
      key === "Unit.PCS"
        ? "pcs translated"
        : key === "ProofingOptions.RUN_AS_IS"
          ? "Run translated"
          : (options?.defaultValue ?? key);

    expect(getUnitAbbreviation(Unit.PCS, undefined, t)).toBe("pcs translated");
    expect(getUnitLabel(Unit.PCS, undefined, t)).toBe("pcs translated");
    expect(
      getProofingMethodLabel(ProofingOptions.RUN_AS_IS, undefined, t),
    ).toBe("Run translated");
    expect(getUnitLabel("square-yard")).toBe("Square Yard");
    expect(getProofingMethodLabel("customer-pdf-proof")).toBe(
      "Customer Pdf Proof",
    );
    expect(humanizeUnitId("CM2")).toBe("Cm2");
    expect(humanizeProofingMethodId("RUN_AS_IS")).toBe("Run As Is");
  });

  it("falls back to stable display metadata for incomplete custom values", () => {
    const settings = normalizeUnitsProofingSettings({
      units: [
        {
          id: "box",
          name: "",
          abbreviation: "",
          precision: Number.NaN,
          enabled: true,
          order: 0,
        },
      ],
      proofingMethods: [
        {
          id: "press-check",
          name: "",
          icon: "",
          colorPalette: "",
          enabled: true,
          order: 0,
        },
      ],
    });

    expect(getUnitDefinition("box", settings)).toMatchObject({
      abbreviation: "Box",
      colorPalette: "gray",
      icon: "straighten",
      name: "Box",
    });
    expect(getUnitPrecision("box", settings)).toBe(0);
    expect(getProofingMethodDefinition("press-check", settings)).toMatchObject({
      colorPalette: "gray",
      icon: "fact_check",
      name: "Press Check",
    });
  });
});
