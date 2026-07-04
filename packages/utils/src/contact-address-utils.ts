import {
  Address,
  AddressTypeEnum,
  Contact,
  SelectOption,
  Warehouse,
} from "@konfi/types";
import { isEmpty } from "es-toolkit/compat";
import { getInvoiceRecipientFromAddress } from "./invoice-recipient";

type AddressOptionSource = {
  address: Address;
  sourceId?: string;
};

const normalizeWarehouseAddress = (warehouse: Warehouse): Address | null => {
  if (warehouse.active === false || !warehouse.address) {
    return null;
  }

  const address = warehouse.address;

  if (address.active === false) {
    return null;
  }

  return {
    ...address,
    name:
      typeof address.name === "string" && address.name.trim().length > 0
        ? address.name
        : warehouse.name,
    type: AddressTypeEnum.SHIPPING,
    active: true,
  };
};

const normalizeAddressOptionSegment = (value?: string | null) =>
  (value ?? "").trim().toLocaleLowerCase();

const createAddressOptionBaseValue = (address: Address, sourceId?: string) => {
  if (sourceId) {
    return sourceId;
  }
  const invoiceRecipient = getInvoiceRecipientFromAddress(address);

  return [
    "address",
    address.type,
    address.name,
    address.companyName,
    address.nip,
    address.street,
    address.number,
    address.local,
    address.zip,
    address.city,
    address.country,
    invoiceRecipient.enabled ? "invoice-recipient" : "",
    invoiceRecipient.role,
    invoiceRecipient.roleDescription,
    invoiceRecipient.name,
    invoiceRecipient.nip,
    invoiceRecipient.street,
    invoiceRecipient.zip,
    invoiceRecipient.city,
  ]
    .map(normalizeAddressOptionSegment)
    .join("|");
};

/**
 * Generates select options from contact objects
 * @param contacts List of contacts to convert to options
 * @returns Array of select options with label, value and the original object
 */
export const generateContactOptions = (contacts: Contact[]): SelectOption[] => {
  return !isEmpty(contacts)
    ? contacts
        .filter((contact) => contact.active)
        .map((contact) => ({
          label: contact.name,
          value: contact.name,
          object: contact,
        }))
    : [];
};

/**
 * Generates select options from address objects
 * @param addresses List of addresses to convert to options
 * @param type Type of address (BILLING or SHIPPING)
 * @param warehouses Optional warehouses to include when type is SHIPPING
 * @returns Array of select options with label, value and the original object
 */
export const generateAddressOptions = (
  addresses: Address[],
  type: AddressTypeEnum,
  warehouses?: Warehouse[] | null,
): SelectOption[] => {
  const addressSources: AddressOptionSource[] = !isEmpty(addresses)
    ? addresses
        .filter((address) => address.active && address.type === type)
        .map((address) => ({ address }))
    : [];

  // Add warehouse addresses if type is SHIPPING
  if (type === AddressTypeEnum.SHIPPING && warehouses) {
    const warehouseAddresses: AddressOptionSource[] = !isEmpty(warehouses)
      ? warehouses.flatMap((warehouse): AddressOptionSource[] => {
          const address = normalizeWarehouseAddress(warehouse);

          if (!address) {
            return [];
          }

          return [
            {
              address,
              sourceId: `warehouse:${warehouse.id}`,
            },
          ];
        })
      : [];

    addressSources.push(...warehouseAddresses);
  }

  const optionValueOccurrences = new Map<string, number>();

  return addressSources.map(({ address, sourceId }) => {
    const baseValue = createAddressOptionBaseValue(address, sourceId);
    const nextOccurrence = (optionValueOccurrences.get(baseValue) ?? 0) + 1;
    optionValueOccurrences.set(baseValue, nextOccurrence);

    return {
      label: address.name,
      value:
        nextOccurrence === 1 ? baseValue : `${baseValue}#${nextOccurrence}`,
      object: address,
    };
  });
};

/**
 * Parses a street address string into street, house number, and flat number
 * Handles various Polish address formats:
 * - "Street 38" -> {street: "Street", number: "38", flat: ""}
 * - "Example Street 10" -> {street: "Example Street", number: "10", flat: ""}
 * - "Example Street 10/5" -> {street: "Example Street", number: "10", flat: "5"}
 * - "Example Avenue 12 m. 3" -> {street: "Example Avenue", number: "12", flat: "3"}
 * - "Krótka 5A" -> {street: "Krótka", number: "5A", flat: ""}
 *
 * @param fullAddress Full street address string
 * @returns Object with street, number (house number), and flat (apartment number)
 */
export const parseStreetAddress = (
  fullAddress?: string | null,
): { street: string; number: string; flat: string } => {
  if (!fullAddress || typeof fullAddress !== "string") {
    return { street: "", number: "", flat: "" };
  }

  const trimmed = fullAddress.trim();

  // Pattern 1: "Street Number/Flat" (e.g., "Example Street 10/5")
  const slashPattern = /^(.+?)\s+(\d+[A-Za-z]?)\s*\/\s*(\d+[A-Za-z]?)$/;
  const slashMatch = trimmed.match(slashPattern);
  if (slashMatch) {
    return {
      street: slashMatch[1].trim(),
      number: slashMatch[2].trim(),
      flat: slashMatch[3].trim(),
    };
  }

  // Pattern 2: "Street Number m. Flat" or "Street Number lok. Flat" (e.g., "Example Avenue 12 m. 3")
  const apartmentPattern =
    /^(.+?)\s+(\d+[A-Za-z]?)\s+(?:m\.|lok\.|mieszkanie)\s+(\d+[A-Za-z]?)$/i;
  const apartmentMatch = trimmed.match(apartmentPattern);
  if (apartmentMatch) {
    return {
      street: apartmentMatch[1].trim(),
      number: apartmentMatch[2].trim(),
      flat: apartmentMatch[3].trim(),
    };
  }

  // Pattern 3: "Street Number" (e.g., "Example Street 10" or "Short Street 5A")
  const basicPattern = /^(.+?)\s+(\d+[A-Za-z]?)$/;
  const basicMatch = trimmed.match(basicPattern);
  if (basicMatch) {
    return {
      street: basicMatch[1].trim(),
      number: basicMatch[2].trim(),
      flat: "",
    };
  }

  // If no pattern matches, return the full string as street
  return { street: trimmed, number: "", flat: "" };
};

export const formatStreetLine = (
  street?: string | null,
  houseNumber?: string | null,
  flatNumber?: string | null,
) => {
  let line = (street ?? "").trim();
  const house = (houseNumber ?? "").trim();

  if (house) {
    const normalizedLine = line.replace(/\s+/g, " ");
    const pattern = new RegExp(`\\b${RegExp.escape(house)}\\b`);

    if (!pattern.test(normalizedLine)) {
      line = line ? `${line} ${house}` : house;
    }
  }

  const flat = (flatNumber ?? "").trim();

  if (flat) {
    const compactLine = line.replace(/\s+/g, "");
    const compactFlat = flat.replace(/\s+/g, "");

    if (!compactLine.includes(compactFlat)) {
      const suffix = flat.startsWith("/") ? flat : `/${flat}`;
      line = line ? `${line}${suffix}` : flat;
    }
  }

  return line.trim();
};
