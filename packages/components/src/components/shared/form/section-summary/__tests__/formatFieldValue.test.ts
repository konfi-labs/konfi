import { FieldData } from "@konfi/types";
import type { TFunction } from "i18next";
import {
  formatFieldValue,
  isEmptyFieldValue,
  type FormatFieldValueContext,
} from "../formatFieldValue";

// Mock translation: enum keys resolve to a label, everything else falls back
// to defaultValue (mirroring how form labels are pre-translated).
const mockT = ((key, options) => {
  const lookupKey = Array.isArray(key) ? key[0] : key;
  const opts =
    typeof options === "object" && options !== null
      ? (options as Record<string, unknown>)
      : {};
  const defaultValue =
    typeof opts.defaultValue === "string" ? opts.defaultValue : undefined;

  if (lookupKey === "OrderStatus.PAID") return "Paid";
  return defaultValue ?? lookupKey;
}) as TFunction;

const ctx: FormatFieldValueContext = { t: mockT, locale: "en-US" };

const field = (overrides: Partial<FieldData>): FieldData => ({
  name: "field",
  ...overrides,
});

describe("isEmptyFieldValue", () => {
  test("treats blank, empty array, and false as empty", () => {
    expect(isEmptyFieldValue(undefined)).toBe(true);
    expect(isEmptyFieldValue(null)).toBe(true);
    expect(isEmptyFieldValue("   ")).toBe(true);
    expect(isEmptyFieldValue([])).toBe(true);
    expect(isEmptyFieldValue(false)).toBe(true);
  });

  test("treats a blank contact object as empty (ignoring boolean flags)", () => {
    expect(
      isEmptyFieldValue({ name: "", email: "", phone: "", active: true }),
    ).toBe(true);
    expect(isEmptyFieldValue({ name: "Ada", active: true })).toBe(false);
  });

  test("treats populated primitives as non-empty", () => {
    expect(isEmptyFieldValue("hello")).toBe(false);
    expect(isEmptyFieldValue(0)).toBe(false);
    expect(isEmptyFieldValue(true)).toBe(false);
  });
});

describe("formatFieldValue", () => {
  test("returns null for empty values", () => {
    expect(formatFieldValue(field({ type: "number" }), "", ctx)).toBeNull();
    expect(formatFieldValue(field({}), undefined, ctx)).toBeNull();
  });

  test("passes through plain text and numbers", () => {
    expect(formatFieldValue(field({}), "Acme", ctx)).toBe("Acme");
    expect(formatFieldValue(field({ type: "number" }), 42, ctx)).toBe("42");
  });

  test("resolves a select value to its option label", () => {
    const select = field({
      type: "select",
      options: [
        { label: "Small", value: "S" },
        { label: "Large", value: "L" },
      ],
    });
    expect(formatFieldValue(select, "L", ctx)).toBe("Large");
  });

  test("resolves enum values through the translation function", () => {
    const select = field({ type: "select", enumName: "OrderStatus" });
    expect(formatFieldValue(select, "PAID", ctx)).toBe("Paid");
    // Unknown enum value falls back to the raw value.
    expect(formatFieldValue(select, "DRAFT", ctx)).toBe("DRAFT");
  });

  test("prefers the translated enum value over a hardcoded option label", () => {
    // Mirrors real fields (status/filesStatus/shippingOption) that ship English
    // option labels alongside an enumName — the enum translation must win.
    const shippingOption = field({
      type: "select",
      enumName: "ShippingOptions",
      options: [
        { label: "Personal Collection", value: "PERSONAL_COLLECTION" },
        { label: "DHL", value: "DHL" },
      ],
    });
    const t = ((key, options) => {
      const lookupKey = Array.isArray(key) ? key[0] : key;
      if (lookupKey === "ShippingOptions.PERSONAL_COLLECTION") {
        return "Odbiór osobisty";
      }
      const opts =
        typeof options === "object" && options !== null
          ? (options as Record<string, unknown>)
          : {};
      return typeof opts.defaultValue === "string" ? opts.defaultValue : key;
    }) as TFunction;

    expect(
      formatFieldValue(shippingOption, "PERSONAL_COLLECTION", { t }),
    ).toBe("Odbiór osobisty");
    // Unknown enum value falls back to the option label, not the raw value.
    expect(formatFieldValue(shippingOption, "DHL", { t })).toBe("DHL");
  });

  test("joins multiSelect labels", () => {
    const multi = field({
      type: "multiSelect",
      options: [
        { label: "Red", value: "r" },
        { label: "Blue", value: "b" },
      ],
    });
    expect(formatFieldValue(multi, ["r", "b"], ctx)).toBe("Red, Blue");
  });

  test("formats checkboxes as yes/no", () => {
    const checkbox = field({ type: "checkbox" });
    expect(formatFieldValue(checkbox, true, ctx)).toBe("Yes");
    // false is filtered as empty before reaching the formatter branch.
    expect(formatFieldValue(checkbox, false, ctx)).toBeNull();
  });

  test("summarizes file inputs by count", () => {
    const files = field({ type: "fileManager" });
    expect(formatFieldValue(files, ["a.png", "b.png"], ctx)).toBe("2 file(s)");
  });

  test("derives a label from object-valued fields", () => {
    const contact = field({ type: "search", isObject: true });
    expect(
      formatFieldValue(
        contact,
        { name: "Ada Lovelace", email: "ada@example.com" },
        ctx,
      ),
    ).toBe("Ada Lovelace");
  });

  test("matches a dynamic option by object identity", () => {
    const object = { id: "c1", name: "Stored Name" };
    const contact = field({ type: "select", optionsKey: "contacts" });
    const withOptions: FormatFieldValueContext = {
      ...ctx,
      dynamicOptions: {
        contacts: [{ label: "Ada (work)", value: "c1", object }],
      },
    };
    expect(formatFieldValue(contact, object, withOptions)).toBe("Ada (work)");
  });

  test("formats dates without leaking the raw ISO string", () => {
    const date = field({ type: "date" });
    expect(formatFieldValue(date, "2026-06-09T12:00:00", ctx)).toContain(
      "2026",
    );
    // Unparseable input is returned verbatim.
    expect(formatFieldValue(date, "not-a-date", ctx)).toBe("not-a-date");
  });
});
