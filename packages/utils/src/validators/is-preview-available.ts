import { ListResults, OrderItem } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";

export function isPreviewAvailable(
  item: OrderItem,
  listResults: ListResults[],
  previewURLs: string[],
): boolean {
  return (
    !isUndefined(listResults) &&
    !isEmpty(listResults) &&
    !isUndefined(previewURLs) &&
    !isEmpty(previewURLs) &&
    !isUndefined(item.width) &&
    item.width > 0 &&
    !isUndefined(item.height) &&
    item.height > 0
  );
}
