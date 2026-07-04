import type { ExternalAttribute } from "@konfi/types";
import {
  findExternalAttributeByKey,
  getExternalAttributeKey,
} from "@/lib/external-products/external-attribute-key";

export const getConfidenceBadgeColor = (confidence: number) => {
  if (confidence >= 0.8) return "success";
  if (confidence >= 0.5) return "yellow";
  return "red";
};

/**
 * Returns a display label for an external attribute.
 * Appends the technical id in parentheses when it exists and differs from the name,
 * so users can distinguish same-name attributes (e.g. two "Papier" attributes).
 */
export function getExternalAttributeLabel(
  attr: Pick<ExternalAttribute, "id" | "name">,
): string {
  if (attr.id && attr.id !== attr.name) {
    return `${attr.name} (${attr.id})`;
  }
  return attr.name;
}

export { findExternalAttributeByKey, getExternalAttributeKey };
