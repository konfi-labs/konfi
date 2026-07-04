import {
  InventoryLedgerSubjectType,
  InventoryMovementType,
  InventoryReservationStatus,
} from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  applyInventoryMovementDelta,
  getActiveInventoryReservationQuantity,
  getInventoryMovementDelta,
  getInventoryTargetFromAttributeStockOperation,
  getInventoryTargetFromStockOperation,
  getInventoryReservationRemainingQuantity,
  getProjectedInventoryAvailability,
  isInventoryReservationActive,
  isValidInventoryMovementQuantity,
} from "../inventory-ledger";

describe("inventory-ledger", () => {
  it("calculates remaining and active reservation quantities", () => {
    const activeReservation = {
      consumedQuantity: 2,
      expiresAt: "2026-06-01T00:00:00.000Z",
      releasedQuantity: 3,
      reservedQuantity: 10,
      status: InventoryReservationStatus.ACTIVE,
    };
    const releasedReservation = {
      consumedQuantity: 0,
      expiresAt: "2026-06-01T00:00:00.000Z",
      releasedQuantity: 0,
      reservedQuantity: 10,
      status: InventoryReservationStatus.RELEASED,
    };

    expect(getInventoryReservationRemainingQuantity(activeReservation)).toBe(5);
    expect(
      isInventoryReservationActive(
        activeReservation,
        new Date("2026-05-22T12:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      getActiveInventoryReservationQuantity(
        [activeReservation, releasedReservation],
        new Date("2026-05-22T12:00:00.000Z"),
      ),
    ).toBe(5);
  });

  it("ignores expired reservations in projected availability", () => {
    const projected = getProjectedInventoryAvailability({
      snapshot: { allocated: 4, total: 20 },
      reservations: [
        {
          consumedQuantity: 0,
          expiresAt: "2026-05-21T00:00:00.000Z",
          releasedQuantity: 0,
          reservedQuantity: 10,
          status: InventoryReservationStatus.ACTIVE,
        },
        {
          consumedQuantity: 1,
          expiresAt: "2026-06-01T00:00:00.000Z",
          releasedQuantity: 1,
          reservedQuantity: 5,
          status: InventoryReservationStatus.ACTIVE,
        },
      ],
      now: new Date("2026-05-22T12:00:00.000Z"),
    });

    expect(projected).toEqual({
      allocated: 7,
      available: 13,
      total: 20,
    });
  });

  it("derives ledger movement deltas from movement type", () => {
    expect(
      getInventoryMovementDelta(InventoryMovementType.RESERVATION_CREATED, 4),
    ).toEqual({
      allocatedDelta: 4,
      availableDelta: -4,
      totalDelta: 0,
    });
    expect(
      getInventoryMovementDelta(InventoryMovementType.RESERVATION_CONSUMED, 4),
    ).toEqual({
      allocatedDelta: -4,
      availableDelta: 0,
      totalDelta: -4,
    });
    expect(
      getInventoryMovementDelta(InventoryMovementType.STOCK_ADJUSTED, -3),
    ).toEqual({
      allocatedDelta: 0,
      availableDelta: -3,
      totalDelta: -3,
    });
  });

  it("applies movement deltas to snapshots", () => {
    const snapshot = { allocated: 3, total: 12 };
    const movement = getInventoryMovementDelta(
      InventoryMovementType.RESERVATION_RELEASED,
      2,
    );

    expect(applyInventoryMovementDelta(snapshot, movement)).toEqual({
      allocated: 1,
      available: 11,
      total: 12,
    });
  });

  it("validates positive quantities except signed stock adjustments", () => {
    expect(
      isValidInventoryMovementQuantity(
        InventoryMovementType.RESERVATION_CREATED,
        1,
      ),
    ).toBe(true);
    expect(
      isValidInventoryMovementQuantity(
        InventoryMovementType.RESERVATION_CREATED,
        -1,
      ),
    ).toBe(false);
    expect(
      isValidInventoryMovementQuantity(
        InventoryMovementType.STOCK_ADJUSTED,
        -1,
      ),
    ).toBe(true);
    expect(
      isValidInventoryMovementQuantity(InventoryMovementType.STOCK_ADJUSTED, 0),
    ).toBe(false);
  });

  it("maps existing stock operations to ledger targets", () => {
    expect(
      getInventoryTargetFromStockOperation({
        channelId: "channel-1",
        productId: "product-1",
        quantity: 2,
        warehouseId: "warehouse-1",
      }),
    ).toEqual({
      channelId: "channel-1",
      productId: "product-1",
      subjectType: InventoryLedgerSubjectType.PRODUCT,
      warehouseId: "warehouse-1",
    });
    expect(
      getInventoryTargetFromAttributeStockOperation({
        attributeId: "paper",
        attributeOptionValue: "matte",
        channelId: "channel-1",
        quantity: 2,
        warehouseId: "warehouse-1",
      }),
    ).toEqual({
      attributeId: "paper",
      attributeOptionValue: "matte",
      channelId: "channel-1",
      subjectType: InventoryLedgerSubjectType.ATTRIBUTE,
      warehouseId: "warehouse-1",
    });
  });
});
