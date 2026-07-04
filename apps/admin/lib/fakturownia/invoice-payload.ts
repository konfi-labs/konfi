import {
  getNormalizedCountryCode,
  normalizeCountryCode,
} from "@/lib/fakturownia/country";
import type {
  InvoicePosition,
  RecipientOrIssuer,
} from "@konfi/fakturownia/client/models";
import type { Address, InvoiceRecipientRole } from "@konfi/types";
import { getInvoiceRecipientFromAddress } from "@konfi/utils";

export const FAKTUROWNIA_JST_RECIPIENT_ROLE = "JST – odbiorca";
export const FAKTUROWNIA_VAT_GROUP_RECIPIENT_ROLE = "Członek GV – odbiorca";
export const FAKTUROWNIA_ADDITIONAL_BUYER_RECIPIENT_ROLE = "Dodatkowy nabywca";
export const FAKTUROWNIA_PAYER_RECIPIENT_ROLE = "Dokonujący płatności";
export const FAKTUROWNIA_EMPLOYEE_RECIPIENT_ROLE = "Pracownik";
export const FAKTUROWNIA_DEFAULT_RECIPIENT_ROLE = "Odbiorca";
// Custom roles must be sent as "Rola inna" with the actual text in role_description;
// Fakturownia rejects any role string outside its whitelist once KSeF is enabled.
export const FAKTUROWNIA_OTHER_ROLE = "Rola inna";
export const FAKTUROWNIA_DEFAULT_ISSUER_ROLE = "Wystawca faktury";
export const FAKTUROWNIA_ROLE_DESCRIPTION_MAX_LENGTH = 25;
export const FAKTUROWNIA_POSITION_DESCRIPTION_MAX_LENGTH = 256;

export const FAKTUROWNIA_ALLOWED_RECIPIENT_ROLES: ReadonlySet<string> = new Set(
  [
    FAKTUROWNIA_DEFAULT_RECIPIENT_ROLE,
    FAKTUROWNIA_ADDITIONAL_BUYER_RECIPIENT_ROLE,
    FAKTUROWNIA_PAYER_RECIPIENT_ROLE,
    FAKTUROWNIA_JST_RECIPIENT_ROLE,
    FAKTUROWNIA_VAT_GROUP_RECIPIENT_ROLE,
    FAKTUROWNIA_EMPLOYEE_RECIPIENT_ROLE,
    FAKTUROWNIA_OTHER_ROLE,
  ],
);

