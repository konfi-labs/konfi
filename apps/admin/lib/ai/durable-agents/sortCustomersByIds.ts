import type { NestedCustomer } from "@konfi/types";

/**
 * Sort customers according to the provided ID list while preserving duplicate IDs.
 */
export function sortCustomersByIds(
  customers: NestedCustomer[],
  ids: string[],
): NestedCustomer[] {
  const customerMap = new Map<string, NestedCustomer>();

  for (const customer of customers) {
    customerMap.set(customer.id, customer);
  }

  return ids
    .map((id) => customerMap.get(id))
    .filter((customer): customer is NestedCustomer => customer !== undefined);
}