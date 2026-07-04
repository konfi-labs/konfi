import {
  type Address,
  type InvoiceRecipientRole,
  invoiceRecipientRoles,
} from "@konfi/types";

export type InvoiceRecipientAddress = {
  enabled: boolean;
  role: InvoiceRecipientRole;
  roleDescription: string;
  name: string;
  nip: string;
  street: string;
  zip: string;
  city: string;
};

const DEFAULT_INVOICE_RECIPIENT_ROLE: InvoiceRecipientRole = "recipient";

function normalizeOptionalText(value: string | null | undefined): string {
  return value ?? "";
}

function isInvoiceRecipientRole(value: unknown): value is InvoiceRecipientRole {
  return (
    typeof value === "string" &&
    invoiceRecipientRoles.includes(value as InvoiceRecipientRole)
  );
}

export function getInvoiceRecipientFromAddress(
  address: Address | null | undefined,
): InvoiceRecipientAddress {
  const hasLegacyJstRecipient = address?.jstRecipientEnabled === true;
  const hasGenericRecipientData =
    address?.invoiceRecipientEnabled === true ||
    (isInvoiceRecipientRole(address?.invoiceRecipientRole) &&
      address.invoiceRecipientRole !== DEFAULT_INVOICE_RECIPIENT_ROLE) ||
    Boolean(address?.invoiceRecipientRoleDescription) ||
    Boolean(address?.invoiceRecipientName) ||
    Boolean(address?.invoiceRecipientNip) ||
    Boolean(address?.invoiceRecipientStreet) ||
    Boolean(address?.invoiceRecipientZip) ||
    Boolean(address?.invoiceRecipientCity);
  const enabled =
    address?.invoiceRecipientEnabled === true ||
    (!hasGenericRecipientData && hasLegacyJstRecipient);
  const role = isInvoiceRecipientRole(address?.invoiceRecipientRole)
    ? address.invoiceRecipientRole
    : hasLegacyJstRecipient
      ? "jst"
      : DEFAULT_INVOICE_RECIPIENT_ROLE;

  return {
    enabled,
    role,
    roleDescription: normalizeOptionalText(
      address?.invoiceRecipientRoleDescription,
    ),
    name: normalizeOptionalText(
      address?.invoiceRecipientName ?? address?.jstRecipientName,
    ),
    nip: normalizeOptionalText(
      address?.invoiceRecipientNip ?? address?.jstRecipientNip,
    ),
    street: normalizeOptionalText(
      address?.invoiceRecipientStreet ?? address?.jstRecipientStreet,
    ),
    zip: normalizeOptionalText(
      address?.invoiceRecipientZip ?? address?.jstRecipientZip,
    ),
    city: normalizeOptionalText(
      address?.invoiceRecipientCity ?? address?.jstRecipientCity,
    ),
  };
}

export function hasInvoiceRecipient(
  address: Address | null | undefined,
): boolean {
  return getInvoiceRecipientFromAddress(address).enabled;
}

export function normalizeInvoiceRecipientAddress(address: Address): Address {
  const recipient = getInvoiceRecipientFromAddress(address);
  const isJstRecipient = recipient.enabled && recipient.role === "jst";

  return {
    ...address,
    invoiceRecipientEnabled: recipient.enabled,
    invoiceRecipientRole: recipient.role,
    invoiceRecipientRoleDescription: recipient.roleDescription,
    invoiceRecipientName: recipient.name,
    invoiceRecipientNip: recipient.nip,
    invoiceRecipientStreet: recipient.street,
    invoiceRecipientZip: recipient.zip,
    invoiceRecipientCity: recipient.city,
    jstRecipientEnabled: isJstRecipient,
    jstRecipientName: isJstRecipient ? recipient.name : "",
    jstRecipientNip: isJstRecipient ? recipient.nip : "",
    jstRecipientStreet: isJstRecipient ? recipient.street : "",
    jstRecipientZip: isJstRecipient ? recipient.zip : "",
    jstRecipientCity: isJstRecipient ? recipient.city : "",
  };
}

export function getInvoiceRecipientRoleTranslationKey(
  role: InvoiceRecipientRole | null | undefined,
): string {
  const normalizedRole = isInvoiceRecipientRole(role)
    ? role
    : DEFAULT_INVOICE_RECIPIENT_ROLE;
  return `forms.invoiceRecipientRoleOptions.${normalizedRole}`;
}
