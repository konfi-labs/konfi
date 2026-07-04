import {
  FAKTUROWNIA_ALLOWED_ISSUER_ROLES,
  FAKTUROWNIA_ALLOWED_RECIPIENT_ROLES,
  FAKTUROWNIA_DEFAULT_ISSUER_ROLE,
  FAKTUROWNIA_DEFAULT_RECIPIENT_ROLE,
  FAKTUROWNIA_OTHER_ROLE,
  FAKTUROWNIA_ROLE_DESCRIPTION_MAX_LENGTH,
} from "./invoice-payload";

/**
 * Pre-send validation of invoice data against Fakturownia/KSeF acceptance
 * rules, so blockers surface in the UI before the invoice is created or a
 * proforma is converted to a VAT invoice.
 *
 * Proformas are never KSeF-validated by Fakturownia, so a proforma can save
 * with data that later fails when copied into a KSeF-bound kind — validate
 * proformas as if they were VAT invoices.
 */

export const KSEF_POSITION_NAME_MAX_LENGTH = 256;
export const KSEF_DESCRIPTION_MAX_LENGTH = 3500;
export const KSEF_PHONE_MAX_LENGTH = 16;
export const KSEF_EMAIL_MAX_LENGTH = 255;

/** Invoice kinds Fakturownia submits to KSeF. Everything else (incl. proforma) is ignored by KSeF. */
export const KSEF_BOUND_KINDS: ReadonlySet<string> = new Set([
  "vat",
  "correction",
  "advance",
  "final",
  "vat_mp",
  "vat_margin",
  "wdt",
  "export_products",
]);

const NP_TAX_VALUES = new Set([
  "np",
  "n/a",
  "na",
  "nie podlega",
  "not applicable",
]);

export type KsefReadinessSeverity = "blocker" | "warning";

export type KsefReadinessIssueCode =
  | "buyerNameMissing"
  | "buyerNipMissing"
  | "buyerNipInvalid"
  | "buyerEmailTooLong"
  | "buyerEmailInvalid"
  | "buyerPhoneTooLong"
  | "recipientPhoneTooLong"
  | "positionNameTooLong"
  | "descriptionTooLong"
  | "recipientRoleInvalid"
  | "recipientRoleDescriptionMissing"
  | "recipientRoleDescriptionTooLong"
  | "recipientNotIdentifiable"
  | "issuerRoleMissing"
  | "issuerRoleInvalid"
  | "issuerRoleDescriptionMissing"
  | "issueDateInFuture"
  | "vatExemptionReasonMissing"
  | "npReasonMissing";

export interface KsefReadinessIssue {
  code: KsefReadinessIssueCode;
  severity: KsefReadinessSeverity;
  params?: Record<string, string | number>;
}

export interface KsefReadinessResult {
  blockers: KsefReadinessIssue[];
  warnings: KsefReadinessIssue[];
}

export interface KsefInvoiceParty {
  role?: string | null;
  roleDescription?: string | null;
  name?: string | null;
  taxNo?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface KsefInvoiceData {
  kind?: string | null;
  issueDate?: string | null;
  buyerCompany?: boolean;
  buyerName?: string | null;
  buyerTaxNo?: string | null;
  /** Fakturownia buyer_tax_no_kind: "" (NIP), "nip_ue", "other", "empty" (consumer, no tax id). */
  buyerTaxNoKind?: string | null;
  buyerCountry?: string | null;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  recipientPhone?: string | null;
  description?: string | null;
  positions: Array<{ name?: string | null; tax?: string | number | null }>;
  recipients: KsefInvoiceParty[];
  issuers: KsefInvoiceParty[];
  exemptTaxKind?: string | null;
  npTaxKind?: string | null;
}

export interface KsefReadinessOptions {
  /** Today's date as YYYY-MM-DD; injected for testability. */
  today: string;
  /**
   * Force hard-blocker severity even for preparatory kinds (proforma/estimate),
   * e.g. the proforma→VAT conversion step. Without it, those kinds are reported
   * as warnings only (creation isn't blocked).
   */
  treatAsKsefBound?: boolean;
  /**
   * Skip issue-date checks, e.g. when validating a stored proforma whose
   * VAT copy will get a fresh issue date.
   */
  checkIssueDate?: boolean;
}

const trimmed = (value: string | null | undefined): string =>
  typeof value === "string" ? value.trim() : "";

/** Polish NIP: 10 digits with a weighted-checksum control digit. */
export function isValidPolishNip(value: string | null | undefined): boolean {
  const digits = trimmed(value).replace(/^PL/i, "").replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(digits)) {
    return false;
  }
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce(
    (acc, weight, index) => acc + weight * Number(digits[index]),
    0,
  );
  const control = sum % 11;
  return control !== 10 && control === Number(digits[9]);
}

