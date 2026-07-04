import {
  Address,
  AddressTypeEnum,
  Channel,
  Warehouse,
} from "@konfi/types";

type CustomerAddressLike = {
  type?: unknown;
};

type OrderFormCustomerPaymentSettingsLike = {
  allowedBankPayments?: boolean | null;
  allowedDefferedPayments?: boolean | null;
};

export type CreateOrderPaymentAutoSelectionNotice = "deferred" | "bankTransfer";

export function normalizePickupAreaWarehouseIds(
  warehouses: readonly unknown[] | null | undefined,
): string[] {
  if (!Array.isArray(warehouses)) {
    return [];
  }

  const warehouseIds = new Set<string>();

  for (const warehouse of warehouses) {
    if (typeof warehouse !== "string") {
      continue;
    }

    const warehouseId = warehouse.trim();
    if (warehouseId) {
      warehouseIds.add(warehouseId);
    }
  }

  return Array.from(warehouseIds);
}

export function getAdminOrderDetailsHref(
  lng: string,
  orderId: string,
  channelId: string,
): string {
  return `/${lng}/orders/${orderId}?channelId=${encodeURIComponent(channelId)}`;
}

export function hasCreateOrderBillingPrefillNotice(
  customer:
    | { addresses?: readonly CustomerAddressLike[] | null | undefined }
    | null
    | undefined,
  billingAddressType = "BILLING",
): boolean {
  return Boolean(
    customer?.addresses?.some((address) => address.type === billingAddressType),
  );
}

export function getCreateOrderPaymentAutoSelectionNotice(
  customer: OrderFormCustomerPaymentSettingsLike | null | undefined,
): CreateOrderPaymentAutoSelectionNotice | null {
  if (customer?.allowedDefferedPayments) {
    return "deferred";
  }

  if (customer?.allowedBankPayments) {
    return "bankTransfer";
  }

  return null;
}

export function createQuickOrderCustomerPatch(fullName: unknown): {
  customer: string;
  contactName: string;
} {
  const contactName = typeof fullName === "string" ? fullName.trim() : "";

  return {
    customer: contactName,
    contactName,
  };
}

function hasPickupAddress(address: Address | null | undefined): address is Address {
  return Boolean(
    address?.active !== false &&
      address?.street?.trim() &&
      address?.zip?.trim() &&
      address?.city?.trim(),
  );
}

export function getChannelPickupWarehouseAddress(
  channel: Pick<Channel, "warehouses"> | null | undefined,
  warehouses: readonly Warehouse[] | null | undefined,
): Address | null {
  if (!channel || !Array.isArray(channel.warehouses) || !warehouses) {
    return null;
  }

  for (const warehouseId of normalizePickupAreaWarehouseIds(
    channel.warehouses,
  )) {
    const warehouse = warehouses.find(
      (candidate) => candidate.id === warehouseId,
    );

    if (warehouse?.active === false || !hasPickupAddress(warehouse?.address)) {
      continue;
    }

    return {
      ...warehouse.address,
      name:
        warehouse.address.name.trim().length > 0
          ? warehouse.address.name
          : warehouse.name,
      type: AddressTypeEnum.SHIPPING,
      active: true,
    };
  }

  return null;
}
