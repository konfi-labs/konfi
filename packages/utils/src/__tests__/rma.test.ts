import type { Complaint, NestedMember, Order } from "@konfi/types";
import {
  RmaRequestStatus,
  RmaRequestType,
  RmaResolutionType,
} from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import {
  canTransitionRmaStatus,
  createRmaRequestFromComplaint,
  createRmaRequestFromOrder,
  getNextRmaRequestStatuses,
  getResolvedRmaRequestStatus,
  getRmaRefundAmount,
  isRmaRequestStatus,
  isRmaResolutionType,
  normalizeRmaResolutionAmount,
  rmaResolutionRequiresAmount,
} from "../rma";

const actor: NestedMember = {
  id: "member-1",
  name: "Admin",
};
const now = Timestamp.fromDate(new Date("2026-05-22T00:00:00.000Z"));

const complaint: Complaint = {
  active: true,
  carriedOutBy: [],
  channelId: "channel-1",
  createdAt: now,
  createdBy: actor,
  description: "Damaged print",
  id: "complaint-1",
  orderId: "order-1",
  orderItemIds: ["item-1"],
  status: "NEW",
  updatedAt: now,
  updatedBy: actor,
};

const order = {
  currency: "PLN",
  customer: { id: "customer-1", name: "Customer" },
  items: [{ id: "item-1", quantity: 3 }],
} as Pick<Order, "currency" | "customer" | "items">;

describe("rma", () => {
  it("creates an additive RMA request from an existing complaint", () => {
    const request = createRmaRequestFromComplaint({
      actor,
      complaint,
      now,
      order,
      type: RmaRequestType.RETURN,
    });

    expect(request).toMatchObject({
      active: true,
      channelId: "channel-1",
      complaintId: "complaint-1",
      currency: "PLN",
      customerId: "customer-1",
      orderId: "order-1",
      status: RmaRequestStatus.NEW,
      type: RmaRequestType.RETURN,
    });
    expect(request.items).toEqual([
      {
        orderItemId: "item-1",
        quantity: 3,
        reason: "Damaged print",
      },
    ]);
  });

  it("creates an additive customer-facing RMA request from an order", () => {
    const request = createRmaRequestFromOrder({
      actor: { id: "customer-1", name: "Customer" },
      channelId: "channel-1",
      description: "The delivered quantity was damaged.",
      items: [
        {
          description: "Corners are bent.",
          orderItemId: "item-1",
          quantity: 2,
        },
      ],
      now,
      order: {
        ...order,
        id: "order-1",
      },
      type: RmaRequestType.CLAIM,
    });

    expect(request).toMatchObject({
      active: true,
      channelId: "channel-1",
      currency: "PLN",
      customerId: "customer-1",
      description: "The delivered quantity was damaged.",
      orderId: "order-1",
      status: RmaRequestStatus.NEW,
      type: RmaRequestType.CLAIM,
    });
    expect(request.items).toEqual([
      {
        description: "Corners are bent.",
        orderItemId: "item-1",
        quantity: 2,
      },
    ]);
  });

  it("calculates refund and credit amounts from resolution or item lines", () => {
    expect(
      getRmaRefundAmount({
        items: [{ orderItemId: "item-1", quantity: 1, refundAmount: 1200 }],
        resolution: { type: RmaResolutionType.REFUND },
      }),
    ).toBe(1200);

    expect(
      getRmaRefundAmount({
        items: [],
        resolution: { amount: 500, type: RmaResolutionType.CREDIT },
      }),
    ).toBe(500);

    expect(
      getRmaRefundAmount({
        items: [{ orderItemId: "item-1", quantity: 1, refundAmount: 1200 }],
        resolution: { type: RmaResolutionType.REMAKE },
      }),
    ).toBe(0);
  });

  it("guards terminal RMA status transitions", () => {
    expect(
      canTransitionRmaStatus(
        RmaRequestStatus.NEW,
        RmaRequestStatus.UNDER_REVIEW,
      ),
    ).toBe(true);
    expect(
      canTransitionRmaStatus(
        RmaRequestStatus.APPROVED,
        RmaRequestStatus.COMPLETED,
      ),
    ).toBe(true);
    expect(
      canTransitionRmaStatus(
        RmaRequestStatus.COMPLETED,
        RmaRequestStatus.UNDER_REVIEW,
      ),
    ).toBe(false);
    expect(
      canTransitionRmaStatus(
        RmaRequestStatus.UNDER_REVIEW,
        RmaRequestStatus.NEW,
      ),
    ).toBe(false);
  });

  it("lists valid next statuses for admin workflow actions", () => {
    expect(getNextRmaRequestStatuses(RmaRequestStatus.NEW)).toEqual([
      RmaRequestStatus.NEW,
      RmaRequestStatus.UNDER_REVIEW,
      RmaRequestStatus.APPROVED,
      RmaRequestStatus.REJECTED,
      RmaRequestStatus.CANCELED,
    ]);
    expect(getNextRmaRequestStatuses(RmaRequestStatus.COMPLETED)).toEqual([
      RmaRequestStatus.COMPLETED,
    ]);
    expect(isRmaRequestStatus(RmaRequestStatus.APPROVED)).toBe(true);
    expect(isRmaRequestStatus("INVALID")).toBe(false);
  });

  it("validates and normalizes RMA resolution metadata", () => {
    expect(isRmaResolutionType(RmaResolutionType.REFUND)).toBe(true);
    expect(isRmaResolutionType("INVALID")).toBe(false);
    expect(rmaResolutionRequiresAmount(RmaResolutionType.REFUND)).toBe(true);
    expect(rmaResolutionRequiresAmount(RmaResolutionType.CREDIT)).toBe(true);
    expect(rmaResolutionRequiresAmount(RmaResolutionType.REMAKE)).toBe(false);
    expect(normalizeRmaResolutionAmount(1234.56)).toBe(1235);
    expect(normalizeRmaResolutionAmount(-100)).toBe(0);
    expect(getResolvedRmaRequestStatus(RmaResolutionType.REJECT)).toBe(
      RmaRequestStatus.REJECTED,
    );
    expect(getResolvedRmaRequestStatus(RmaResolutionType.REMAKE)).toBe(
      RmaRequestStatus.COMPLETED,
    );
  });
});
