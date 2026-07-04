import {
  type OrderChangeOperation,
  OrderChangeImpactArea,
  OrderChangeOperationType,
  OrderChangeRequestStatus,
} from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  canTransitionOrderChangeStatus,
  createOrderChangeIdempotencyKey,
  getOrderChangeImpactAreas,
  isNoopOrderChangeOperation,
  isTerminalOrderChangeStatus,
  normalizeOrderChangeOperations,
  summarizeOrderChangeRequest,
} from "../order-change-requests";

function operation(
  path: OrderChangeOperation["path"],
  overrides: Partial<OrderChangeOperation> = {},
): OrderChangeOperation {
  return {
    after: "after",
    before: "before",
    operationType: OrderChangeOperationType.SET,
    path,
    ...overrides,
  };
}

describe("order-change-requests", () => {
  it("classifies order change operations by impact area", () => {
    expect(
      getOrderChangeImpactAreas([
        operation(["items", 0, "quantity"]),
        operation(["paymentStatus"]),
        operation(["shipping", "city"]),
        operation(["customField"]),
      ]),
    ).toEqual([
      OrderChangeImpactArea.ITEMS,
      OrderChangeImpactArea.PAYMENT,
      OrderChangeImpactArea.SHIPPING,
      OrderChangeImpactArea.METADATA,
    ]);
  });

  it("preserves explicit impact areas and drops invalid empty paths", () => {
    expect(
      normalizeOrderChangeOperations([
        operation([], { impactArea: OrderChangeImpactArea.PRICING }),
        operation(["totalPrice"], {
          impactArea: OrderChangeImpactArea.PRICING,
        }),
      ]),
    ).toEqual([
      {
        after: "after",
        before: "before",
        impactArea: OrderChangeImpactArea.PRICING,
        operationType: OrderChangeOperationType.SET,
        path: ["totalPrice"],
      },
    ]);
  });

  it("summarizes customer-visible and review-required changes", () => {
    expect(
      summarizeOrderChangeRequest([
        operation(["items", 0, "quantity"]),
        operation(["tracking", "lastScan"]),
      ]),
    ).toEqual({
      hasCustomerVisibleChanges: true,
      impactAreas: [
        OrderChangeImpactArea.ITEMS,
        OrderChangeImpactArea.FULFILLMENT,
      ],
      operationCount: 2,
      requiresReview: true,
    });
  });

  it("validates request status transitions", () => {
    expect(
      canTransitionOrderChangeStatus(
        OrderChangeRequestStatus.DRAFT,
        OrderChangeRequestStatus.PENDING_REVIEW,
      ),
    ).toBe(true);
    expect(
      canTransitionOrderChangeStatus(
        OrderChangeRequestStatus.PENDING_REVIEW,
        OrderChangeRequestStatus.APPROVED,
      ),
    ).toBe(true);
    expect(
      canTransitionOrderChangeStatus(
        OrderChangeRequestStatus.APPLIED,
        OrderChangeRequestStatus.DRAFT,
      ),
    ).toBe(false);
    expect(isTerminalOrderChangeStatus(OrderChangeRequestStatus.APPLIED)).toBe(
      true,
    );
  });

  it("creates stable idempotency keys from sorted operation paths", () => {
    expect(
      createOrderChangeIdempotencyKey({
        orderId: "order-1",
        source: "ADMIN",
        operations: [
          operation(["shipping", "city"]),
          operation(["items", 0, "quantity"], {
            operationType: OrderChangeOperationType.REPLACE,
          }),
        ],
      }),
    ).toBe("order-1:ADMIN:REPLACE:items.0.quantity:SET:shipping.city");
  });

  it("detects no-op set operations", () => {
    expect(
      isNoopOrderChangeOperation(
        operation(["specialNotes"], { before: "same", after: "same" }),
      ),
    ).toBe(true);
    expect(
      isNoopOrderChangeOperation(
        operation(["specialNotes"], {
          before: "same",
          after: "different",
        }),
      ),
    ).toBe(false);
    expect(
      isNoopOrderChangeOperation(
        operation(["items", 0], {
          before: "same",
          after: "same",
          operationType: OrderChangeOperationType.REPLACE,
        }),
      ),
    ).toBe(false);
  });
});
