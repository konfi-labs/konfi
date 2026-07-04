import { AddressTypeEnum, type Warehouse } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  formatStreetLine,
  generateAddressOptions,
  parseStreetAddress,
} from "./contact-address-utils";

describe("parseStreetAddress", () => {
  it("should parse street with number using slash notation", () => {
    const result = parseStreetAddress("Example Street 10/5");
    expect(result).toEqual({
      street: "Example Street",
      number: "10",
      flat: "5",
    });
  });

  it("should parse street with 'ul.' prefix and slash notation", () => {
    const result = parseStreetAddress("Example Avenue 12/3");
    expect(result).toEqual({
      street: "Example Avenue",
      number: "12",
      flat: "3",
    });
  });

  it("should parse street with 'm.' apartment notation", () => {
    const result = parseStreetAddress("Example Avenue 12 m. 3");
    expect(result).toEqual({
      street: "Example Avenue",
      number: "12",
      flat: "3",
    });
  });

  it("should parse street with 'lok.' apartment notation", () => {
    const result = parseStreetAddress("Short Street 5 lok. 2");
    expect(result).toEqual({
      street: "Short Street",
      number: "5",
      flat: "2",
    });
  });

  it("should parse street with 'mieszkanie' apartment notation", () => {
    const result = parseStreetAddress("Example Square 8 mieszkanie 15");
    expect(result).toEqual({
      street: "Example Square",
      number: "8",
      flat: "15",
    });
  });

  it("should parse basic street with number only", () => {
    const result = parseStreetAddress("Example Street 10");
    expect(result).toEqual({
      street: "Example Street",
      number: "10",
      flat: "",
    });
  });

  it("should parse street with alphanumeric number", () => {
    const result = parseStreetAddress("Short Street 5A");
    expect(result).toEqual({
      street: "Short Street",
      number: "5A",
      flat: "",
    });
  });

  it("should parse street with alphanumeric number and flat", () => {
    const result = parseStreetAddress("Example Boulevard 10B/12");
    expect(result).toEqual({
      street: "Example Boulevard",
      number: "10B",
      flat: "12",
    });
  });

  it("should parse street with alphanumeric flat number", () => {
    const result = parseStreetAddress("Example Lane 15/2A");
    expect(result).toEqual({
      street: "Example Lane",
      number: "15",
      flat: "2A",
    });
  });

  it("should handle street with multiple words", () => {
    const result = parseStreetAddress("Example Long Street 123");
    expect(result).toEqual({
      street: "Example Long Street",
      number: "123",
      flat: "",
    });
  });

  it("should handle street only (no number)", () => {
    const result = parseStreetAddress("Example Street");
    expect(result).toEqual({
      street: "Example Street",
      number: "",
      flat: "",
    });
  });

  it("should handle empty string", () => {
    const result = parseStreetAddress("");
    expect(result).toEqual({
      street: "",
      number: "",
      flat: "",
    });
  });

  it("should handle null/undefined input", () => {
    const result1 = parseStreetAddress(null);
    const result2 = parseStreetAddress(undefined);

    expect(result1).toEqual({
      street: "",
      number: "",
      flat: "",
    });
    expect(result2).toEqual({
      street: "",
      number: "",
      flat: "",
    });
  });

  it("should trim whitespace", () => {
    const result = parseStreetAddress("  Example Avenue 12/3  ");
    expect(result).toEqual({
      street: "Example Avenue",
      number: "12",
      flat: "3",
    });
  });

  it("should handle extra spaces between parts", () => {
    const result = parseStreetAddress("Example Avenue  12  /  3");
    expect(result).toEqual({
      street: "Example Avenue",
      number: "12",
      flat: "3",
    });
  });

  it("should handle case-insensitive apartment indicators", () => {
    const result1 = parseStreetAddress("Short Street 5 M. 2");
    const result2 = parseStreetAddress("Short Street 5 LOK. 2");
    const result3 = parseStreetAddress("Short Street 5 Mieszkanie 2");

    expect(result1.flat).toBe("2");
    expect(result2.flat).toBe("2");
    expect(result3.flat).toBe("2");
  });

  it("should parse simple number-only addresses", () => {
    const result = parseStreetAddress("Street 38");
    expect(result).toEqual({
      street: "Street",
      number: "38",
      flat: "",
    });
  });

  it("should parse street with single-digit number", () => {
    const result = parseStreetAddress("Main Street 7");
    expect(result).toEqual({
      street: "Main Street",
      number: "7",
      flat: "",
    });
  });

  it("should parse street with three-digit number", () => {
    const result = parseStreetAddress("Example Road 156");
    expect(result).toEqual({
      street: "Example Road",
      number: "156",
      flat: "",
    });
  });

  it("should parse prefixed street with simple number", () => {
    const result = parseStreetAddress("Example Road 38");
    expect(result).toEqual({
      street: "Example Road",
      number: "38",
      flat: "",
    });
  });
});

