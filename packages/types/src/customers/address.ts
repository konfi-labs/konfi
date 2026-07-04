import { AddressTypeEnum } from "../enums";

export const invoiceRecipientRoles = [
  "recipient",
  "additionalBuyer",
  "payer",
  "jst",
  "vatGroupMember",
  "employee",
  "other",
] as const;

export type InvoiceRecipientRole = (typeof invoiceRecipientRoles)[number];

export interface Address {
  name: string;
  type: keyof typeof AddressTypeEnum;
  nip?: string;
  companyName?: string;
  invoiceRecipientEnabled?: boolean;
  invoiceRecipientRole?: InvoiceRecipientRole;
  invoiceRecipientRoleDescription?: string;
  invoiceRecipientName?: string;
  invoiceRecipientNip?: string;
  invoiceRecipientStreet?: string;
  invoiceRecipientZip?: string;
  invoiceRecipientCity?: string;
  /** @deprecated Use invoiceRecipientEnabled and invoiceRecipientRole instead. */
  jstRecipientEnabled?: boolean;
  /** @deprecated Use invoiceRecipientName instead. */
  jstRecipientName?: string;
  /** @deprecated Use invoiceRecipientNip instead. */
  jstRecipientNip?: string;
  /** @deprecated Use invoiceRecipientStreet instead. */
  jstRecipientStreet?: string;
  /** @deprecated Use invoiceRecipientZip instead. */
  jstRecipientZip?: string;
  /** @deprecated Use invoiceRecipientCity instead. */
  jstRecipientCity?: string;
  street?: string;
  /** @deprecated Use street address lines instead. */
  number?: string;
  /** @deprecated Use street address lines instead. */
  local?: string;
  zip?: string;
  city?: string;
  country?: string;
  active: boolean;
}

export function isAddress(obj: unknown): obj is Address {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const candidate = obj as Partial<Record<keyof Address, unknown>>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.active === "boolean" &&
    (candidate.nip === undefined || typeof candidate.nip === "string") &&
    (candidate.companyName === undefined ||
      typeof candidate.companyName === "string") &&
    (candidate.invoiceRecipientEnabled === undefined ||
      typeof candidate.invoiceRecipientEnabled === "boolean") &&
    (candidate.invoiceRecipientRole === undefined ||
      invoiceRecipientRoles.includes(
        candidate.invoiceRecipientRole as InvoiceRecipientRole,
      )) &&
    (candidate.invoiceRecipientRoleDescription === undefined ||
      typeof candidate.invoiceRecipientRoleDescription === "string") &&
    (candidate.invoiceRecipientName === undefined ||
      typeof candidate.invoiceRecipientName === "string") &&
    (candidate.invoiceRecipientNip === undefined ||
      typeof candidate.invoiceRecipientNip === "string") &&
    (candidate.invoiceRecipientStreet === undefined ||
      typeof candidate.invoiceRecipientStreet === "string") &&
    (candidate.invoiceRecipientZip === undefined ||
      typeof candidate.invoiceRecipientZip === "string") &&
    (candidate.invoiceRecipientCity === undefined ||
      typeof candidate.invoiceRecipientCity === "string") &&
    (candidate.jstRecipientEnabled === undefined ||
      typeof candidate.jstRecipientEnabled === "boolean") &&
    (candidate.jstRecipientName === undefined ||
      typeof candidate.jstRecipientName === "string") &&
    (candidate.jstRecipientNip === undefined ||
      typeof candidate.jstRecipientNip === "string") &&
    (candidate.jstRecipientStreet === undefined ||
      typeof candidate.jstRecipientStreet === "string") &&
    (candidate.jstRecipientZip === undefined ||
      typeof candidate.jstRecipientZip === "string") &&
    (candidate.jstRecipientCity === undefined ||
      typeof candidate.jstRecipientCity === "string") &&
    (candidate.street === undefined || typeof candidate.street === "string") &&
    (candidate.number === undefined || typeof candidate.number === "string") &&
    (candidate.local === undefined || typeof candidate.local === "string") &&
    (candidate.zip === undefined || typeof candidate.zip === "string") &&
    (candidate.city === undefined || typeof candidate.city === "string") &&
    (candidate.country === undefined || typeof candidate.country === "string")
  );
}
