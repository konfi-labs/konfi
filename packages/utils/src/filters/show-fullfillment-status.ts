import {
  shouldShowOrderFulfillmentStatus,
  type OrderWorkflowStatusesSettings,
} from "../order-workflow-statuses";

export function showFulfillmentStatus(
  orderStatus: string,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
) {
  return shouldShowOrderFulfillmentStatus(orderStatus, settings);
}
