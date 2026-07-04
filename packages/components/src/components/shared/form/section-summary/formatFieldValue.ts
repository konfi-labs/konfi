import { FieldData, SelectOption } from "@konfi/types";
import { isEqual } from "es-toolkit/compat";
import type { TFunction } from "i18next";

export type SectionSummaryDynamicOptions = {
  contacts?: SelectOption[];
  shippingAddresses?: SelectOption[];
  billingAddresses?: SelectOption[];
};

export type FormatFieldValueContext = {
  t: TFunction;
  /** BCP-47 locale used to format dates, e.g. i18n.resolvedLanguage. */
  locale?: string;
  dynamicOptions?: SectionSummaryDynamicOptions;
};

/**
 * Best-effort "is this value worth showing in the collapsed preview" check.
 * Booleans are intentionally treated as meaningful only when `true` so an
 * unchecked checkbox or an empty-but-`active: true` contact reads as empty.
 */
export function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "boolean") return value === false;
  if (typeof value === "number") return Number.isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    // An object is "empty" when none of its non-boolean fields hold a value
    // (e.g. a blank contact `{ name: "", email: "", phone: "", active: true }`).
    return Object.values(value as Record<string, unknown>).every(
      (entry) => typeof entry === "boolean" || isEmptyFieldValue(entry),
    );
  }
  return false;
}

function pickObjectDisplay(value: Record<string, unknown>): string | null {
  const preferredKeys = [
    "label",
    "name",
    "title",
    "fullName",
    "displayName",
    "email",
    "phone",
  ];

  for (const key of preferredKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }

  // Address-like objects: assemble a short street/city line.
  const street = [value.street, value.streetNumber, value.flatNumber]
    .filter((part) => typeof part === "string" && part.trim() !== "")
    .join(" ");
  const cityLine = [value.postalCode, value.city]
    .filter((part) => typeof part === "string" && part.trim() !== "")
    .join(" ");
  const addressLine = [street, cityLine].filter(Boolean).join(", ");
  if (addressLine) return addressLine;

  const id = value.id;
  if (typeof id === "string" && id.trim() !== "") return id.trim();

  return null;
}

/**
 * Resolve a single raw value (string/number or option object) to the label the
 * user would see in the live field — mirroring InputSwitcher's option/enum
 * resolution so the preview matches the form exactly.
 */
function resolveOptionLabel(
  field: FieldData,
  raw: unknown,
  ctx: FormatFieldValueContext,
): string | null {
  if (raw !== null && typeof raw === "object") {
    const dynamic = field.optionsKey
      ? ctx.dynamicOptions?.[field.optionsKey]
      : undefined;
    const matched = dynamic?.find((option) => isEqual(option.object, raw));
    if (matched) return matched.label;
    return pickObjectDisplay(raw as Record<string, unknown>);
  }

  const stringValue = `${raw}`;
  const optionLabel = field.options?.find(
    (option) => option.value === stringValue,
  )?.label;

  // `enumName` takes precedence over the static option label, mirroring
  // InputSwitcher: the live field renders the translated enum value, using the
  // option label only as a fallback, then the raw value. Fields like
  // status/filesStatus/shippingOption ship English option labels alongside an
  // enumName, so reading the option label directly would leak "Files Are
  // Ready" / "Personal Collection" instead of the translated text.
  if (field.enumName) {
    return ctx.t(`${field.enumName}.${stringValue}`, {
      defaultValue: optionLabel ?? stringValue,
    });
  }

  if (optionLabel !== undefined) return optionLabel;

  if (field.optionsKey) {
    const dynamic = ctx.dynamicOptions?.[field.optionsKey];
    const matched = dynamic?.find((option) => option.value === stringValue);
    if (matched) return matched.label;
  }

  return stringValue;
}

function formatDate(field: FieldData, value: unknown, locale?: string): string {
  const raw = `${value}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return field.type === "datetime-local"
    ? date.toLocaleString(locale)
    : date.toLocaleDateString(locale);
}

/**
 * Produce the display string for a field's stored value in the collapsed
 * section preview, or `null` when there's nothing meaningful to show.
 */
export function formatFieldValue(
  field: FieldData,
  value: unknown,
  ctx: FormatFieldValueContext,
): string | null {
  if (isEmptyFieldValue(value)) return null;

  switch (field.type) {
    case "checkbox":
      return value
        ? ctx.t("common.yes", { defaultValue: "Yes" })
        : ctx.t("common.no", { defaultValue: "No" });

    case "date":
    case "datetime-local":
      return formatDate(field, value, ctx.locale);

    case "fileInputDropzone":
    case "fileManager": {
      const count = Array.isArray(value) ? value.length : 1;
      return ctx.t("forms.summary.fileCount", {
        count,
        defaultValue: `${count} file(s)`,
      });
    }

    case "multiSelect": {
      const items = Array.isArray(value) ? value : [value];
      const labels = items
        .map((item) => resolveOptionLabel(field, item, ctx))
        .filter((label): label is string => Boolean(label));
      return labels.length > 0 ? labels.join(", ") : null;
    }

    case "select":
    case "radio":
    case "radioGrid":
    case "search":
    case "indexedSearch":
    case "groupedIndexedSearch":
    case "addressAutocomplete":
    case "inpost-geowidget":
      return resolveOptionLabel(field, value, ctx);

    default:
      // text / textarea / number / slider / colorPicker and untyped fields.
      if (value !== null && typeof value === "object") {
        return resolveOptionLabel(field, value, ctx);
      }
      return `${value}`;
  }
}
