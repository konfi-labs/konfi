import { PrintingMethod, Unit } from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  applyOrderItemPrintingMethodAssignments,
  buildOrderPrintingMethodsClassificationContext,
  buildOrderPrintingMethodsClassificationSystemPrompt,
  mergeOrderPrintingMethodsFromItemAssignments,
  normalizeInferredItemPrintingMethods,
  normalizeInferredPrintingMethods,
  toSerializableOrderPrintingMethodItems,
} from "../order-printing-methods";

describe("order-printing-methods", () => {
  it("includes print-method overlays before the final structured-output guardrail", () => {
    const system = buildOrderPrintingMethodsClassificationSystemPrompt(
      undefined,
      {
        capabilities: {
          adminAssistant: {
            enabled: false,
            instructions: "",
          },
          printMethodResolution: {
            enabled: true,
            instructions: "Prefer dye sublimation for soft signage.",
          },
          storefrontAssistant: {
            enabled: false,
            instructions: "",
          },
        },
      },
    );

    expect(system).toContain("Channel AI instruction overlay");
    expect(system).toContain("Prefer dye sublimation for soft signage.");
    expect(system.trim().endsWith("Return only structured data.")).toBe(true);
  });

  it("collects strong deterministic candidates from the closest product volume", () => {
    const context = buildOrderPrintingMethodsClassificationContext({
      items: [
        {
          id: "banner",
          description: "Frontlit banner",
          volume: 45,
          quantity: 1,
          unit: Unit.M2,
          customFormat: true,
          product: {
            name: "Banner",
            category: { name: "Large format" },
            productType: { name: "Banner" },
            volumes: [
              { value: 10, printType: PrintingMethod.DIGITAL },
              { value: 50, printType: PrintingMethod.LARGE_FORMAT },
            ],
          },
        },
      ],
    });

    expect(context.strongDeterministicCandidates).toEqual([
      PrintingMethod.LARGE_FORMAT,
    ]);
    expect(context.items[0]?.resolvedVolumePrintType).toBe(
      PrintingMethod.LARGE_FORMAT,
    );
  });

  it("replaces empty current values with inferred values", () => {
    const normalized = normalizeInferredPrintingMethods({
      currentPrintingMethods: [],
      suggestedPrintingMethods: [PrintingMethod.LARGE_FORMAT],
      strongDeterministicCandidates: [],
      aiMarkedCurrentInvalid: true,
    });

    expect(normalized).toEqual([PrintingMethod.LARGE_FORMAT]);
  });

  it("normalizes custom configured method ids", () => {
    const normalized = normalizeInferredPrintingMethods({
      currentPrintingMethods: [],
      suggestedPrintingMethods: ["sublimation"],
      strongDeterministicCandidates: [],
      availablePrintingMethodIds: [PrintingMethod.DIGITAL, "sublimation"],
      aiMarkedCurrentInvalid: true,
    });

    expect(normalized).toEqual(["sublimation"]);
  });

  it("replaces clearly invalid current values when strong signals disagree", () => {
    const normalized = normalizeInferredPrintingMethods({
      currentPrintingMethods: [PrintingMethod.DIGITAL],
      suggestedPrintingMethods: [PrintingMethod.LARGE_FORMAT],
      strongDeterministicCandidates: [PrintingMethod.LARGE_FORMAT],
      aiMarkedCurrentInvalid: true,
    });

    expect(normalized).toEqual([PrintingMethod.LARGE_FORMAT]);
  });

  it("keeps plausible current values even when AI suggests a different method", () => {
    const normalized = normalizeInferredPrintingMethods({
      currentPrintingMethods: [PrintingMethod.DIGITAL],
      suggestedPrintingMethods: [PrintingMethod.LARGE_FORMAT],
      strongDeterministicCandidates: [PrintingMethod.DIGITAL],
      aiMarkedCurrentInvalid: true,
    });

    expect(normalized).toEqual([PrintingMethod.DIGITAL]);
  });

  it("strips non-essential nested product fields for server-action payloads", () => {
    const createdAt = {
      seconds: 1,
      nanoseconds: 2,
      toJSON: () => "timestamp",
    };

    const [item] = toSerializableOrderPrintingMethodItems([
      {
        id: "banner",
        description: "Frontlit banner",
        volume: 10,
        quantity: 1,
        unit: Unit.M2,
        customFormat: true,
        product: {
          name: "Banner",
          category: { name: "Large format" },
          productType: { name: "Banner" },
          prefferedUnit: Unit.M2,
          volumes: [{ value: 10, printType: PrintingMethod.LARGE_FORMAT }],
          // @ts-expect-error test-only extra field to verify stripping
          createdAt,
        },
      },
    ]);

    expect(item).toEqual({
      id: "banner",
      description: "Frontlit banner",
      volume: 10,
      quantity: 1,
      unit: Unit.M2,
      customFormat: true,
      printingMethods: [],
      product: {
        name: "Banner",
        category: { name: "Large format" },
        productType: { name: "Banner" },
        prefferedUnit: Unit.M2,
        volumes: [{ value: 10, printType: PrintingMethod.LARGE_FORMAT }],
      },
    });
  });

  it("serializes existing item printing methods for AI classification", () => {
    const [item] = toSerializableOrderPrintingMethodItems(
      [
        {
          id: "clipboard",
          description: "Clipboard",
          quantity: 1,
          unit: Unit.PCS,
          customFormat: false,
          printingMethods: [
            PrintingMethod.DIGITAL,
            "unknown-method" as typeof PrintingMethod.DIGITAL,
            PrintingMethod.LARGE_FORMAT,
          ],
          product: null,
        },
      ],
      [PrintingMethod.DIGITAL, PrintingMethod.LARGE_FORMAT],
    );

    expect(item?.printingMethods).toEqual([
      PrintingMethod.DIGITAL,
      PrintingMethod.LARGE_FORMAT,
    ]);
  });

  it("preserves existing item printing methods over inferred suggestions", () => {
    const assignments = normalizeInferredItemPrintingMethods({
      items: [
        {
          id: "item-1",
          description: "Already assigned",
          quantity: 1,
          unit: Unit.PCS,
          customFormat: false,
          printingMethods: [PrintingMethod.DIGITAL],
          product: {
            volumes: [{ value: 1, printType: PrintingMethod.LARGE_FORMAT }],
          },
          volume: 1,
        },
      ],
      suggestedItemPrintingMethods: [
        {
          itemId: "item-1",
          printingMethods: [PrintingMethod.LARGE_FORMAT],
        },
      ],
    });

    expect(assignments).toEqual([
      {
        itemId: "item-1",
        printingMethods: [PrintingMethod.DIGITAL],
      },
    ]);
  });

  it("falls back to the single order printing method for unresolved items", () => {
    const assignments = normalizeInferredItemPrintingMethods({
      items: [
        {
          id: "item-1",
          description: "Unresolved",
          quantity: 1,
          unit: Unit.PCS,
          customFormat: false,
          product: null,
        },
      ],
      orderPrintingMethods: [PrintingMethod.LARGE_FORMAT],
    });

    expect(assignments).toEqual([
      {
        itemId: "item-1",
        printingMethods: [PrintingMethod.LARGE_FORMAT],
      },
    ]);
  });

  it("combines deterministic volume and AI item suggestions for multi-step items", () => {
    const assignments = normalizeInferredItemPrintingMethods({
      items: [
        {
          id: "clipboard",
          description: "Printed clipboard with assembly",
          quantity: 1,
          unit: Unit.PCS,
          customFormat: false,
          product: {
            volumes: [{ value: 1, printType: PrintingMethod.DIGITAL }],
          },
          volume: 1,
        },
      ],
      suggestedItemPrintingMethods: [
        {
          itemId: "clipboard",
          printingMethods: [PrintingMethod.LARGE_FORMAT],
        },
      ],
    });

    expect(assignments).toEqual([
      {
        itemId: "clipboard",
        printingMethods: [PrintingMethod.DIGITAL, PrintingMethod.LARGE_FORMAT],
      },
    ]);
  });

  it("merges order-level and item-level printing methods", () => {
    expect(
      mergeOrderPrintingMethodsFromItemAssignments({
        itemPrintingMethods: [
          {
            itemId: "clipboard",
            printingMethods: [
              PrintingMethod.DIGITAL,
              PrintingMethod.LARGE_FORMAT,
            ],
          },
        ],
        orderPrintingMethods: [PrintingMethod.UV],
      }),
    ).toEqual([
      PrintingMethod.UV,
      PrintingMethod.DIGITAL,
      PrintingMethod.LARGE_FORMAT,
    ]);
  });

  it("applies item printing method assignments by item id", () => {
    const items = [
      {
        id: "item-1",
        description: "Assigned",
        quantity: 1,
        unit: Unit.PCS,
        customFormat: false,
      },
      {
        id: "item-2",
        description: "Unchanged",
        quantity: 1,
        unit: Unit.PCS,
        customFormat: false,
      },
    ];

    expect(
      applyOrderItemPrintingMethodAssignments(items, [
        {
          itemId: "item-1",
          printingMethods: [PrintingMethod.LARGE_FORMAT],
        },
      ]),
    ).toEqual([
      {
        ...items[0],
        printingMethods: [PrintingMethod.LARGE_FORMAT],
      },
      items[1],
    ]);
  });
});