const isPolishBuyer = (country: string | null | undefined): boolean => {
  const normalized = trimmed(country).toUpperCase();
  return (
    normalized === "" ||
    normalized === "PL" ||
    normalized === "POLAND" ||
    normalized === "POLSKA"
  );
};

const isLikelyEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function validateParty(
  party: KsefInvoiceParty,
  kind: "recipient" | "issuer",
  index: number,
  issues: KsefReadinessIssue[],
): void {
  const role = trimmed(party.role);
  const roleDescription = trimmed(party.roleDescription);
  const allowedRoles =
    kind === "recipient"
      ? FAKTUROWNIA_ALLOWED_RECIPIENT_ROLES
      : FAKTUROWNIA_ALLOWED_ISSUER_ROLES;
  const params = { index: index + 1, name: trimmed(party.name) };

  if (role === "") {
    // Fakturownia stores null instead of applying its default when a party is
    // created via API without a role, and KSeF validation rejects that.
    issues.push({
      code: kind === "recipient" ? "recipientRoleInvalid" : "issuerRoleMissing",
      severity: "blocker",
      params: { ...params, role: "" },
    });
  } else if (!allowedRoles.has(role)) {
    issues.push({
      code: kind === "recipient" ? "recipientRoleInvalid" : "issuerRoleInvalid",
      severity: "blocker",
      params: { ...params, role },
    });
  } else if (role === FAKTUROWNIA_OTHER_ROLE) {
    if (roleDescription === "") {
      issues.push({
        code:
          kind === "recipient"
            ? "recipientRoleDescriptionMissing"
            : "issuerRoleDescriptionMissing",
        severity: "blocker",
        params,
      });
    } else if (
      kind === "recipient" &&
      roleDescription.length > FAKTUROWNIA_ROLE_DESCRIPTION_MAX_LENGTH
    ) {
      issues.push({
        code: "recipientRoleDescriptionTooLong",
        severity: "blocker",
        params: { ...params, max: FAKTUROWNIA_ROLE_DESCRIPTION_MAX_LENGTH },
      });
    }
  }

  // KSeF Podmiot3 must be identifiable: a name alone is not enough.
  if (
    kind === "recipient" &&
    role !== "" &&
    (trimmed(party.taxNo) === "" ||
      (trimmed(party.city) === "" && trimmed(party.country) === ""))
  ) {
    issues.push({
      code: "recipientNotIdentifiable",
      severity: "warning",
      params,
    });
  }
}

