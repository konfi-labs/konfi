export interface CustomerDataRepresentative {
  companyName?: string;
}

export interface CustomerDataSubject {
  description?: string;
  krs?: string;
  name?: string;
  nip?: string;
  pesel?: string;
  regon?: string;
  representatives?: CustomerDataRepresentative[];
  residenceAddress?: string;
  workingAddress?: string;
}

export interface WLResponse {
  result: {
    subject: CustomerDataSubject | null;
  };
}

export interface CustomerDataMatch {
  email?: string;
  id: string;
  subject: CustomerDataSubject;
}

export type CustomerDataSource =
  | "fakturownia-client"
  | "fakturownia-gus"
  | "wl";

export interface CustomerDataLookupResponse {
  errors?: string[];
  matches?: CustomerDataMatch[];
  notices?: string[];
  source: CustomerDataSource;
  subject: CustomerDataSubject | null;
}

export interface FakturowniaCustomerDescriptionLookupResponse {
  descriptions?: string[];
  source: "fakturownia-client";
}

export type CustomerDataTarget = {
  addressPath?: string;
  invoiceRecipientAddressPath?: string;
  entityNamePath?: string;
  companyNamePath?: string;
  regonPath?: string;
  krsPath?: string;
};

const NIP_SEPARATOR_RE = /[\s-]/g;
const POLISH_ZIP_RE = /(\d{2}-\d{3})/;

function normalizeWLValue(value?: string): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export function getCustomerDataCompanyName(
  subject: CustomerDataSubject,
): string {
  const representativeCompanyName = subject.representatives
    ?.map((representative) => normalizeWLValue(representative.companyName))
    .find((companyName): companyName is string => companyName !== undefined);

  return representativeCompanyName ?? normalizeWLValue(subject.name) ?? "";
}

export function normalizeNip(value?: string): string {
  return value?.replace(NIP_SEPARATOR_RE, "") ?? "";
}

export function mergeCustomerDescriptions(
  ...descriptions: (string | undefined)[]
): string {
  const merged: string[] = [];
  const seen = new Set<string>();

  descriptions.forEach((description) => {
    const trimmed = description?.trim();
    if (!trimmed) {
      return;
    }

    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(trimmed);
  });

  return merged.join("\n\n");
}

export function parsePolishAddress(address: string): {
  street: string;
  zip: string;
  city: string;
} {
  const zipMatch = address.match(POLISH_ZIP_RE);
  if (!zipMatch) {
    const parts = address.split(", ");
    if (parts.length >= 2) {
      const firstSpaceIndex = parts[1].indexOf(" ");
      return {
        street: parts[0],
        zip:
          firstSpaceIndex === -1
            ? parts[1]
            : parts[1].slice(0, firstSpaceIndex),
        city: firstSpaceIndex === -1 ? "" : parts[1].slice(firstSpaceIndex + 1),
      };
    }

    return { street: address, zip: "", city: "" };
  }

  const zipIndex = zipMatch.index!;
  const street = address.slice(0, zipIndex).replace(/,\s*$/, "").trim();
  const zip = zipMatch[1];
  const city = address.slice(zipIndex + zip.length).trim();
  return { street, zip, city };
}

function hasOwnField(
  formValues: Record<string, unknown>,
  fieldName: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(formValues, fieldName);
}

export function getCustomerDataTarget(
  fieldName: string,
  formValues: Record<string, unknown>,
): CustomerDataTarget {
  if (fieldName === "nip") {
    return {
      addressPath: hasOwnField(formValues, "addresses")
        ? "addresses[0]"
        : undefined,
      entityNamePath: hasOwnField(formValues, "name") ? "name" : undefined,
      companyNamePath: hasOwnField(formValues, "companyName")
        ? "companyName"
        : undefined,
      regonPath: hasOwnField(formValues, "regon") ? "regon" : undefined,
      krsPath: hasOwnField(formValues, "krs") ? "krs" : undefined,
    };
  }

  if (fieldName === "billing.nip") {
    return { addressPath: "billing" };
  }

  if (fieldName === "invoiceRecipientNip") {
    return {};
  }

  if (fieldName === "billing.invoiceRecipientNip") {
    return { invoiceRecipientAddressPath: "billing" };
  }

  const addressFieldMatch = fieldName.match(/^(addresses\[\d+\])\.nip$/);
  if (addressFieldMatch) {
    return { addressPath: addressFieldMatch[1] };
  }

  const invoiceRecipientAddressFieldMatch = fieldName.match(
    /^(addresses\[\d+\])\.invoiceRecipientNip$/,
  );
  if (invoiceRecipientAddressFieldMatch) {
    return {
      invoiceRecipientAddressPath: invoiceRecipientAddressFieldMatch[1],
    };
  }

  return {};
}
