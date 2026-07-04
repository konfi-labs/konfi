import type {
  Customer,
  CustomerCreateForm,
  CustomerUpdateForm,
} from "@konfi/types";
import { addressInitialValues, contactIntialValues } from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";

const emptyContact = () => ({ ...contactIntialValues });

const emptyAddress = () => ({ ...addressInitialValues });

const emptyMember = () => ({
  id: "",
  name: "",
});

export const initialValuesCreate = (): CustomerCreateForm => ({
  name: "",
  email: "",
  personName: "",
  nip: "",
  allowedBankPayments: false,
  allowedOnPickupPayments: false,
  allowedDefferedPayments: false,
  contacts: [emptyContact()],
  addresses: [emptyAddress()],
  specialNotes: "",
  discount: 0,
  b2b: false,
  customerGroupIds: [],
  createdBy: emptyMember(),
});

export const initialValuesUpdateEmpty = (): CustomerUpdateForm => ({
  name: "",
  email: "",
  personName: "",
  nip: "",
  allowedBankPayments: false,
  allowedOnPickupPayments: false,
  allowedDefferedPayments: false,
  contacts: [emptyContact()],
  addresses: [emptyAddress()],
  specialNotes: "",
  discount: 0,
  b2b: false,
  customerGroupIds: [],
  updatedBy: emptyMember(),
});

export const initialValuesUpdate = (
  customer?: Customer,
): CustomerUpdateForm => {
  if (isUndefined(customer)) {
    throw new Error("customer was not provided to initialValuesUpdate");
  }

  return {
    name: customer.name ?? "",
    email: customer.email ?? "",
    personName: customer.personName ?? "",
    nip: customer.nip ?? "",
    allowedBankPayments: customer.allowedBankPayments ?? false,
    allowedOnPickupPayments: customer.allowedOnPickupPayments ?? false,
    allowedDefferedPayments: customer.allowedDefferedPayments ?? false,
    contacts:
      Array.isArray(customer.contacts) && !isEmpty(customer.contacts)
        ? customer.contacts
        : [emptyContact()],
    addresses:
      Array.isArray(customer.addresses) && !isEmpty(customer.addresses)
        ? customer.addresses
        : [emptyAddress()],
    specialNotes: customer.specialNotes ?? "",
    discount: customer.discount ?? 0,
    b2b: customer.b2b ?? false,
    customerGroupIds: customer.customerGroupIds ?? [],
    updatedBy: customer.updatedBy,
  };
};

export const initialValuesDuplicate = (
  customer?: Customer,
): CustomerCreateForm => {
  if (isUndefined(customer)) {
    throw new Error("customer was not provided to initialValuesDuplicate");
  }

  return {
    name: customer.name ?? "",
    email: customer.email ?? "",
    personName: customer.personName ?? "",
    nip: customer.nip ?? "",
    allowedBankPayments: customer.allowedBankPayments ?? false,
    allowedOnPickupPayments: customer.allowedOnPickupPayments ?? false,
    allowedDefferedPayments: customer.allowedDefferedPayments ?? false,
    contacts:
      Array.isArray(customer.contacts) && !isEmpty(customer.contacts)
        ? customer.contacts
        : [emptyContact()],
    addresses:
      Array.isArray(customer.addresses) && !isEmpty(customer.addresses)
        ? customer.addresses
        : [emptyAddress()],
    specialNotes: customer.specialNotes ?? "",
    discount: customer.discount ?? 0,
    b2b: customer.b2b ?? false,
    customerGroupIds: customer.customerGroupIds ?? [],
    createdBy: emptyMember(),
  };
};