export function validateKsefReadiness(
  data: KsefInvoiceData,
  options: KsefReadinessOptions,
): KsefReadinessResult {
  const issues: KsefReadinessIssue[] = [];
  const kind = trimmed(data.kind);
  const isPreparatoryKind = kind === "proforma" || kind === "estimate";
  const ksefBound =
    options.treatAsKsefBound === true ||
    KSEF_BOUND_KINDS.has(kind) ||
    // Proformas/estimates are converted into VAT invoices later; validate them
    // upfront so issues surface early (see softMode below).
    isPreparatoryKind;

  if (!ksefBound) {
    return { blockers: [], warnings: [] };
  }

  // A proforma/estimate is not itself sent to KSeF — its data only has to be
  // correct by the time it's converted. So report everything as warnings here
  // rather than blocking creation. The conversion path passes treatAsKsefBound
  // to re-run this as hard blockers against the stored document.
  const softMode = options.treatAsKsefBound !== true && isPreparatoryKind;

  if (trimmed(data.buyerName) === "") {
    issues.push({ code: "buyerNameMissing", severity: "blocker" });
  }

  const buyerTaxNo = trimmed(data.buyerTaxNo);
  const buyerTaxNoKind = trimmed(data.buyerTaxNoKind);
  if (data.buyerCompany === true && buyerTaxNoKind !== "empty") {
    if (buyerTaxNo === "") {
      issues.push({ code: "buyerNipMissing", severity: "blocker" });
    } else if (
      isPolishBuyer(data.buyerCountry) &&
      buyerTaxNoKind === "" &&
      !isValidPolishNip(buyerTaxNo)
    ) {
      issues.push({
        code: "buyerNipInvalid",
        severity: "blocker",
        params: { taxNo: buyerTaxNo },
      });
    }
  }

  const buyerEmail = trimmed(data.buyerEmail);
  if (buyerEmail.length > KSEF_EMAIL_MAX_LENGTH) {
    issues.push({
      code: "buyerEmailTooLong",
      severity: "blocker",
      params: { max: KSEF_EMAIL_MAX_LENGTH },
    });
  } else if (buyerEmail !== "" && !isLikelyEmail(buyerEmail)) {
    issues.push({ code: "buyerEmailInvalid", severity: "warning" });
  }

  if (trimmed(data.buyerPhone).length > KSEF_PHONE_MAX_LENGTH) {
    issues.push({
      code: "buyerPhoneTooLong",
      severity: "blocker",
      params: { max: KSEF_PHONE_MAX_LENGTH },
    });
  }
  if (trimmed(data.recipientPhone).length > KSEF_PHONE_MAX_LENGTH) {
    issues.push({
      code: "recipientPhoneTooLong",
      severity: "blocker",
      params: { max: KSEF_PHONE_MAX_LENGTH },
    });
  }

  if (trimmed(data.description).length > KSEF_DESCRIPTION_MAX_LENGTH) {
    issues.push({
      code: "descriptionTooLong",
      severity: "blocker",
      params: { max: KSEF_DESCRIPTION_MAX_LENGTH },
    });
  }

  let hasZwPosition = false;
  let hasNpPosition = false;
  data.positions.forEach((position, index) => {
    if (trimmed(position.name).length > KSEF_POSITION_NAME_MAX_LENGTH) {
      issues.push({
        code: "positionNameTooLong",
        severity: "blocker",
        params: { index: index + 1, max: KSEF_POSITION_NAME_MAX_LENGTH },
      });
    }
    const tax =
      typeof position.tax === "string" ? position.tax.trim().toLowerCase() : "";
    if (tax === "zw") {
      hasZwPosition = true;
    }
    if (NP_TAX_VALUES.has(tax)) {
      hasNpPosition = true;
    }
  });

  // Warnings (not blockers): a department-level default may satisfy these.
  if (hasZwPosition && trimmed(data.exemptTaxKind) === "") {
    issues.push({ code: "vatExemptionReasonMissing", severity: "warning" });
  }
  if (hasNpPosition && trimmed(data.npTaxKind) === "") {
    issues.push({ code: "npReasonMissing", severity: "warning" });
  }

  data.recipients.forEach((recipient, index) =>
    validateParty(recipient, "recipient", index, issues),
  );
  data.issuers.forEach((issuer, index) =>
    validateParty(issuer, "issuer", index, issues),
  );

  if (options.checkIssueDate !== false) {
    const issueDate = trimmed(data.issueDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(issueDate) && issueDate > options.today) {
      issues.push({
        code: "issueDateInFuture",
        severity: "blocker",
        params: { issueDate },
      });
    }
  }

  const effectiveIssues = softMode
    ? issues.map((issue) => ({ ...issue, severity: "warning" as const }))
    : issues;

  return {
    blockers: effectiveIssues.filter((issue) => issue.severity === "blocker"),
    warnings: effectiveIssues.filter((issue) => issue.severity === "warning"),
  };
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
  // Kiota places fields missing from the generated model in additionalData.
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
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
};

