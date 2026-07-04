import {
  OrderFilesStatus,
  OrderStatus,
  PriceTypeEnum,
  PrintingMethod,
  type OrderItem,
  type OrderWorkflowStatusesSettings,
  type PrintingMethodId,
} from "@konfi/types";
import {
  applyOrderItemStatusChange,
  createDefaultOrderWorkflowStatusesSettings,
} from "@konfi/utils";
import { describe, expect, test } from "vitest";
import {
  chunkForFirestoreIn,
  chunkProductionSectionFileStatuses,
  FIRESTORE_MAX_DISJUNCTIONS,
  getDefaultProductionVisibleStatusIds,
  getOrderItemStatusChangeForDrop,
  getProductionOrderItemConfigurationParts,
  getProductionOrderItemDisplayName,
  getProductionOrderItemDisplayQuantity,
  getProductionOrderItemOriginalProductName,
  getProductionOrderItemTotalVolume,
  getProductionOrderItemPrintingMethodIds,
  getProductionOrderPrintingMethodIds,
  getProductionPrintTypeCompletionGroups,
  getProductionFileStatusIds,
  getProductionGroupForOrder,
  getProductionSectionQuerySpecs,
  normalizeProductionGroupingMode,
  normalizeProductionVisibleStatusIds,
  orderItemMatchesProductionPrintingMethodFilter,
  orderMatchesProductionPrintingMethodFilter,
  planSectionPresetConstraints,
  PRODUCTION_ORDERS_PAGE_SIZE,
  sortProductionOrdersByDeadline,
  type ProductionSectionQuerySpec,
} from "./production-view";

function settings(): OrderWorkflowStatusesSettings {
  return createDefaultOrderWorkflowStatusesSettings();
}

