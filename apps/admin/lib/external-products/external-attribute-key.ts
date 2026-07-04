import type { ExternalAttribute } from "@konfi/types";

export function getExternalAttributeKey(
  attr: Pick<ExternalAttribute, "id" | "name">,
): string {
  return attr.id || attr.name;
}

export function findExternalAttributeByKey(
  attributes: ExternalAttribute[],
  key: string,
): ExternalAttribute | undefined {
  return (
    attributes.find((attribute) => attribute.id === key) ??
    attributes.find((attribute) => attribute.name === key)
  );
}