const toBooleanFlag = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

const toPartyList = (value: unknown): KsefInvoiceParty[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const record = asRecord(entry);
    return {
      role: pickString(record, "role"),
      roleDescription: pickString(
        record,
        "roleDescription",
        "role_description",
      ),
      name: pickString(record, "name"),
      taxNo: pickString(record, "taxNo", "tax_no"),
      city: pickString(record, "city"),
      country: pickString(record, "country"),
    };
  });
};

/**
 * Adapt a stored Fakturownia invoice (Kiota camelCase or raw snake_case JSON)
 * to the shape validateKsefReadiness expects. Used to check a proforma's
 * actual stored data before copyInvoiceFrom clones it into a VAT invoice.
 */
export function ksefInvoiceDataFromStoredInvoice(
  invoice: unknown,
): KsefInvoiceData {
  const record = asRecord(invoice);
  const positions = Array.isArray(record.positions) ? record.positions : [];

  return {
    kind: pickString(record, "kind"),
    issueDate: pickString(record, "issueDate", "issue_date"),
    buyerCompany: toBooleanFlag(pick(record, "buyerCompany", "buyer_company")),
    buyerName: pickString(record, "buyerName", "buyer_name"),
    buyerTaxNo: pickString(record, "buyerTaxNo", "buyer_tax_no"),
    buyerTaxNoKind: pickString(record, "buyerTaxNoKind", "buyer_tax_no_kind"),
    buyerCountry: pickString(record, "buyerCountry", "buyer_country"),
    buyerEmail: pickString(record, "buyerEmail", "buyer_email"),
    buyerPhone: pickString(record, "buyerPhone", "buyer_phone"),
    recipientPhone: pickString(record, "recipientPhone", "recipient_phone"),
    description: pickString(record, "description"),
    positions: positions.map((position) => {
      const positionRecord = asRecord(position);
      const tax = pick(positionRecord, "tax");
      return {
        name: pickString(positionRecord, "name"),
        tax: typeof tax === "number" ? tax : pickString(positionRecord, "tax"),
      };
    }),
    recipients: toPartyList(record.recipients),
    issuers: toPartyList(record.issuers),
    exemptTaxKind: pickString(record, "exemptTaxKind", "exempt_tax_kind"),
    npTaxKind: pickString(record, "npTaxKind", "np_tax_kind"),
  };
}

export interface KsefReadinessCreateParamsInput {
  kind?: string;
  issueDate?: string;
  buyerCompany?: "1" | "0";
  buyerName?: string;
  buyerTaxNo?: string;
  buyerCountry?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  recipient_phone?: string;
  description?: string;
  positions: Array<{ name?: string | null; tax?: string | number | null }>;
  recipientRole?: string;
  recipientRoleDescription?: string;
  recipient_name?: string;
  recipient_tax_no?: string;
  recipient_city?: string;
  recipient_country?: string;
}

/** Adapt our CreateInvoiceParams-shaped payload for validateKsefReadiness. */
export function ksefInvoiceDataFromCreateParams(
  params: KsefReadinessCreateParamsInput,
): KsefInvoiceData {
  const recipientRole = trimmed(params.recipientRole);

  return {
    kind: params.kind,
    issueDate: params.issueDate,
    buyerCompany: params.buyerCompany === "1",
    buyerName: params.buyerName,
    buyerTaxNo: params.buyerTaxNo,
    buyerCountry: params.buyerCountry,
    buyerEmail: params.buyerEmail,
    buyerPhone: params.buyerPhone,
    recipientPhone: params.recipient_phone,
    description: params.description,
    positions: params.positions,
    recipients: recipientRole
      ? [
          {
            role: recipientRole,
            roleDescription: params.recipientRoleDescription,
            name: params.recipient_name,
            taxNo: params.recipient_tax_no,
            city: params.recipient_city,
            country: params.recipient_country,
          },
        ]
      : [],
    // Issuer roles are set by our payload builder; nothing to validate here.
    issuers: [],
  };
}

export const formatTodayForKsef = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
