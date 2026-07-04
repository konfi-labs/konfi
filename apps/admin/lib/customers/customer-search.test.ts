import type { Customer } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  getFuzzyCustomerSearchSeed,
  rankCustomersByFuzzySearch,
} from "./customer-search";

function createCustomer(overrides: Partial<Customer>): Customer {
  return {
    active: true,
    addresses: [],
    allowedBankPayments: false,
    allowedDefferedPayments: false,
    allowedOnPickupPayments: false,
    contacts: [],
    createdAt: {} as Customer["createdAt"],
    createdBy: { id: "member-1", name: "Member" },
    discount: 0,
    id: "customer-1",
    keywords: [],
    linkedProductsIds: [],
    loyaltyPoints: 0,
    name: "Customer",
    orders: [],
    specialNotes: "",
    updatedAt: {} as Customer["updatedAt"],
    updatedBy: { id: "member-1", name: "Member" },
    ...overrides,
  };
}

describe("customer fuzzy search", () => {
  it("uses the first normalized character as the Firestore keyword seed", () => {
    expect(getFuzzyCustomerSearchSeed(" tst ")).toBe("t");
    expect(getFuzzyCustomerSearchSeed("te")).toBeUndefined();
  });

  it("matches a one-character omission like tst against Test", () => {
    const results = rankCustomersByFuzzySearch(
      [
        createCustomer({
          id: "test-customer",
          keywords: ["", "t", "te", "tes", "test"],
          name: "Test",
        }),
      ],
      "tst",
    );

    expect(results.map((customer) => customer.id)).toEqual(["test-customer"]);
  });

  it("does not return inactive fuzzy matches", () => {
    const results = rankCustomersByFuzzySearch(
      [
        createCustomer({
          active: false,
          id: "inactive-test",
          name: "Test",
        }),
      ],
      "tst",
    );

    expect(results).toEqual([]);
  });

  it("ranks exact matches ahead of fuzzy matches", () => {
    const results = rankCustomersByFuzzySearch(
      [
        createCustomer({ id: "fuzzy", name: "Test" }),
        createCustomer({ id: "exact", name: "Tst" }),
      ],
      "tst",
    );

    expect(results.map((customer) => customer.id)).toEqual(["exact", "fuzzy"]);
  });
});
