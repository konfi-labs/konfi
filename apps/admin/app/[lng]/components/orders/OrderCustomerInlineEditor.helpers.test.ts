import {
  AddressTypeEnum,
  type Address,
  type NestedCustomer,
} from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  createEditableAddressFromSelection,
  getSavedCustomerAddressOptions,
} from "./OrderCustomerInlineEditor.helpers";

const shippingAddress: Address = {
  name: "Main Warehouse",
  type: AddressTypeEnum.SHIPPING,
  street: "Example Street",
  number: "10",
  local: "2",
  zip: "00-001",
  city: "Example City",
  country: "Polska",
  active: true,
};

const billingAddress: Address = {
  name: "Accounting",
  type: AddressTypeEnum.BILLING,
  companyName: "Konfi Sp. z o.o.",
  nip: "0000000000",
  street: "Fakturowa",
  number: "5",
  zip: "00-002",
  city: "Example City",
  country: "Polska",
  active: true,
};

const inactiveShippingAddress: Address = {
  name: "Old Warehouse",
  type: AddressTypeEnum.SHIPPING,
  street: "Archiwalna",
  number: "1",
  zip: "00-003",
  city: "Example City",
  country: "Polska",
  active: false,
};

const customer: NestedCustomer = {
  id: "customer-1",
  name: "Konfi",
  allowedBankPayments: true,
  allowedOnPickupPayments: true,
  allowedDefferedPayments: false,
  addresses: [shippingAddress, billingAddress, inactiveShippingAddress],
  specialNotes: "",
};

describe("OrderCustomerInlineEditor address helpers", () => {
  it("returns active saved customer addresses for the requested type", () => {
    const options = getSavedCustomerAddressOptions(
      customer,
      AddressTypeEnum.SHIPPING,
    );

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      label: shippingAddress.name,
      object: shippingAddress,
    });
  });

  it("does not return address options for string customers", () => {
    expect(
      getSavedCustomerAddressOptions("Guest Customer", AddressTypeEnum.BILLING),
    ).toEqual([]);
  });

  it("creates a normalized editable address from a selected radio option", () => {
    const selectedAddress = createEditableAddressFromSelection(
      billingAddress,
      AddressTypeEnum.BILLING,
    );

    expect(selectedAddress).toEqual({
      ...billingAddress,
      invoiceRecipientCity: "",
      invoiceRecipientEnabled: false,
      invoiceRecipientName: "",
      invoiceRecipientNip: "",
      invoiceRecipientRole: "recipient",
      invoiceRecipientRoleDescription: "",
      invoiceRecipientStreet: "",
      invoiceRecipientZip: "",
      jstRecipientCity: "",
      jstRecipientEnabled: false,
      jstRecipientName: "",
      jstRecipientNip: "",
      jstRecipientStreet: "",
      jstRecipientZip: "",
      local: "",
    });
    expect(selectedAddress).not.toBe(billingAddress);
  });

  it("ignores non-address radio values", () => {
    expect(
      createEditableAddressFromSelection("manual", AddressTypeEnum.SHIPPING),
    ).toBeNull();
  });
});