describe("formatStreetLine", () => {
  it("should format street, house and apartment number into a single line", () => {
    expect(formatStreetLine("Example Street", "10", "5")).toBe(
      "Example Street 10/5",
    );
  });

  it("should avoid duplicating values already present in the street line", () => {
    expect(formatStreetLine("Example Street 10/5", "10", "5")).toBe(
      "Example Street 10/5",
    );
  });

  it("should handle empty street values", () => {
    expect(formatStreetLine("", "10", "5")).toBe("10/5");
  });

  it("should handle regex metacharacters in the house number", () => {
    // an unescaped "10(" would be an invalid regex pattern
    expect(formatStreetLine("Example Street", "10(", "")).toBe(
      "Example Street 10(",
    );
    // an unescaped "10+12" would falsely match "1012" and skip the append
    expect(formatStreetLine("Example Street 1012", "10+12", "")).toBe(
      "Example Street 1012 10+12",
    );
  });
});

describe("generateAddressOptions", () => {
  it("should generate unique values for duplicate address entries", () => {
    const duplicateAddresses = [
      {
        name: "Example Agency Sp. z o.o.",
        type: AddressTypeEnum.BILLING,
        street: "Example Street",
        number: "10",
        zip: "00-001",
        city: "Example City",
        country: "Poland",
        active: true,
      },
      {
        name: "Example Agency Sp. z o.o.",
        type: AddressTypeEnum.BILLING,
        street: "Example Street",
        number: "10",
        zip: "00-001",
        city: "Example City",
        country: "Poland",
        active: true,
      },
    ];

    const options = generateAddressOptions(
      duplicateAddresses,
      AddressTypeEnum.BILLING,
    );

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.label)).toEqual([
      duplicateAddresses[0].name,
      duplicateAddresses[1].name,
    ]);
    expect(new Set(options.map((option) => option.value)).size).toBe(2);
  });

  it("should keep billing addresses with different invoice recipients distinct", () => {
    const addresses = [
      {
        name: "Example Agency Sp. z o.o.",
        type: AddressTypeEnum.BILLING,
        street: "Example Street",
        number: "10",
        zip: "00-001",
        city: "Example City",
        country: "Poland",
        active: true,
        invoiceRecipientEnabled: true,
        invoiceRecipientRole: "recipient" as const,
        invoiceRecipientName: "Recipient One",
        invoiceRecipientNip: "1111111111",
      },
      {
        name: "Example Agency Sp. z o.o.",
        type: AddressTypeEnum.BILLING,
        street: "Example Street",
        number: "10",
        zip: "00-001",
        city: "Example City",
        country: "Poland",
        active: true,
        invoiceRecipientEnabled: true,
        invoiceRecipientRole: "payer" as const,
        invoiceRecipientName: "Recipient Two",
        invoiceRecipientNip: "2222222222",
      },
    ];

    const options = generateAddressOptions(addresses, AddressTypeEnum.BILLING);

    expect(options).toHaveLength(2);
    expect(new Set(options.map((option) => option.value)).size).toBe(2);
  });

  it("should include legacy warehouse addresses without an active flag", () => {
    const legacyWarehouse = {
      id: "warehouse-1",
      name: "Main Pickup",
      active: true,
      address: {
        name: "Pickup Desk",
        type: AddressTypeEnum.BILLING,
        street: "Warehouse Street",
        number: "10",
        zip: "00-001",
        city: "Example City",
        country: "Poland",
      },
    } as unknown as Warehouse;

    const options = generateAddressOptions([], AddressTypeEnum.SHIPPING, [
      legacyWarehouse,
    ]);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      label: "Pickup Desk",
      value: "warehouse:warehouse-1",
    });
    expect(options[0].object).toMatchObject({
      active: true,
      type: AddressTypeEnum.SHIPPING,
    });
  });

  it("should not include inactive warehouse addresses", () => {
    const inactiveWarehouse = {
      id: "warehouse-1",
      name: "Main Pickup",
      active: true,
      address: {
        name: "Pickup Desk",
        type: AddressTypeEnum.BILLING,
        street: "Warehouse Street",
        number: "10",
        zip: "00-001",
        city: "Example City",
        country: "Poland",
        active: false,
      },
    } as unknown as Warehouse;

    const options = generateAddressOptions([], AddressTypeEnum.SHIPPING, [
      inactiveWarehouse,
    ]);

    expect(options).toEqual([]);
  });
});
