import { Base } from "../base";
import { NestedMember } from "../configuration/member";
import { Timestamp } from "firebase/firestore";
import type { UnitId } from "../configuration/units-proofing";
import type { FulfillmentAssignmentSource } from "../orders/order-item";
import type { TenantOwned } from "../tenant";
import type { ProductionCooperationOrderItemPayload } from "../tenant";

export enum FulfillmentRequestStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  FULFILLED = "FULFILLED",
  CANCELLED = "CANCELLED",
}

export interface FulfillmentRequest extends Base, TenantOwned {
  orderId: string;
  orderNumber: number;
  channelId: string;
  itemId: string;
  productId: string;
  productName: string;
  orderItemSnapshot?: ProductionCooperationOrderItemPayload;
  quantity: number;
  unit: UnitId;
  message?: string;
  requestedAt: Omit<Timestamp, "toJSON">;
  status: FulfillmentRequestStatus;
  assignmentSource?: FulfillmentAssignmentSource;
  targetWarehouseId: string;
  sourceTenantId?: string;
  targetTenantId?: string;
  cooperationId?: string;
  url?: string;
  keywords: string[];
  acceptedAt?: Omit<Timestamp, "toJSON">;
  acceptedBy?: NestedMember;
  rejectedAt?: Omit<Timestamp, "toJSON">;
  rejectedBy?: NestedMember;
  rejectionReason?: string;
  cancelledAt?: Omit<Timestamp, "toJSON">;
  cancelledBy?: NestedMember;
  cancelReason?: string;
}
