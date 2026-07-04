import { OrderStatus, PrintingMethod } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  compileOrderRulePreset,
  compileOrderRulePresets,
  createDefaultOrderRulePresetsSettings,
  getOrderRulePresetLabel,
  normalizeOrderRulePresetsSettings,
} from "../order-rule-presets";
import { normalizeOrderWorkflowStatusesSettings } from "../order-workflow-statuses";
import { normalizePrintingMethodsSettings } from "../printing-methods";

describe("order-rule-presets", () => {
  it("creates default active, digital, big format, and DTF presets from enabled indexes", () => {
    const settings = createDefaultOrderRulePresetsSettings(
      normalizeOrderWorkflowStatusesSettings(),
      normalizePrintingMethodsSettings(),
    );

    expect(settings.presets.map((preset) => preset.id)).toEqual([
      "active",
      "digital-print",
      "big-format",
      "dtf",
    ]);
    expect(
      settings.presets.find((preset) => preset.id === "dtf")?.printingMethodIds,
    ).toEqual([PrintingMethod.DTF]);
    expect(settings.presets[0].statusIds).toEqual([
      OrderStatus.NEW,
      OrderStatus.IN_PROGRESS,
      OrderStatus.WAITING_FOR_MATERIALS,
      OrderStatus.UNDER_REVIEW,
    ]);
  });

  it("restores missing default presets while preserving admin-disabled presets", () => {
    const settings = normalizeOrderRulePresetsSettings(
      {
        presets: [
          {
            id: "active",
            name: "Work queue",
            icon: "visibility",
            colorPalette: "blue",
            enabled: false,
            archived: false,
            isDefault: true,
            order: 0,
            statusIds: [OrderStatus.NEW],
            printingMethodIds: [],
          },
        ],
      },
      normalizeOrderWorkflowStatusesSettings(),
      normalizePrintingMethodsSettings(),
    );

    expect(
      settings.presets.find((preset) => preset.id === "active"),
    ).toMatchObject({
      enabled: false,
      name: "Work queue",
      statusIds: [OrderStatus.NEW],
    });
    expect(settings.presets.some((preset) => preset.id === "dtf")).toBe(true);
  });

  it("drops values that no longer exist in status or printing method settings", () => {
    const settings = normalizeOrderRulePresetsSettings(
      {
        presets: [
          {
            id: "custom",
            name: "Custom",
            icon: "filter_alt",
            colorPalette: "gray",
            enabled: true,
            archived: false,
            order: 0,
            statusIds: [OrderStatus.NEW, "missing-status"],
            printingMethodIds: [PrintingMethod.DTF, "missing-method"],
          },
        ],
      },
      normalizeOrderWorkflowStatusesSettings(),
      normalizePrintingMethodsSettings(),
    );

    expect(
      settings.presets.find((preset) => preset.id === "custom"),
    ).toMatchObject({
      statusIds: [OrderStatus.NEW],
      printingMethodIds: [PrintingMethod.DTF],
    });
  });

  it("compiles single print type presets to array-contains constraints", () => {
    const preset = createDefaultOrderRulePresetsSettings(
      normalizeOrderWorkflowStatusesSettings(),
      normalizePrintingMethodsSettings(),
    ).presets.find((candidate) => candidate.id === "dtf");

    expect(preset).toBeDefined();
    const compiled = compileOrderRulePreset(preset!);

    expect(compiled?.id).toBe("dtf");
    expect(JSON.stringify(compiled?.values)).toContain("array-contains");
    expect(JSON.stringify(compiled?.values)).not.toContain(
      "array-contains-any",
    );
  });

  it("uses localized custom preset names and translated default preset names", () => {
    const workflowSettings = normalizeOrderWorkflowStatusesSettings();
    const printingSettings = normalizePrintingMethodsSettings();
    const settings = normalizeOrderRulePresetsSettings(
      {
        presets: [
          {
            id: "custom",
            name: "Custom",
            localizedNames: {
              en: "English queue",
              pl: "Polska kolejka",
            },
            icon: "filter_alt",
            colorPalette: "gray",
            enabled: true,
            archived: false,
            order: 0,
            statusIds: [OrderStatus.NEW],
            printingMethodIds: [],
          },
        ],
      },
      workflowSettings,
      printingSettings,
    );
    const t = (key: string, options?: { defaultValue?: string }) =>
      key === "OrderRulePreset.active"
        ? "Translated active"
        : (options?.defaultValue ?? key);

    expect(
      getOrderRulePresetLabel(
        "custom",
        settings,
        workflowSettings,
        printingSettings,
        t,
        "pl",
      ),
    ).toBe("Polska kolejka");
    expect(
      getOrderRulePresetLabel(
        "active",
        settings,
        workflowSettings,
        printingSettings,
        t,
        "en",
      ),
    ).toBe("Translated active");
    expect(
      compileOrderRulePreset(settings.presets[0], { locale: "en" })?.label,
    ).toBe("English queue");
  });

  it("populates statusIds and printingMethodIds structured fields on compiled preset", () => {
    const workflowSettings = normalizeOrderWorkflowStatusesSettings();
    const printingSettings = normalizePrintingMethodsSettings();
    const settings = createDefaultOrderRulePresetsSettings(
      workflowSettings,
      printingSettings,
    );
    const bigFormatPreset = settings.presets.find(
      (p) => p.id === "big-format",
    );

    expect(bigFormatPreset).toBeDefined();
    const compiled = compileOrderRulePreset(bigFormatPreset!);

    expect(compiled).not.toBeNull();
    // Structured fields must be populated from the definition.
    expect(compiled!.statusIds).toEqual(bigFormatPreset!.statusIds);
    expect(compiled!.printingMethodIds).toEqual(bigFormatPreset!.printingMethodIds);
    // statusIds and printingMethodIds on the compiled result are the FULL lists.
    expect((compiled!.statusIds ?? []).length).toBeGreaterThan(0);
    expect((compiled!.printingMethodIds ?? []).length).toBeGreaterThan(0);
  });

  it("clamps printingMethodIds in the compiled clause when product exceeds 30 disjunctions", () => {
    // 10 statuses × 10 methods = 100 > 30.  The compiled clause must have
    // at most floor(30 / 10) = 3 methods, but the structured field keeps all 10.
    const manyStatuses = [
      OrderStatus.NEW,
      OrderStatus.IN_PROGRESS,
      OrderStatus.WAITING_FOR_MATERIALS,
      OrderStatus.UNDER_REVIEW,
      OrderStatus.DELAYED,
      OrderStatus.READY,
      // Add four synthetic ids to reach 10 total.
      "s07" as typeof OrderStatus.NEW,
      "s08" as typeof OrderStatus.NEW,
      "s09" as typeof OrderStatus.NEW,
      "s10" as typeof OrderStatus.NEW,
    ];
    const manyMethods = [
      PrintingMethod.DIGITAL,
      PrintingMethod.LARGE_FORMAT,
      PrintingMethod.ECO_SOLVENT,
      PrintingMethod.UV,
      PrintingMethod.CUTTING,
      PrintingMethod.INSTALLATION,
      PrintingMethod.DTF,
      // Add three synthetic ids to reach 10 total.
      "m08" as typeof PrintingMethod.DIGITAL,
      "m09" as typeof PrintingMethod.DIGITAL,
      "m10" as typeof PrintingMethod.DIGITAL,
    ];

    const compiled = compileOrderRulePreset({
      archived: false,
      colorPalette: "gray",
      enabled: true,
      icon: "filter_alt",
      id: "big-custom",
      isDefault: false,
      localizedNames: {},
      name: "Big custom",
      order: 0,
      printingMethodIds: manyMethods,
      statusIds: manyStatuses,
    });

    expect(compiled).not.toBeNull();
    // Structured field keeps the full 10 methods.
    expect(compiled!.printingMethodIds).toHaveLength(10);
    // The compiled clause uses at most floor(30/10) = 3 methods.
    const compiledMethodsConstraint = JSON.stringify(compiled!.values);
    // The status-in clause is present.
    expect(compiledMethodsConstraint).toContain("\"in\"");
    // The methods clause is array-contains-any with clamped list.
    expect(compiledMethodsConstraint).toContain("array-contains-any");
    // Verify the product is legal: statusCount × clampedMethodCount ≤ 30.
    const clampedMethodCount = Math.floor(30 / manyStatuses.length);
    expect(manyStatuses.length * clampedMethodCount).toBeLessThanOrEqual(30);
  });

  it("compileOrderRulePresets filters out presets with no statuses and preserves order", () => {
    const workflowSettings = normalizeOrderWorkflowStatusesSettings();
    const printingSettings = normalizePrintingMethodsSettings();
    const compiled = compileOrderRulePresets(
      undefined,
      workflowSettings,
      printingSettings,
    );

    // All compiled presets must have at least one status.
    expect(compiled.every((p) => (p.statusIds ?? []).length > 0)).toBe(true);
    // Presets must come in definition order.
    const ids = compiled.map((p) => p.id);
    expect(ids).toEqual(
      ["active", "digital-print", "big-format", "dtf"].filter((id) =>
        ids.includes(id),
      ),
    );
  });
});
