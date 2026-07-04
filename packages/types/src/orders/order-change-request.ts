import type { Base } from "../base";
import type { NestedMember } from "../configuration/member";
import type { TenantOwned } from "../tenant";

export enum OrderChangeImpactArea {
  BILLING = "BILLING",
  CUSTOMER = "CUSTOMER",
  DEADLINE = "DEADLINE",
  FILES = "FILES",
  FULFILLMENT = "FULFILLMENT",
  ITEMS = "ITEMS",
  METADATA = "METADATA",
  PAYMENT = "PAYMENT",
  PRICING = "PRICING",
  SHIPPING = "SHIPPING",
  STATUS = "STATUS",
}

export enum OrderChangeOperationType {
  ADD = "ADD",
  REMOVE = "REMOVE",
  REPLACE = "REPLACE",
  SET = "SET",
}

export enum OrderChangeRequestSource {
  ADMIN = "ADMIN",
  CUSTOMER = "CUSTOMER",
  IMPORT = "IMPORT",
  SYSTEM = "SYSTEM",
}

export enum OrderChangeRequestStatus {
  APPLIED = "APPLIED",
  APPROVED = "APPROVED",
  CANCELED = "CANCELED",
  DRAFT = "DRAFT",
  PENDING_REVIEW = "PENDING_REVIEW",
  REJECTED = "REJECTED",
}

export type OrderChangeValue =
  | boolean
  | null
  | number
  | string
  | OrderChangeValue[]
  | { [key: string]: OrderChangeValue };

export interface OrderChangeOperation {
  after?: OrderChangeValue;
  before?: OrderChangeValue;
  impactArea?: OrderChangeImpactArea;
  operationType: OrderChangeOperationType;
  path: (string | number)[];
}

export interface OrderChangeRequest extends Base, TenantOwned {
  appliedAt?: unknown;
  appliedBy?: NestedMember;
  baseOrderUpdatedAt?: unknown;
  channelId: string;
  impactAreas: OrderChangeImpactArea[];
  idempotencyKey?: string;
  operations: OrderChangeOperation[];
  orderId: string;
  orderNumber?: number;
  reason?: string;
  rejectedAt?: unknown;
  rejectedBy?: NestedMember;
  rejectionReason?: string;
  requestedBy?: NestedMember;
  reviewedAt?: unknown;
  reviewedBy?: NestedMember;
  source: OrderChangeRequestSource;
  status: OrderChangeRequestStatus;
}

export interface OrderRevision extends Base, TenantOwned {
  appliedChangeRequestId?: string;
  channelId: string;
  orderId: string;
  orderNumber?: number;
  revisionNumber: number;
  snapshot: OrderChangeValue;
}

export type OrderChangeRequestCreateForm = Omit<
  OrderChangeRequest,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

export type OrderRevisionCreateForm = Omit<
  OrderRevision,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;
