import { OrderFilesStatus, OrderStatus } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  getOrderFileStatusColorPalette,
  getOrderFileStatusLabel,
  getOrderWorkflowStatusColorPalette,
  getOrderWorkflowStatusLabel,
  normalizeOrderWorkflowStatusesSettings,
  shouldShowOrderFulfillmentStatus,
} from "../order-workflow-statuses";

describe("order workflow statuses settings", () => {
  it("keeps legacy status ids and restores missing defaults", () => {
    const settings = normalizeOrderWorkflowStatusesSettings({
      orderStatuses: [
        {
          id: OrderStatus.NEW,
          name: "New orders",
          order: 99,
          enabled: true,
          archived: false,
          colorPalette: "green",
          icon: "fiber_new",
          isInitial: true,
          isDraft: false,
          isTerminal: false,
          countsAsActive: true,
          blocksActions: false,
          readyForPickup: false,
          fulfilled: false,
          canceled: false,
          sendCustomerEmail: false,
          kanbanColumn: true,
        },
      ],
      fileStatuses: [],
    });

    expect(settings.orderStatuses.map((status) => status.id)).toContain(
      OrderStatus.FULFILLED,
    );
    expect(settings.fileStatuses.map((status) => status.id)).toContain(
      OrderFilesStatus.WAITING_FOR_FILES,
    );
    expect(getOrderWorkflowStatusLabel(OrderStatus.NEW, settings)).toBe(
      "New orders",
    );
  });

  it("humanizes unknown ids and uses semantic workflow flags", () => {
    const settings = normalizeOrderWorkflowStatusesSettings({
      orderStatuses: [
        {
          id: "awaiting-client-proof",
          name: "",
          order: 0,
          enabled: true,
          icon: "",
          colorPalette: "",
          isInitial: false,
          isDraft: false,
          isTerminal: false,
          countsAsActive: true,
          blocksActions: false,
          readyForPickup: false,
          fulfilled: false,
          canceled: false,
          sendCustomerEmail: false,
          kanbanColumn: true,
        },
      ],
      fileStatuses: [],
    });

    expect(getOrderWorkflowStatusLabel("awaiting-client-proof", settings)).toBe(
      "Awaiting Client Proof",
    );
    expect(shouldShowOrderFulfillmentStatus(OrderStatus.FULFILLED)).toBe(false);
    expect(getOrderFileStatusLabel("custom-file-check", settings)).toBe(
      "Custom File Check",
    );
  });

  it("keeps fulfilled neutral while migrating active and file status colors", () => {
    const settings = normalizeOrderWorkflowStatusesSettings({
      orderStatuses: [
        {
          id: OrderStatus.NEW,
          name: "New",
          order: 0,
          enabled: true,
          archived: false,
          colorPalette: "primary",
          icon: "fiber_new",
          isInitial: true,
          isDraft: false,
          isTerminal: false,
          countsAsActive: true,
          blocksActions: false,
          readyForPickup: false,
          fulfilled: false,
          canceled: false,
          sendCustomerEmail: false,
          kanbanColumn: true,
        },
        {
          id: OrderStatus.FULFILLED,
          name: "Fulfilled",
          order: 1,
          enabled: true,
          archived: false,
          colorPalette: "gray",
          icon: "done_all",
          isInitial: false,
          isDraft: false,
          isTerminal: true,
          countsAsActive: false,
          blocksActions: true,
          readyForPickup: false,
          fulfilled: true,
          canceled: false,
          sendCustomerEmail: false,
          kanbanColumn: true,
        },
      ],
      fileStatuses: [
        {
          id: OrderFilesStatus.FILES_ARE_READY,
          name: "Files Are Ready",
          order: 0,
          enabled: true,
          archived: false,
          colorPalette: "green",
          icon: "task",
          isInitial: false,
          isTerminal: true,
          blocksActions: false,
          requiresCustomerFiles: false,
          requiresCustomerApproval: false,
          underDesign: false,
          readyForVerification: false,
          readyForPreparation: false,
          filesReady: true,
          allowsProduction: true,
        },
      ],
    });

    expect(getOrderWorkflowStatusColorPalette(OrderStatus.NEW, settings)).toBe(
      "blue",
    );
    expect(
      getOrderWorkflowStatusColorPalette(OrderStatus.FULFILLED, settings),
    ).toBe("gray");
    expect(
      getOrderFileStatusColorPalette(
        OrderFilesStatus.FILES_ARE_READY,
        settings,
      ),
    ).toBe("gray");
  });
});