export const FAKTUROWNIA_ALLOWED_ISSUER_ROLES: ReadonlySet<string> = new Set([
  FAKTUROWNIA_DEFAULT_ISSUER_ROLE,
  "Faktor",
  "Podmiot pierwotny",
  "JST – wystawca",
  "Członek GV – wystawca",
  FAKTUROWNIA_OTHER_ROLE,
]);

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, "l")
    .replace(/[._,/\\()[\]{}\u2010-\u2015-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const RECIPIENT_ROLE_BY_LOOKUP_KEY = new Map<string, string>([
  ["odbiorca", FAKTUROWNIA_DEFAULT_RECIPIENT_ROLE],
  ["dodatkowy nabywca", FAKTUROWNIA_ADDITIONAL_BUYER_RECIPIENT_ROLE],
  ["dokonujacy platnosci", FAKTUROWNIA_PAYER_RECIPIENT_ROLE],
  ["jst", FAKTUROWNIA_JST_RECIPIENT_ROLE],
  ["jst odbiorca", FAKTUROWNIA_JST_RECIPIENT_ROLE],
  ["jednostka samorzadu terytorialnego", FAKTUROWNIA_JST_RECIPIENT_ROLE],
  ["czlonek gv odbiorca", FAKTUROWNIA_VAT_GROUP_RECIPIENT_ROLE],
  ["pracownik", FAKTUROWNIA_EMPLOYEE_RECIPIENT_ROLE],
  ["rola inna", FAKTUROWNIA_OTHER_ROLE],
]);

const ISSUER_ROLE_BY_LOOKUP_KEY = new Map<string, string>([
  ["wystawca", FAKTUROWNIA_DEFAULT_ISSUER_ROLE],
  ["wystawca faktury", FAKTUROWNIA_DEFAULT_ISSUER_ROLE],
  ["faktor", "Faktor"],
  ["podmiot pierwotny", "Podmiot pierwotny"],
  ["jst wystawca", "JST – wystawca"],
  ["czlonek gv wystawca", "Członek GV – wystawca"],
  ["rola inna", FAKTUROWNIA_OTHER_ROLE],
]);

export function normalizeFakturowniaRecipientRole(
  value: string | null | undefined,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  const documentedRole = RECIPIENT_ROLE_BY_LOOKUP_KEY.get(
    normalizeLookupKey(trimmed),
  );
  if (documentedRole) {
    return documentedRole;
  }

  return trimmed;
}

export function normalizeFakturowniaIssuerRole(
  value: string | null | undefined,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  const documentedRole = ISSUER_ROLE_BY_LOOKUP_KEY.get(
    normalizeLookupKey(trimmed),
  );
  if (documentedRole) {
    return documentedRole;
  }

  return trimmed;
}

export function isFakturowniaJstRecipientRole(
  value: string | null | undefined,
): boolean {
  return (
    normalizeFakturowniaRecipientRole(value) === FAKTUROWNIA_JST_RECIPIENT_ROLE
  );
}

export function normalizeFakturowniaBuyerCountry(
  value: string | null | undefined,
): string {
  return getNormalizedCountryCode(value, "PL");
}

export function normalizeFakturowniaRecipientCountry(
  value: string | null | undefined,
  options: { fallback?: string } = {},
): string | undefined {
  const normalized = normalizeCountryCode(value);
  if (normalized) {
    return normalized;
  }

  return options.fallback;
}

export interface FakturowniaJstRecipientData {
  name?: string;
  street?: string;
  postCode?: string;
  city?: string;
  country: "PL";
  taxNo?: string;
}

export interface FakturowniaInvoiceRecipientData {
  formRole: InvoiceRecipientRole;
  role?: string;
  roleDescription?: string;
  name?: string;
  street?: string;
  postCode?: string;
  city?: string;
  country?: string;
  taxNo?: string;
}

function trimOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function truncateFakturowniaPositionDescription(
  value: string | null | undefined,
): string | null | undefined {
  return typeof value === "string"
    ? value.slice(0, FAKTUROWNIA_POSITION_DESCRIPTION_MAX_LENGTH)
    : value;
}

export function truncateFakturowniaInvoicePositionDescription(
  position: InvoicePosition,
): InvoicePosition {
  const description = truncateFakturowniaPositionDescription(
    position.description,
  );

  if (description === position.description) {
    return position;
  }

  return {
    ...position,
    description,
  };
}

export function getFakturowniaRecipientRoleForInvoiceRecipient(params: {
  role: InvoiceRecipientRole;
  roleDescription?: string | null;
}): string | undefined {
  switch (params.role) {
    case "recipient":
      return undefined;
    case "additionalBuyer":
      return FAKTUROWNIA_ADDITIONAL_BUYER_RECIPIENT_ROLE;
    case "payer":
      return FAKTUROWNIA_PAYER_RECIPIENT_ROLE;
    case "jst":
      return FAKTUROWNIA_JST_RECIPIENT_ROLE;
    case "vatGroupMember":
      return FAKTUROWNIA_VAT_GROUP_RECIPIENT_ROLE;
    case "employee":
      return FAKTUROWNIA_EMPLOYEE_RECIPIENT_ROLE;
    case "other":
      return trimOptional(params.roleDescription)
        ? FAKTUROWNIA_OTHER_ROLE
        : undefined;
  }
}

export function getFakturowniaRoleDescription(params: {
  role: string | undefined;
  roleDescription?: string | null;
}): string | undefined {
  if (params.role !== FAKTUROWNIA_OTHER_ROLE) {
    return undefined;
  }
  return trimOptional(params.roleDescription)?.slice(
    0,
    FAKTUROWNIA_ROLE_DESCRIPTION_MAX_LENGTH,
  );
}

export function isPolishAddressForFakturowniaJst(
  address: Pick<Address, "country"> | null | undefined,
): boolean {
  const country = address?.country?.trim();
  return !country || normalizeCountryCode(country) === "PL";
}

export function getFakturowniaJstRecipientFromAddress(
  address: Address | null | undefined,
): FakturowniaJstRecipientData | undefined {
  const recipient = getInvoiceRecipientFromAddress(address);
  if (!recipient.enabled || recipient.role !== "jst") {
    return undefined;
  }

  if (!isPolishAddressForFakturowniaJst(address)) {
    return undefined;
  }

  return {
    name: trimOptional(recipient.name),
    street: trimOptional(recipient.street),
    postCode: trimOptional(recipient.zip),
    city: trimOptional(recipient.city),
    country: "PL",
    taxNo: trimOptional(recipient.nip),
  };
}

export function getFakturowniaInvoiceRecipientFromAddress(
  address: Address | null | undefined,
): FakturowniaInvoiceRecipientData | undefined {
  const recipient = getInvoiceRecipientFromAddress(address);
  if (!recipient.enabled) {
    return undefined;
  }

  const role = getFakturowniaRecipientRoleForInvoiceRecipient({
    role: recipient.role,
    roleDescription: recipient.roleDescription,
  });
  const country = normalizeFakturowniaRecipientCountry(address?.country, {
    fallback: recipient.role === "jst" ? "PL" : undefined,
  });

  return {
    formRole: recipient.role,
    role,
    roleDescription: trimOptional(recipient.roleDescription),
    name: trimOptional(recipient.name),
    street: trimOptional(recipient.street),
    postCode: trimOptional(recipient.zip),
    city: trimOptional(recipient.city),
    country,
    taxNo: trimOptional(recipient.nip),
  };
}

export function buildFakturowniaInvoiceAdditionalData(params: {
  clientId?: string;
  recipientRole?: string;
}): Record<string, unknown> | undefined {
  const additionalData: Record<string, unknown> = {};

  if (params.clientId?.trim()) {
    additionalData.buyer_override = true;
  }

  if (isFakturowniaJstRecipientRole(params.recipientRole)) {
    additionalData.buyer_jst = "1";
  }

  return Object.keys(additionalData).length > 0 ? additionalData : undefined;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const pick = (record: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  const additional = asRecord(record.additionalData);
  for (const key of keys) {
    const value = additional[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
};

const pickString = (
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined => {
  const value = pick(record, ...keys);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return undefined;
};

const pickNumber = (
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined => {
  const value = pick(record, ...keys);
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

const pickBoolean = (
  record: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined => {
  const value = pick(record, ...keys);
  return typeof value === "boolean" ? value : undefined;
};

interface FakturowniaVatCopyPartyBuild {
  party: RecipientOrIssuer;
  roleChanged: boolean;
}

function buildFakturowniaVatCopyParty(
  value: unknown,
  kind: "issuer" | "recipient",
): FakturowniaVatCopyPartyBuild {
  const record = asRecord(value);
  const rawRole = pickString(record, "role");
  const role =
    kind === "issuer"
      ? (normalizeFakturowniaIssuerRole(rawRole) ??
        FAKTUROWNIA_DEFAULT_ISSUER_ROLE)
      : (normalizeFakturowniaRecipientRole(rawRole) ??
        FAKTUROWNIA_DEFAULT_RECIPIENT_ROLE);
  const roleDescription = pickString(
    record,
    "roleDescription",
    "role_description",
  );
  const additionalData = {
    ...asRecord(record.additionalData),
    ...(roleDescription ? { role_description: roleDescription } : {}),
  };

  return {
    party: {
      ...(pickNumber(record, "id") !== undefined
        ? { id: pickNumber(record, "id") }
        : {}),
      ...(pickString(record, "buyerId", "buyer_id")
        ? { buyerId: pickString(record, "buyerId", "buyer_id") }
        : {}),
      ...(pickString(record, "name")
        ? { name: pickString(record, "name") }
        : {}),
      ...(pickString(record, "firstName", "first_name")
        ? { firstName: pickString(record, "firstName", "first_name") }
        : {}),
      ...(pickString(record, "lastName", "last_name")
        ? { lastName: pickString(record, "lastName", "last_name") }
        : {}),
      ...(pickString(record, "taxNo", "tax_no")
        ? { taxNo: pickString(record, "taxNo", "tax_no") }
        : {}),
      ...(pickBoolean(record, "company") !== undefined
        ? { company: pickBoolean(record, "company") }
        : {}),
      ...(pickString(record, "country")
        ? { country: pickString(record, "country") }
        : {}),
      ...(pickString(record, "city")
        ? { city: pickString(record, "city") }
        : {}),
      ...(pickString(record, "postCode", "post_code")
        ? { postCode: pickString(record, "postCode", "post_code") }
        : {}),
      ...(pickString(record, "street")
        ? { street: pickString(record, "street") }
        : {}),
      ...(pickString(record, "phone")
        ? { phone: pickString(record, "phone") }
        : {}),
      ...(pickString(record, "email")
        ? { email: pickString(record, "email") }
        : {}),
      ...(pickString(record, "note")
        ? { note: pickString(record, "note") }
        : {}),
      ...(pickNumber(record, "participation") !== undefined
        ? { participation: pickNumber(record, "participation") }
        : {}),
      role,
      ...(Object.keys(additionalData).length > 0 ? { additionalData } : {}),
    },
    roleChanged: rawRole !== role,
  };
}

export interface FakturowniaVatCopyParties {
  issuers?: RecipientOrIssuer[];
  recipients?: RecipientOrIssuer[];
}

export function buildFakturowniaVatCopyParties(
  storedInvoice: unknown,
): FakturowniaVatCopyParties {
  const record = asRecord(storedInvoice);
  const issuerBuilds = Array.isArray(record.issuers)
    ? record.issuers.map((party) =>
        buildFakturowniaVatCopyParty(party, "issuer"),
      )
    : [];
  const recipientBuilds = Array.isArray(record.recipients)
    ? record.recipients.map((party) =>
        buildFakturowniaVatCopyParty(party, "recipient"),
      )
    : [];
  const issuers = issuerBuilds.some((build) => build.roleChanged)
    ? issuerBuilds.map((build) => build.party)
    : undefined;
  const recipients = recipientBuilds.some((build) => build.roleChanged)
    ? recipientBuilds.map((build) => build.party)
    : undefined;

  return {
    ...(issuers && issuers.length > 0 ? { issuers } : {}),
    ...(recipients && recipients.length > 0 ? { recipients } : {}),
  };
}
