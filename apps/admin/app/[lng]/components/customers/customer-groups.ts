import { firestore } from "@/lib/firebase/clientApp";
import { db, get, tenant } from "@konfi/firebase";
import type { Customer, CustomerGroup, TenantContext } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { where } from "firebase/firestore";

const FIRESTORE_IN_QUERY_LIMIT = 10;

export type CustomerGroupOption = {
  label: string;
  value: string;
};

export function chunkCustomerGroupMemberIds(
  customerIds: readonly string[],
  size = FIRESTORE_IN_QUERY_LIMIT,
): string[][] {
  const uniqueCustomerIds = Array.from(new Set(customerIds));
  const chunks: string[][] = [];

  for (let index = 0; index < uniqueCustomerIds.length; index += size) {
    chunks.push(uniqueCustomerIds.slice(index, index + size));
  }

  return chunks;
}

export function orderActiveCustomerGroupMembers<
  TCustomer extends { id: string; active?: boolean },
>(
  customerIds: readonly string[],
  customers: readonly TCustomer[],
): TCustomer[] {
  const activeCustomersById = new Map(
    customers
      .filter((customer) => customer.active !== false)
      .map((customer) => [customer.id, customer]),
  );

  return Array.from(new Set(customerIds))
    .map((customerId) => activeCustomersById.get(customerId))
    .filter((customer): customer is TCustomer => Boolean(customer));
}

export async function fetchCustomerGroups(
  tenantContext: TenantContext,
): Promise<CustomerGroup[]> {
  const result = await get(
    db.query<CustomerGroup>(firestore, "customerGroups", 999, undefined, [
      tenant.where(tenantContext),
    ]),
  );

  if (isUndefined(result)) {
    return [];
  }

  const customerGroups = result[0] as CustomerGroup[];

  return customerGroups.filter((customerGroup) => customerGroup.active);
}

export async function fetchCustomerGroup(
  id: string | null | undefined,
  tenantContext: TenantContext,
): Promise<CustomerGroup | undefined> {
  if (!id) {
    return undefined;
  }

  const result = await get(
    db.query<CustomerGroup>(
      firestore,
      "customerGroups",
      1,
      undefined,
      tenant.queryConstraints(tenantContext, [where("id", "==", id)]),
    ),
  );

  if (isUndefined(result)) {
    return undefined;
  }

  const customerGroup = result[0]?.[0] as CustomerGroup | undefined;

  if (!customerGroup?.active) {
    return undefined;
  }

  return customerGroup;
}

export async function fetchCustomerGroupMembers(
  customerIds: readonly string[] | null | undefined,
  tenantContext: TenantContext,
): Promise<Customer[]> {
  if (!customerIds || customerIds.length === 0) {
    return [];
  }

  const members = await Promise.all(
    chunkCustomerGroupMemberIds(customerIds).map(async (chunk) => {
      const result = await get(
        db.query<Customer>(
          firestore,
          "customers",
          chunk.length,
          undefined,
          tenant.queryConstraints(tenantContext, [where("id", "in", chunk)]),
        ),
      );

      return (result?.[0] ?? []) as Customer[];
    }),
  );

  return orderActiveCustomerGroupMembers(customerIds, members.flat());
}

export async function fetchCustomerGroupOptions(
  tenantContext: TenantContext,
): Promise<CustomerGroupOption[]> {
  const customerGroups = await fetchCustomerGroups(tenantContext);

  return customerGroups.map((customerGroup) => ({
    value: customerGroup.id,
    label: customerGroup.name,
  }));
}
