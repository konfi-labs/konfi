import { Base } from "../base";
import { FormattedProduct, NestedProduct } from "../catalog/product";
import type { UnitId } from "../configuration/units-proofing";
import type { PrintingMethodId } from "../configuration/printing-methods";
import { IDiscount } from "../discount";
import {
  AdvancedAttributeSelection,
  CustomSizeWithQuantity,
} from "../configuration";
import type { NestedMember } from "../configuration/member";
import type { PriceListApplication } from "../price-list";

export type FulfillmentAssignmentSource = "DIRECT" | "FULFILLMENT_REQUEST";

export interface OrderItemFulfillmentAssignment {
  requestId: string;
  warehouseId: string;
  assignmentSource?: FulfillmentAssignmentSource;
  sourceTenantId?: string;
  targetTenantId?: string;
  cooperationId?: string;
  acceptedAt?: Base["updatedAt"];
  acceptedBy?: NestedMember;
}

export interface OrderItem extends Omit<
  Base,
  "createdBy" | "createdAt" | "updatedBy" | "updatedAt" | "active"
> {
  product?: NestedProduct | undefined | null;
  description: string;
  combination?: string | null;
  calculatedCombination?: string | null;
  volume?: number;
  pageCount?: number | null;
  customFormat: boolean;
  totalPrice: number;
  customPrice: number | null;
  width?: number;
  height?: number;
  quantity: number;
  customSizes?: CustomSizeWithQuantity[];
  discount: IDiscount;
  unit: UnitId;
  printingMethods?: PrintingMethodId[];
  expressPercent?: number;
  preview?: {
    width?: number;
    height?: number;
    pages?: number;
  };
  advancedAttributeSelections?: Record<string, AdvancedAttributeSelection>;
  warehouseId?: string;
  fulfillmentAssignment?: OrderItemFulfillmentAssignment;
  priceListApplication?: PriceListApplication;
  taxCategoryId?: string;
}

export interface FormattedOrderItem extends Omit<OrderItem, "product"> {
  product: FormattedProduct;
}
