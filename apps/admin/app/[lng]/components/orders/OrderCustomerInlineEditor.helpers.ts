import {
  AddressTypeEnum,
  isAddress,
  isNestedCustomer,
  type Address,
  type Order,
  type SelectOption,
} from "@konfi/types";
import {
  generateAddressOptions,
  normalizeInvoiceRecipientAddress,
} from "@konfi/utils";

export function createEditableOrderAddress(
  address: Order["shipping"] | Order["billing"] | undefined,
  type: AddressTypeEnum,
): Address | null {
  if (!address) {
    return null;
  }

  return normalizeInvoiceRecipientAddress({
    ...address,
    type: address.type ?? type,
    active: address.active ?? true,
    name: address.name ?? "",
    companyName: address.companyName ?? "",
    nip: address.nip ?? "",
    invoiceRecipientEnabled: address.invoiceRecipientEnabled ?? false,
    invoiceRecipientRole: address.invoiceRecipientRole ?? "recipient",
    invoiceRecipientRoleDescription:
      address.invoiceRecipientRoleDescription ?? "",
    invoiceRecipientName: address.invoiceRecipientName ?? "",
    invoiceRecipientNip: address.invoiceRecipientNip ?? "",
    invoiceRecipientStreet: address.invoiceRecipientStreet ?? "",
    invoiceRecipientZip: address.invoiceRecipientZip ?? "",
    invoiceRecipientCity: address.invoiceRecipientCity ?? "",
    jstRecipientEnabled: address.jstRecipientEnabled ?? false,
    jstRecipientName: address.jstRecipientName ?? "",
    jstRecipientNip: address.jstRecipientNip ?? "",
    jstRecipientStreet: address.jstRecipientStreet ?? "",
    jstRecipientZip: address.jstRecipientZip ?? "",
    jstRecipientCity: address.jstRecipientCity ?? "",
    street: address.street ?? "",
    number: address.number ?? "",
    local: address.local ?? "",
    zip: address.zip ?? "",
    city: address.city ?? "",
    country: address.country ?? "",
  });
}

export function getSavedCustomerAddressOptions(
  customer: Order["customer"],
  type: AddressTypeEnum,
): SelectOption[] {
  if (!isNestedCustomer(customer)) {
    return [];
  }

  return generateAddressOptions(customer.addresses ?? [], type);
}

export function createEditableAddressFromSelection(
  value: string | object,
  type: AddressTypeEnum,
): Address | null {
  if (!isAddress(value)) {
    return null;
  }

  return createEditableOrderAddress(value, type);
}
