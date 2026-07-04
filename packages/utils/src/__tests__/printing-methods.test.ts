import { PrintingMethod } from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  createPrintingMethodId,
  getEnabledPrintingMethodDefinitions,
  getPrintingMethodDefinition,
  getPrintingMethodLabel,
  getPrintingMethodOptions,
  humanizePrintingMethodId,
  normalizePrintingMethodsSettings,
} from "../printing-methods";

describe("printing-methods", () => {
  it("generates stable slug ids and resolves collisions", () => {
    expect(createPrintingMethodId("UV + Foil")).toBe("uv-foil");
    expect(createPrintingMethodId("Zażółć gęślą jaźń")).toBe(
      "zazo-c-gesla-jazn",
    );
    expect(createPrintingMethodId("UV Foil", ["uv-foil"])).toBe("uv-foil-2");
  });

  it("keeps archived methods readable but removes them from enabled options", () => {
    const settings = normalizePrintingMethodsSettings({
      methods: [
        {
          id: "foil",
          name: "Foil",
          icon: "auto_awesome",
          colorPalette: "purple",
          enabled: false,
          archived: true,
          order: 0,
        },
      ],
    });

    expect(getPrintingMethodDefinition("foil", settings)?.name).toBe("Foil");
    expect(getPrintingMethodLabel("foil", settings)).toBe("Foil");
    expect(
      getEnabledPrintingMethodDefinitions(settings).some(
        (method) => method.id === "foil",
      ),
    ).toBe(false);
    expect(getPrintingMethodOptions(settings)).not.toContainEqual({
      label: "Foil",
      value: "foil",
    });
  });

  it("uses translated legacy labels and humanizes unknown ids", () => {
    const t = (key: string, options?: { defaultValue?: string }) =>
      key === "PrintingMethod.DIGITAL"
        ? "Digital translated"
        : (options?.defaultValue ?? key);

    expect(getPrintingMethodLabel(PrintingMethod.DIGITAL, undefined, t)).toBe(
      "Digital translated",
    );
    expect(getPrintingMethodLabel("custom-letterpress")).toBe(
      "Custom Letterpress",
    );
    expect(humanizePrintingMethodId("LARGE_FORMAT")).toBe("Large Format");
  });
});
