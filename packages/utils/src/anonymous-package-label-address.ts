import { type AnonymousPackageLabelAddress } from "@konfi/types";

export function createEmptyAnonymousPackageLabelAddress(): AnonymousPackageLabelAddress {
  return {
    labelName: "",
    company: "",
    name: "",
    street: "",
    city: "",
    zip: "",
    phone: "",
    email: "",
  };
}

export function normalizeAnonymousPackageLabelAddress(
  address?: AnonymousPackageLabelAddress | null,
): AnonymousPackageLabelAddress | null {
  if (!address) {
    return null;
  }

  const normalized = {
    labelName: address.labelName?.trim() ?? "",
    company: address.company?.trim() ?? "",
    name: address.name?.trim() ?? "",
    street: address.street?.trim() ?? "",
    city: address.city?.trim() ?? "",
    zip: address.zip?.trim() ?? "",
    phone: address.phone?.trim() ?? "",
    email: address.email?.trim() ?? "",
  };

  return Object.values(normalized).some(Boolean) ? normalized : null;
}