describe("production orders view helpers", () => {
  test("uses a bounded production page size for initial live section reads", () => {
    expect(PRODUCTION_ORDERS_PAGE_SIZE).toBe(50);
  });

  test("uses active and ready-for-pickup workflow statuses by default", () => {
    expect(getDefaultProductionVisibleStatusIds(settings())).toEqual([
      OrderStatus.NEW,
      OrderStatus.UNDER_REVIEW,
      OrderStatus.IN_PROGRESS,
      OrderStatus.WAITING_FOR_MATERIALS,
      OrderStatus.DELAYED,
      OrderStatus.READY,
    ]);
  });

  test("normalizes persisted visible statuses against enabled configured statuses", () => {
    const nextSettings = settings();
    nextSettings.orderStatuses = nextSettings.orderStatuses.map((status) =>
      status.id === OrderStatus.DELAYED
        ? {
            ...status,
            enabled: false,
          }
        : status,
    );

    expect(
      normalizeProductionVisibleStatusIds(
        [OrderStatus.READY, "unknown", OrderStatus.NEW, OrderStatus.DELAYED],
        nextSettings,
      ),
    ).toEqual([OrderStatus.NEW, OrderStatus.READY]);
  });

  test("normalizes production grouping mode from persisted local state", () => {
    expect(normalizeProductionGroupingMode("flat")).toBe("flat");
    expect(normalizeProductionGroupingMode("printType")).toBe("printType");
    expect(normalizeProductionGroupingMode("material")).toBe("material");
    expect(normalizeProductionGroupingMode("legacy")).toBe("flat");
    expect(normalizeProductionGroupingMode(null)).toBe("flat");
  });

  test("groups file statuses by configured production readiness", () => {
    const nextSettings = settings();
    nextSettings.fileStatuses = nextSettings.fileStatuses.map((status) =>
      status.id === OrderFilesStatus.FOR_PREPARATION
        ? {
            ...status,
            allowsProduction: true,
          }
        : status,
    );

    expect(getProductionFileStatusIds("ready", nextSettings)).toEqual([
      OrderFilesStatus.FOR_PREPARATION,
      OrderFilesStatus.FILES_ARE_READY,
    ]);
    expect(
      getProductionFileStatusIds("pendingFiles", nextSettings),
    ).not.toContain(OrderFilesStatus.FOR_PREPARATION);
  });

  test("returns null for orders with unknown file statuses", () => {
    expect(
      getProductionGroupForOrder(
        {
          filesStatus: "CUSTOM_STATUS",
        },
        settings(),
      ),
    ).toBeNull();
  });

  test("chunks values for Firestore in constraints", () => {
    expect(
      chunkForFirestoreIn(
        Array.from(
          {
            length: 25,
          },
          (_, index) => index + 1,
        ),
      ).map((chunk) => chunk.length),
    ).toEqual([10, 10, 5]);
  });

  test("builds section query specs without undefined filter values", () => {
    const nextSettings = settings();
    const specs = getProductionSectionQuerySpecs(
      [OrderStatus.NEW, OrderStatus.READY, "missing"],
      nextSettings,
    );

    expect(specs).toHaveLength(4);
    expect(
      specs.every(
        (spec) =>
          spec.statusId !== undefined &&
          spec.fileStatusIds.length > 0 &&
          spec.fileStatusIds.every((statusId) => statusId !== undefined),
      ),
    ).toBe(true);
    expect(chunkProductionSectionFileStatuses(specs[0])).toEqual([
      [OrderFilesStatus.FILES_ARE_READY],
    ]);
  });

  test("maps production item drops through applyOrderItemStatusChange", () => {
    const base = {
      deliveredItems: [],
      fulfilledItems: [],
      inProgressItems: [],
      pickedUpItems: [],
    };

    expect(
      applyOrderItemStatusChange(
        base,
        getOrderItemStatusChangeForDrop("item-1", "inProgress"),
      ),
    ).toMatchObject({
      fulfilledItems: [],
      inProgressItems: ["item-1"],
    });

    expect(
      applyOrderItemStatusChange(
        base,
        getOrderItemStatusChangeForDrop("item-1", "pickedUp"),
      ),
    ).toMatchObject({
      fulfilledItems: ["item-1"],
      pickedUpItems: ["item-1"],
    });

    expect(
      applyOrderItemStatusChange(
        {
          deliveredItems: ["item-1"],
          fulfilledItems: ["item-1"],
          inProgressItems: [],
          pickedUpItems: [],
        },
        getOrderItemStatusChangeForDrop("item-1", "notStarted"),
      ),
    ).toMatchObject({
      deliveredItems: [],
      fulfilledItems: [],
      inProgressItems: [],
      pickedUpItems: [],
    });
  });

  test("resolves item display quantity from quantity, volume, and custom sizes", () => {
    expect(
      getProductionOrderItemDisplayQuantity({
        customSizes: undefined,
        height: undefined,
        product: {
          priceType: PriceTypeEnum.SINGLE,
        } as OrderItem["product"],
        quantity: 12,
        volume: 500,
        width: undefined,
      }),
    ).toBe(12);

    expect(
      getProductionOrderItemDisplayQuantity({
        customSizes: undefined,
        height: undefined,
        product: {
          priceType: PriceTypeEnum.MATRIX,
        } as OrderItem["product"],
        quantity: 2,
        volume: 500,
        width: undefined,
      }),
    ).toBe(500);

    expect(
      getProductionOrderItemTotalVolume({
        quantity: 3,
        volume: 500,
      }),
    ).toBe(1500);
  });

  test("prefers custom item names while preserving the original product name", () => {
    const namedItem = {
      name: "Window decal - front door",
      product: {
        name: "Window decal",
      },
    } as Pick<OrderItem, "name" | "product">;

    expect(getProductionOrderItemDisplayName(namedItem)).toBe(
      "Window decal - front door",
    );
    expect(getProductionOrderItemOriginalProductName(namedItem)).toBe(
      "Window decal",
    );

    const productOnlyItem = {
      name: " ",
      product: {
        name: "Business cards",
      },
    } as Pick<OrderItem, "name" | "product">;

    expect(getProductionOrderItemDisplayName(productOnlyItem)).toBe(
      "Business cards",
    );
    expect(
      getProductionOrderItemOriginalProductName(productOnlyItem),
    ).toBeNull();
  });

  test("parses compact item configuration parts", () => {
    expect(
      getProductionOrderItemConfigurationParts(
        "Format: A4, Paper: 300g, Matte",
      ),
    ).toEqual([
      {
        name: "Format",
        value: "A4",
      },
      {
        name: "Paper",
        value: "300g",
      },
      {
        name: null,
        value: "Matte",
      },
    ]);
  });

  test("sorts production orders by nearest deadline by default", () => {
    const orders = [
      {
        channelId: "channel-a",
        createdAt: {
          seconds: 300,
        },
        deadline: {
          seconds: 3000,
        },
        id: "later",
      },
      {
        channelId: "channel-a",
        createdAt: {
          seconds: 100,
        },
        deadline: {
          seconds: 1000,
        },
        id: "earliest",
      },
      {
        channelId: "channel-a",
        createdAt: {
          seconds: 500,
        },
        deadline: {
          seconds: 1000,
        },
        id: "same-deadline-newer",
      },
      {
        channelId: "channel-a",
        createdAt: {
          seconds: 900,
        },
        deadline: null,
        id: "missing-deadline",
      },
    ];

    expect(
      sortProductionOrdersByDeadline(orders).map((order) => order.id),
    ).toEqual(["same-deadline-newer", "earliest", "later", "missing-deadline"]);
  });

  test("planSectionPresetConstraints: no preset returns identity chunks and no extras", () => {
    const spec: Pick<ProductionSectionQuerySpec, "fileStatusIds" | "statusId"> =
      {
        fileStatusIds: [
          OrderFilesStatus.FILES_ARE_READY,
          OrderFilesStatus.FOR_PREPARATION,
        ],
        statusId: OrderStatus.NEW,
      };

    const plan = planSectionPresetConstraints(spec, undefined);

    expect(plan.skipSection).toBe(false);
    expect(plan.extraConstraints).toHaveLength(0);
    // Identity chunking: chunks use the default chunk size (10), so 2 items = 1 chunk.
    expect(plan.fileStatusChunks).toHaveLength(1);
    expect(plan.fileStatusChunks[0]).toEqual(spec.fileStatusIds);
  });

  test("planSectionPresetConstraints: section outside preset statuses is skipped", () => {
    const spec: Pick<ProductionSectionQuerySpec, "fileStatusIds" | "statusId"> =
      {
        fileStatusIds: [OrderFilesStatus.FILES_ARE_READY],
        statusId: OrderStatus.READY,
      };
    const preset = {
      statusIds: [OrderStatus.NEW, OrderStatus.IN_PROGRESS],
      printingMethodIds: [PrintingMethod.DIGITAL],
    };

    const plan = planSectionPresetConstraints(spec, preset);

    expect(plan.skipSection).toBe(true);
    expect(plan.fileStatusChunks).toHaveLength(0);
    expect(plan.extraConstraints).toHaveLength(0);
  });

  test("planSectionPresetConstraints: 5 methods → chunk size floor(30/5)=6 with array-contains-any", () => {
    const fileStatusIds: string[] = Array.from(
      { length: 10 },
      (_, i) => `status-${i}`,
    ) as OrderFilesStatus[];
    const spec: Pick<ProductionSectionQuerySpec, "fileStatusIds" | "statusId"> =
      {
        fileStatusIds: fileStatusIds as OrderFilesStatus[],
        statusId: OrderStatus.NEW,
      };
    const preset = {
      statusIds: [OrderStatus.NEW, OrderStatus.IN_PROGRESS],
      printingMethodIds: [
        PrintingMethod.LARGE_FORMAT,
        PrintingMethod.ECO_SOLVENT,
        PrintingMethod.UV,
        PrintingMethod.CUTTING,
        PrintingMethod.INSTALLATION,
      ],
    };

    const plan = planSectionPresetConstraints(spec, preset);

    expect(plan.skipSection).toBe(false);
    // 5 methods → max chunk = floor(30/5) = 6; 10 ids → 2 chunks of [6,4].
    expect(plan.fileStatusChunks[0]).toHaveLength(6);
    expect(plan.fileStatusChunks[1]).toHaveLength(4);
    expect(plan.extraConstraints).toHaveLength(1);
    // The clause must be array-contains-any for >1 method.
    expect(JSON.stringify(plan.extraConstraints)).toContain(
      "array-contains-any",
    );
    // Invariant: chunk.length × methodCount ≤ FIRESTORE_MAX_DISJUNCTIONS.
    for (const chunk of plan.fileStatusChunks) {
      expect(
        chunk.length * preset.printingMethodIds.length,
      ).toBeLessThanOrEqual(FIRESTORE_MAX_DISJUNCTIONS);
    }
  });

  test("planSectionPresetConstraints: 1 method → single array-contains clause, chunk size 30", () => {
    const fileStatusIds: OrderFilesStatus[] = [
      OrderFilesStatus.FILES_ARE_READY,
    ];
    const spec: Pick<ProductionSectionQuerySpec, "fileStatusIds" | "statusId"> =
      {
        fileStatusIds,
        statusId: OrderStatus.NEW,
      };
    const preset = {
      statusIds: [OrderStatus.NEW],
      printingMethodIds: [PrintingMethod.DIGITAL],
    };

    const plan = planSectionPresetConstraints(spec, preset);

    expect(plan.skipSection).toBe(false);
    // 1 method: single-method optimization uses array-contains (not array-contains-any).
    expect(JSON.stringify(plan.extraConstraints)).toContain("array-contains");
    expect(JSON.stringify(plan.extraConstraints)).not.toContain(
      "array-contains-any",
    );
    // chunk size = floor(30/1) = 30; all 1 ids fit in a single chunk.
    expect(plan.fileStatusChunks).toHaveLength(1);
    expect(plan.fileStatusChunks[0]).toHaveLength(1);
    // Invariant: 1 × 1 = 1 ≤ 30.
    expect(plan.fileStatusChunks[0].length * 1).toBeLessThanOrEqual(
      FIRESTORE_MAX_DISJUNCTIONS,
    );
  });

  test("planSectionPresetConstraints: 4 statuses × 5 methods preset with 10 file statuses yields budget-legal chunks", () => {
    // This is the default big-format scenario: 4 statuses × 5 methods = 20 ≤ 30.
    // With the planner (which ignores the status-in clause), the only disjunction
    // product is chunk.length × 5.  chunk = floor(30/5) = 6, so 6×5=30 ≤ 30.
    const fileStatusIds: OrderFilesStatus[] = Array.from(
      { length: 10 },
      (_, i) => `fs-${i}`,
    ) as OrderFilesStatus[];
    const spec: Pick<ProductionSectionQuerySpec, "fileStatusIds" | "statusId"> =
      {
        fileStatusIds,
        statusId: OrderStatus.NEW,
      };
    const preset = {
      statusIds: [
        OrderStatus.NEW,
        OrderStatus.IN_PROGRESS,
        OrderStatus.WAITING_FOR_MATERIALS,
        OrderStatus.UNDER_REVIEW,
      ],
      printingMethodIds: [
        PrintingMethod.LARGE_FORMAT,
        PrintingMethod.ECO_SOLVENT,
        PrintingMethod.UV,
        PrintingMethod.CUTTING,
        PrintingMethod.INSTALLATION,
      ],
    };

    const plan = planSectionPresetConstraints(spec, preset);

    expect(plan.skipSection).toBe(false);
    expect(plan.fileStatusChunks.length).toBeGreaterThan(0);
    // Every chunk must produce a legal Firestore query.
    for (const chunk of plan.fileStatusChunks) {
      expect(
        chunk.length * preset.printingMethodIds.length,
      ).toBeLessThanOrEqual(FIRESTORE_MAX_DISJUNCTIONS);
    }
    // Confirm chunk size = floor(30/5) = 6 (the default big-format preset).
    expect(plan.fileStatusChunks[0].length).toBeLessThanOrEqual(6);
  });

  test("filters production orders locally by printing methods", () => {
    const availableMethodIds = [
      PrintingMethod.DIGITAL,
      PrintingMethod.LARGE_FORMAT,
      PrintingMethod.UV,
    ];
    const largeFormatOrder = {
      items: [],
      printingMethods: [PrintingMethod.LARGE_FORMAT],
    };
    const legacyUvOrder = {
      items: [
        {
          customFormat: false,
          description: "",
          height: undefined,
          id: "item-1",
          product: {
            volumes: [
              {
                printType: PrintingMethod.UV,
                value: 100,
              },
            ],
          },
          quantity: 1,
          unit: "pcs",
          volume: 100,
          width: undefined,
        },
      ],
      printingMethods: [],
    };

    expect(
      orderMatchesProductionPrintingMethodFilter(
        largeFormatOrder,
        [PrintingMethod.LARGE_FORMAT, PrintingMethod.UV],
        availableMethodIds,
      ),
    ).toBe(true);
    expect(
      orderMatchesProductionPrintingMethodFilter(
        largeFormatOrder,
        [PrintingMethod.DIGITAL],
        availableMethodIds,
      ),
    ).toBe(false);
    expect(
      getProductionOrderPrintingMethodIds(legacyUvOrder, availableMethodIds),
    ).toEqual([PrintingMethod.UV]);
    expect(
      orderMatchesProductionPrintingMethodFilter(
        legacyUvOrder,
        [PrintingMethod.UV],
        availableMethodIds,
      ),
    ).toBe(true);
  });

  test("supports configurable custom printing method ids", () => {
    const customPrintType = "screen-printing" as PrintingMethodId;
    const availableMethodIds = [PrintingMethod.DIGITAL, customPrintType];
    const customItem = {
      id: "item-custom",
      customFormat: false,
      description: "",
      product: {
        name: "T-shirt",
        volumes: [
          {
            printType: customPrintType,
            value: 25,
          },
        ],
      },
      quantity: 25,
      unit: "pcs",
      volume: 25,
    };
    const order = {
      items: [customItem],
      printingMethods: [customPrintType],
    };

    expect(
      getProductionOrderPrintingMethodIds(order, availableMethodIds),
    ).toEqual([customPrintType]);
    expect(
      getProductionOrderItemPrintingMethodIds(customItem, availableMethodIds),
    ).toEqual([customPrintType]);
    expect(
      orderItemMatchesProductionPrintingMethodFilter(
        customItem,
        order,
        [customPrintType],
        availableMethodIds,
      ),
    ).toBe(true);
  });

  test("uses item-level printing methods before product volume signals", () => {
    const availableMethodIds = [
      PrintingMethod.DIGITAL,
      PrintingMethod.LARGE_FORMAT,
    ];
    const item = {
      customFormat: false,
      description: "",
      id: "item-1",
      printingMethods: [PrintingMethod.LARGE_FORMAT],
      product: {
        volumes: [{ printType: PrintingMethod.DIGITAL, value: 1 }],
      },
      quantity: 1,
      unit: "pcs",
      volume: 1,
    };
    const order = {
      items: [item],
      printingMethods: [PrintingMethod.DIGITAL],
    };

    expect(
      getProductionOrderItemPrintingMethodIds(item, availableMethodIds),
    ).toEqual([PrintingMethod.LARGE_FORMAT]);
    expect(
      getProductionOrderPrintingMethodIds(order, availableMethodIds),
    ).toEqual([PrintingMethod.LARGE_FORMAT]);
    expect(
      orderItemMatchesProductionPrintingMethodFilter(
        item,
        order,
        [PrintingMethod.DIGITAL],
        availableMethodIds,
      ),
    ).toBe(false);
    expect(
      orderItemMatchesProductionPrintingMethodFilter(
        item,
        order,
        [PrintingMethod.LARGE_FORMAT],
        availableMethodIds,
      ),
    ).toBe(true);
  });

  test("uses a single order print type for unresolved items alongside item assignments", () => {
    const availableMethodIds = [
      PrintingMethod.DIGITAL,
      PrintingMethod.LARGE_FORMAT,
    ];
    const digitalItem = {
      customFormat: false,
      description: "",
      id: "digital-item",
      printingMethods: [PrintingMethod.DIGITAL],
      product: null,
      quantity: 1,
      unit: "pcs",
    };
    const unresolvedItem = {
      customFormat: false,
      description: "",
      id: "unresolved-item",
      product: null,
      quantity: 1,
      unit: "pcs",
    };
    const order = {
      items: [digitalItem, unresolvedItem],
      printingMethods: [PrintingMethod.LARGE_FORMAT],
    };

    expect(
      getProductionOrderPrintingMethodIds(order, availableMethodIds),
    ).toEqual([PrintingMethod.DIGITAL, PrintingMethod.LARGE_FORMAT]);
    expect(
      orderItemMatchesProductionPrintingMethodFilter(
        unresolvedItem,
        order,
        [PrintingMethod.LARGE_FORMAT],
        availableMethodIds,
      ),
    ).toBe(true);
  });

  test("filters material-view items by their own resolved printing method", () => {
    const availableMethodIds = [
      PrintingMethod.DIGITAL,
      PrintingMethod.LARGE_FORMAT,
      PrintingMethod.UV,
    ];
    const productWithMixedVolumePrintTypes = {
      volumes: [
        {
          printType: PrintingMethod.DIGITAL,
          value: 100,
        },
        {
          printType: PrintingMethod.LARGE_FORMAT,
          value: 1000,
        },
      ],
    };
    const digitalItem = {
      customFormat: false,
      description: "",
      height: undefined,
      id: "digital-item",
      product: productWithMixedVolumePrintTypes,
      quantity: 1,
      unit: "pcs",
      volume: 100,
      width: undefined,
    };
    const largeFormatItem = {
      ...digitalItem,
      id: "large-format-item",
      volume: 1000,
    };
    const unresolvedMixedPrintTypeItem = {
      ...digitalItem,
      id: "unresolved-kreda-item",
      product: {
        name: "Kreda 170g",
        volumes: productWithMixedVolumePrintTypes.volumes,
      },
      volume: undefined,
    };
    const mixedOrder = {
      printingMethods: [PrintingMethod.DIGITAL, PrintingMethod.LARGE_FORMAT],
    };

    expect(
      getProductionOrderItemPrintingMethodIds(digitalItem, availableMethodIds),
    ).toEqual([PrintingMethod.DIGITAL]);
    expect(
      getProductionOrderItemPrintingMethodIds(
        largeFormatItem,
        availableMethodIds,
      ),
    ).toEqual([PrintingMethod.LARGE_FORMAT]);
    expect(
      getProductionOrderItemPrintingMethodIds(
        unresolvedMixedPrintTypeItem,
        availableMethodIds,
      ),
    ).toEqual([]);
    expect(
      orderItemMatchesProductionPrintingMethodFilter(
        digitalItem,
        mixedOrder,
        [PrintingMethod.DIGITAL],
        availableMethodIds,
      ),
    ).toBe(true);
    expect(
      orderItemMatchesProductionPrintingMethodFilter(
        largeFormatItem,
        mixedOrder,
        [PrintingMethod.DIGITAL],
        availableMethodIds,
      ),
    ).toBe(false);
    expect(
      orderItemMatchesProductionPrintingMethodFilter(
        largeFormatItem,
        mixedOrder,
        [PrintingMethod.LARGE_FORMAT],
        availableMethodIds,
      ),
    ).toBe(true);
    expect(
      orderItemMatchesProductionPrintingMethodFilter(
        unresolvedMixedPrintTypeItem,
        mixedOrder,
        [PrintingMethod.LARGE_FORMAT, PrintingMethod.UV],
        availableMethodIds,
      ),
    ).toBe(false);
  });

  test("groups print-type completion by mixed item volume print types", () => {
    const availableMethodIds = [
      PrintingMethod.DIGITAL,
      PrintingMethod.LARGE_FORMAT,
    ];
    const order = {
      deliveredItems: [],
      fulfilledItems: ["large-format-item"],
      inProgressItems: ["digital-item"],
      pickedUpItems: [],
      printingMethods: [],
      items: [
        {
          customFormat: false,
          description: "",
          id: "digital-item",
          product: {
            volumes: [
              { printType: PrintingMethod.DIGITAL, value: 100 },
              { printType: PrintingMethod.LARGE_FORMAT, value: 1000 },
            ],
          },
          quantity: 1,
          unit: "pcs",
          volume: 100,
        },
        {
          customFormat: false,
          description: "",
          id: "large-format-item",
          product: {
            volumes: [
              { printType: PrintingMethod.DIGITAL, value: 100 },
              { printType: PrintingMethod.LARGE_FORMAT, value: 1000 },
            ],
          },
          quantity: 1,
          unit: "pcs",
          volume: 1000,
        },
      ],
    };

    expect(
      getProductionPrintTypeCompletionGroups(order, availableMethodIds),
    ).toEqual([
      {
        completedCount: 0,
        completedItemIds: [],
        complete: false,
        itemIds: ["digital-item"],
        methodId: PrintingMethod.DIGITAL,
        totalCount: 1,
      },
      {
        completedCount: 1,
        completedItemIds: ["large-format-item"],
        complete: true,
        itemIds: ["large-format-item"],
        methodId: PrintingMethod.LARGE_FORMAT,
        totalCount: 1,
      },
    ]);
  });

  test("falls back to a single order-level print type for unresolved items", () => {
    const availableMethodIds = [PrintingMethod.DIGITAL, PrintingMethod.UV];
    const order = {
      deliveredItems: [],
      fulfilledItems: ["item-1"],
      inProgressItems: [],
      pickedUpItems: [],
      printingMethods: [PrintingMethod.UV],
      items: [
        {
          customFormat: false,
          description: "",
          id: "item-1",
          product: null,
          quantity: 1,
          unit: "pcs",
        },
      ],
    };

    expect(
      getProductionPrintTypeCompletionGroups(order, availableMethodIds),
    ).toEqual([
      {
        completedCount: 1,
        completedItemIds: ["item-1"],
        complete: true,
        itemIds: ["item-1"],
        methodId: PrintingMethod.UV,
        totalCount: 1,
      },
    ]);
  });

  test("groups multi-print-type item completion under every assigned print type", () => {
    const availableMethodIds = [
      PrintingMethod.DIGITAL,
      PrintingMethod.LARGE_FORMAT,
    ];
    const order = {
      deliveredItems: [],
      fulfilledItems: ["clipboard"],
      inProgressItems: [],
      items: [
        {
          customFormat: false,
          description: "",
          id: "clipboard",
          printingMethods: [
            PrintingMethod.DIGITAL,
            PrintingMethod.LARGE_FORMAT,
          ],
          product: null,
          quantity: 1,
          unit: "pcs",
        },
      ],
      pickedUpItems: [],
      printingMethods: [PrintingMethod.DIGITAL, PrintingMethod.LARGE_FORMAT],
    };

    expect(
      getProductionPrintTypeCompletionGroups(order, availableMethodIds),
    ).toEqual([
      {
        completedCount: 1,
        completedItemIds: ["clipboard"],
        complete: true,
        itemIds: ["clipboard"],
        methodId: PrintingMethod.DIGITAL,
        totalCount: 1,
      },
      {
        completedCount: 1,
        completedItemIds: ["clipboard"],
        complete: true,
        itemIds: ["clipboard"],
        methodId: PrintingMethod.LARGE_FORMAT,
        totalCount: 1,
      },
    ]);
  });

  test("requires all matching print-type items to be completed", () => {
    const availableMethodIds = [PrintingMethod.LARGE_FORMAT];
    const order = {
      deliveredItems: ["delivered-item"],
      fulfilledItems: ["fulfilled-item"],
      inProgressItems: ["in-progress-item"],
      pickedUpItems: [],
      printingMethods: [PrintingMethod.LARGE_FORMAT],
      items: [
        {
          customFormat: false,
          description: "",
          id: "fulfilled-item",
          product: null,
          quantity: 1,
          unit: "pcs",
        },
        {
          customFormat: false,
          description: "",
          id: "delivered-item",
          product: null,
          quantity: 1,
          unit: "pcs",
        },
        {
          customFormat: false,
          description: "",
          id: "in-progress-item",
          product: null,
          quantity: 1,
          unit: "pcs",
        },
      ],
    };

    expect(
      getProductionPrintTypeCompletionGroups(order, availableMethodIds),
    ).toEqual([
      {
        completedCount: 2,
        completedItemIds: ["fulfilled-item", "delivered-item"],
        complete: false,
        itemIds: ["fulfilled-item", "delivered-item", "in-progress-item"],
        methodId: PrintingMethod.LARGE_FORMAT,
        totalCount: 3,
      },
    ]);
  });

  test("treats ready and fulfilled orders as completed for print-type badges", () => {
    const availableMethodIds = [PrintingMethod.LARGE_FORMAT];
    const baseOrder = {
      deliveredItems: [],
      fulfilledItems: [],
      inProgressItems: [],
      items: [
        {
          customFormat: false,
          description: "",
          id: "item-1",
          product: null,
          quantity: 1,
          unit: "pcs",
        },
      ],
      pickedUpItems: [],
      printingMethods: [PrintingMethod.LARGE_FORMAT],
    };

    for (const status of [OrderStatus.READY, OrderStatus.FULFILLED]) {
      expect(
        getProductionPrintTypeCompletionGroups(
          {
            ...baseOrder,
            status,
          },
          availableMethodIds,
        ),
      ).toEqual([
        {
          completedCount: 1,
          completedItemIds: ["item-1"],
          complete: true,
          itemIds: ["item-1"],
          methodId: PrintingMethod.LARGE_FORMAT,
          totalCount: 1,
        },
      ]);
    }
  });

  test("supports custom print-type completion groups", () => {
    const customPrintType = "screen-printing" as PrintingMethodId;
    const order = {
      deliveredItems: [],
      fulfilledItems: [],
      inProgressItems: [],
      pickedUpItems: ["item-custom"],
      printingMethods: [],
      items: [
        {
          customFormat: false,
          description: "",
          id: "item-custom",
          product: {
            volumes: [{ printType: customPrintType, value: 25 }],
          },
          quantity: 25,
          unit: "pcs",
          volume: 25,
        },
      ],
    };

    expect(
      getProductionPrintTypeCompletionGroups(order, [customPrintType]),
    ).toEqual([
      {
        completedCount: 1,
        completedItemIds: ["item-custom"],
        complete: true,
        itemIds: ["item-custom"],
        methodId: customPrintType,
        totalCount: 1,
      },
    ]);
  });
});
