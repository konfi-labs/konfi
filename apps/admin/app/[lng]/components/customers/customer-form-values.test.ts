import type { Customer } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  initialValuesUpdate,
  initialValuesUpdateEmpty,
} from "./customer-form-values";

function createCustomer(overrides: Partial<Customer> = {}): Customer {
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
    name: "Customer",
    specialNotes: "",
    updatedAt: {} as Customer["updatedAt"],
    updatedBy: { id: "member-1", name: "Member" },
    ...overrides,
  };
}

describe("customer form values", () => {
  it("provides empty edit defaults before a customer is selected", () => {
    expect(initialValuesUpdateEmpty()).toMatchObject({
      allowedBankPayments: false,
      allowedDefferedPayments: false,
      allowedOnPickupPayments: false,
      b2b: false,
      customerGroupIds: [],
      discount: 0,
      email: "",
      name: "",
      nip: "",
      personName: "",
      specialNotes: "",
      updatedBy: {
        id: "",
        name: "",
      },
    });
  });

  it("normalizes missing edit basic-section values", () => {
    const values = initialValuesUpdate(
      createCustomer({
        allowedBankPayments: undefined as unknown as boolean,
        allowedDefferedPayments: undefined as unknown as boolean,
        allowedOnPickupPayments: undefined as unknown as boolean,
        b2b: undefined,
        discount: undefined,
        email: undefined,
        nip: undefined,
        personName: undefined,
        specialNotes: undefined as unknown as string,
      }),
    );

    expect(values).toMatchObject({
      allowedBankPayments: false,
      allowedDefferedPayments: false,
      allowedOnPickupPayments: false,
      b2b: false,
      discount: 0,
      email: "",
      nip: "",
      personName: "",
      specialNotes: "",
    });
  });

  it("creates fallback contact and address rows for edit forms", () => {
    const values = initialValuesUpdate(
      createCustomer({
        addresses: undefined,
        contacts: undefined,
      }),
    );

    expect(values.contacts).toEqual([
      {
        active: false,
        email: "",
        name: "",
        phone: "",
      },
    ]);
    expect(values.addresses?.[0]).toMatchObject({
      active: false,
      country: "Polska",
      name: "",
      type: "BILLING",
    });
  });
});
