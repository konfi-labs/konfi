import { Order } from "@konfi/types";

export function getFakturowniaDocumentId(
  order?: Pick<Order, "paymentDocumentId" | "proformaDocumentId">,
) {
  return order?.paymentDocumentId || order?.proformaDocumentId;
}
