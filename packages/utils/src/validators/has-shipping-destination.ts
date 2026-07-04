import { type Address } from "@konfi/types";

export function hasShippingDestination(
  shipping: Address | null | undefined,
): boolean {
  if (!shipping) {
    return false;
  }

  return [shipping.street, shipping.zip, shipping.city].every(
    (field) => typeof field === "string" && field.trim().length > 0,
  );
}
