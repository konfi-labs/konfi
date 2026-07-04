import {
  Address,
  AddressTypeEnum,
  Contact,
  CurrencyEnumAsOptions,
  enumToSearchOptions,
  FormData,
} from "@konfi/types";
import type { TFunction } from "i18next";
import { createInvoiceRecipientFields } from "./_helpers";

type CustomerGroupOption = {
  label: string;
  value: string;
};

export const contactIntialValues: Contact = {
  name: "",
  email: "",
  phone: "",
  active: false,
};

export const addressInitialValues: Address = {
  name: "",
  type: "BILLING",
  nip: "",
  companyName: "",
  invoiceRecipientEnabled: false,
  invoiceRecipientRole: "recipient",
  invoiceRecipientRoleDescription: "",
  invoiceRecipientName: "",
  invoiceRecipientNip: "",
  invoiceRecipientStreet: "",
  invoiceRecipientZip: "",
  invoiceRecipientCity: "",
  jstRecipientEnabled: false,
  jstRecipientName: "",
  jstRecipientNip: "",
  jstRecipientStreet: "",
  jstRecipientZip: "",
  jstRecipientCity: "",
  street: "",
  number: "",
  local: "",
  zip: "",
  city: "",
  country: "Polska",
  active: false,
};

export const customerForm = (
  t: TFunction,
  customerGroupOptions: CustomerGroupOption[] = [],
): FormData => ({
  allowMultiple: true,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: t("forms.headings.basicInformation", {
        defaultValue: "Basic Information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          watch: true,
          placeholder: t("forms.placeholders.companyName", {
            defaultValue: "Company Name",
          }),
        },
        {
          name: "personName",
          label: t("forms.labels.person", { defaultValue: "Person" }),
          isRequired: false,
          watch: true,
          placeholder: t("forms.placeholders.fullName", {
            defaultValue: "Full Name",
          }),
        },
        {
          name: "email",
          label: t("forms.labels.email", { defaultValue: "Email" }),
          isRequired: false,
          watch: true,
          placeholder: t("forms.placeholders.email", { defaultValue: "Email" }),
        },
        {
          name: "nip",
          label: t("forms.labels.nip", { defaultValue: "Tax ID" }),
          isRequired: false,
          watch: true,
          placeholder: t("forms.placeholders.nipNumber", {
            defaultValue: "0000000000",
          }),
          getCustomerDataModal: true,
        },
        {
          name: "allowedBankPayments",
          isRequired: false,
          placeholder: t("forms.helperTexts.allowBankPayments", {
            defaultValue: "Allow bank transfer payments.",
          }),
          type: "checkbox",
        },
        {
          name: "allowedOnPickupPayments",
          isRequired: false,
          placeholder: t("forms.helperTexts.allowOnPickupPayments", {
            defaultValue: "Allow on-pickup payments.",
          }),
          type: "checkbox",
        },
        {
          name: "allowedDefferedPayments",
          isRequired: false,
          placeholder: t("forms.helperTexts.allowDeferredPayments", {
            defaultValue: "Allow deferred payments.",
          }),
          type: "checkbox",
        },
        {
          name: "specialNotes",
          isRequired: false,
          placeholder: t("forms.labels.specialNotes", {
            defaultValue: "Special Notes",
          }),
          type: "textarea",
          watch: true,
        },
        {
          name: "discount",
          label: t("forms.labels.discount", { defaultValue: "Discount" }),
          isRequired: false,
          watch: true,
          placeholder: t("forms.placeholders.zero", { defaultValue: "0" }),
          type: "number",
          min: 0,
          max: 100,
          helperText: t("forms.helperTexts.discountPercentage", {
            defaultValue: "Discount in percentage",
          }),
        },
        {
          name: "b2b",
          isRequired: false,
          placeholder: t("forms.labels.b2b", { defaultValue: "B2B" }),
          type: "checkbox",
        },
        ...(customerGroupOptions.length > 0
          ? [
              {
                name: "customerGroupIds",
                label: t("forms.labels.customerGroups", {
                  defaultValue: "Customer groups",
                }),
                isRequired: false,
                placeholder: t("forms.placeholders.selectCustomerGroups", {
                  defaultValue: "Select customer groups…",
                }),
                type: "multiSelect" as const,
                options: customerGroupOptions,
              },
            ]
          : []),
      ],
    },
    {
      fieldArray: true,
      name: "addresses",
      initialValues: addressInitialValues,
      heading: t("forms.headings.addresses", { defaultValue: "Addresses" }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.home", { defaultValue: "Home" }),
        },
        {
          name: "type",
          isRequired: true,
          placeholder: t("forms.placeholders.selectAddressType", {
            defaultValue: "Select address type...",
          }),
          type: "select",
          options: enumToSearchOptions(AddressTypeEnum),
          enumName: "AddressTypeEnum",
        },
        {
          name: "nip",
          label: t("forms.labels.nip", { defaultValue: "Tax ID" }),
          isRequired: false,
          placeholder: t("forms.placeholders.nipNumber", {
            defaultValue: "0000000000",
          }),
        },
        {
          name: "companyName",
          label: t("forms.labels.companyName", {
            defaultValue: "Company Name",
          }),
          isRequired: false,
          placeholder: t("forms.placeholders.companyName", {
            defaultValue: "Company Name",
          }),
        },
        {
          name: "street",
          label: t("forms.labels.street", { defaultValue: "Street" }),
          isRequired: false,
          placeholder: t("forms.placeholders.exampleStreet", {
            defaultValue: "Example",
          }),
          type: "addressAutocomplete",
        },
        {
          name: "zip",
          label: t("forms.labels.postalCode", { defaultValue: "Postal Code" }),
          isRequired: false,
          placeholder: t("forms.placeholders.postalCode", {
            defaultValue: "00-000",
          }),
          autocomplete: "postal-code",
        },
        {
          name: "city",
          label: t("forms.labels.city", { defaultValue: "City" }),
          isRequired: false,
          placeholder: t("forms.placeholders.city", { defaultValue: "Warsaw" }),
        },
        {
          name: "country",
          label: t("forms.labels.country", { defaultValue: "Country" }),
          isRequired: false,
          placeholder: t("forms.placeholders.country", {
            defaultValue: "Poland",
          }),
        },
        ...createInvoiceRecipientFields(t, {
          watchNested: true,
          visibilityDependencies: [
            {
              name: "type",
              value: AddressTypeEnum.BILLING,
              watchNested: true,
            },
          ],
        }),
        {
          name: "active",
          isRequired: false,
          placeholder: t("forms.helperTexts.active", {
            defaultValue: "Active.",
          }),
          type: "checkbox",
        },
      ],
    },
    {
      fieldArray: true,
      name: "contacts",
      initialValues: contactIntialValues,
      heading: t("forms.headings.contacts", { defaultValue: "Contacts" }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.contactName", {
            defaultValue: "Contact Name",
          }),
        },
        {
          name: "email",
          label: t("forms.labels.email", { defaultValue: "Email" }),
          isRequired: false,
          placeholder: t("forms.placeholders.domainEmail", {
            defaultValue: "name@domain",
          }),
        },
        {
          name: "phone",
          label: t("forms.labels.phone", { defaultValue: "Phone" }),
          isRequired: false,
          placeholder: t("forms.placeholders.phone", {
            defaultValue: "123456789",
          }),
        },
        {
          name: "active",
          isRequired: false,
          placeholder: t("forms.helperTexts.active", {
            defaultValue: "Active.",
          }),
          type: "checkbox",
        },
      ],
    },
  ],
});

export const customerGroupForm = (t: TFunction): FormData => ({
  allowMultiple: false,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: t("customerGroups.form.basicInformation", {
        defaultValue: "Basic information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("customerGroups.form.namePlaceholder", {
            defaultValue: "Group name",
          }),
        },
        {
          name: "description",
          label: t("forms.labels.description", {
            defaultValue: "Description",
          }),
          isRequired: false,
          placeholder: t("customerGroups.form.descriptionPlaceholder", {
            defaultValue: "Internal notes about this group…",
          }),
          type: "textarea",
        },
      ],
    },
  ],
});

export const supplierForm = (t: TFunction): FormData => ({
  allowMultiple: true,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: t("forms.headings.basicInformation", {
        defaultValue: "Basic Information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.name", { defaultValue: "Name" }),
        },
        {
          name: "companyName",
          label: t("forms.labels.companyName", {
            defaultValue: "Company Name",
          }),
          isRequired: true,
          placeholder: t("forms.placeholders.companyName", {
            defaultValue: "Company Name",
          }),
        },
        {
          name: "contactPerson",
          label: t("forms.labels.contactPerson", {
            defaultValue: "Contact Person",
          }),
          isRequired: false,
          placeholder: t("forms.placeholders.contactPerson", {
            defaultValue: "Contact Person",
          }),
        },
        {
          name: "email",
          label: t("forms.labels.email", { defaultValue: "Email" }),
          isRequired: false,
          placeholder: t("forms.placeholders.email", { defaultValue: "Email" }),
        },
        {
          name: "phone",
          label: t("forms.labels.phone", { defaultValue: "Phone" }),
          isRequired: false,
          placeholder: t("forms.placeholders.phone", { defaultValue: "Phone" }),
        },
        {
          name: "website",
          label: t("forms.labels.website", { defaultValue: "Website" }),
          isRequired: false,
          placeholder: t("forms.placeholders.website", {
            defaultValue: "https://example.com",
          }),
        },
        {
          name: "nip",
          label: t("forms.labels.nip", { defaultValue: "Tax ID" }),
          isRequired: false,
          placeholder: t("forms.placeholders.nipNumber", {
            defaultValue: "0000000000",
          }),
          getCustomerDataModal: true,
        },
        {
          name: "regon",
          label: t("forms.labels.regon", { defaultValue: "REGON" }),
          isRequired: false,
          placeholder: t("forms.placeholders.regon", {
            defaultValue: "123456789",
          }),
        },
        {
          name: "krs",
          label: t("forms.labels.krs", { defaultValue: "KRS" }),
          isRequired: false,
          placeholder: t("forms.placeholders.krs", {
            defaultValue: "0000123456",
          }),
        },
        {
          name: "supplierCode",
          label: t("forms.labels.supplierCode", {
            defaultValue: "Supplier Code",
          }),
          isRequired: false,
          placeholder: t("forms.placeholders.supplierCode", {
            defaultValue: "SUP001",
          }),
        },
        {
          name: "specialNotes",
          isRequired: false,
          placeholder: t("forms.labels.specialNotes", {
            defaultValue: "Special Notes",
          }),
          type: "textarea",
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.headings.businessDetails", {
        defaultValue: "Business Details",
      }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "paymentTerms",
          label: t("forms.labels.paymentTerms", {
            defaultValue: "Payment Terms",
          }),
          isRequired: false,
          placeholder: t("forms.placeholders.paymentTerms", {
            defaultValue: "NET30",
          }),
        },
        {
          name: "currency",
          label: t("forms.labels.currency", { defaultValue: "Currency" }),
          isRequired: true,
          placeholder: t("forms.placeholders.currency", {
            defaultValue: "Select currency...",
          }),
          type: "select",
          options: CurrencyEnumAsOptions,
        },
        {
          name: "leadTime",
          label: t("forms.labels.leadTime", {
            defaultValue: "Lead Time (days)",
          }),
          isRequired: false,
          placeholder: t("forms.placeholders.leadTime", { defaultValue: "7" }),
          type: "number",
          min: 0,
        },
        {
          name: "minimumOrder",
          label: t("forms.labels.minimumOrder", {
            defaultValue: "Minimum Order Value",
          }),
          isRequired: false,
          placeholder: t("forms.placeholders.minimumOrder", {
            defaultValue: "1000",
          }),
          type: "number",
          min: 0,
        },
        {
          name: "rating",
          label: t("forms.labels.rating", { defaultValue: "Rating" }),
          isRequired: false,
          placeholder: t("forms.placeholders.rating", { defaultValue: "5" }),
          type: "slider",
          min: 1,
          max: 5,
        },
        {
          name: "isPreferred",
          isRequired: false,
          placeholder: t("forms.labels.preferredSupplier", {
            defaultValue: "Preferred Supplier",
          }),
          type: "checkbox",
        },
      ],
    },
    {
      fieldArray: true,
      name: "addresses",
      initialValues: addressInitialValues,
      heading: t("forms.headings.addresses", { defaultValue: "Addresses" }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.home", { defaultValue: "Home" }),
        },
        {
          name: "type",
          isRequired: true,
          placeholder: t("forms.placeholders.selectAddressType", {
            defaultValue: "Select address type...",
          }),
          type: "select",
          options: enumToSearchOptions(AddressTypeEnum),
          enumName: "AddressTypeEnum",
        },
        {
          name: "nip",
          label: t("forms.labels.nip", { defaultValue: "Tax ID" }),
          isRequired: false,
          placeholder: t("forms.placeholders.nipNumber", {
            defaultValue: "0000000000",
          }),
          getCustomerDataModal: true,
        },
        {
          name: "companyName",
          label: t("forms.labels.companyName", {
            defaultValue: "Company Name",
          }),
          isRequired: false,
          placeholder: t("forms.placeholders.companyName", {
            defaultValue: "Company Name",
          }),
        },
        {
          name: "street",
          label: t("forms.labels.street", { defaultValue: "Street" }),
          isRequired: false,
          placeholder: t("forms.placeholders.exampleStreet", {
            defaultValue: "Example",
          }),
          type: "addressAutocomplete",
        },
        {
          name: "zip",
          label: t("forms.labels.postalCode", { defaultValue: "Postal Code" }),
          isRequired: false,
          placeholder: t("forms.placeholders.postalCode", {
            defaultValue: "00-000",
          }),
          autocomplete: "postal-code",
        },
        {
          name: "city",
          label: t("forms.labels.city", { defaultValue: "City" }),
          isRequired: false,
          placeholder: t("forms.placeholders.city", { defaultValue: "Warsaw" }),
        },
        {
          name: "country",
          label: t("forms.labels.country", { defaultValue: "Country" }),
          isRequired: false,
          placeholder: t("forms.placeholders.country", {
            defaultValue: "Poland",
          }),
        },
        {
          name: "active",
          isRequired: false,
          placeholder: t("forms.helperTexts.active", {
            defaultValue: "Active.",
          }),
          type: "checkbox",
        },
      ],
    },
    {
      fieldArray: true,
      name: "contacts",
      initialValues: contactIntialValues,
      heading: t("forms.headings.contacts", { defaultValue: "Contacts" }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.fullName", {
            defaultValue: "Full Name",
          }),
        },
        {
          name: "email",
          label: t("forms.labels.email", { defaultValue: "Email" }),
          isRequired: false,
          placeholder: t("forms.placeholders.email", { defaultValue: "Email" }),
        },
        {
          name: "phone",
          label: t("forms.labels.phone", { defaultValue: "Phone" }),
          isRequired: false,
          placeholder: t("forms.placeholders.phone", { defaultValue: "Phone" }),
        },
        {
          name: "position",
          label: t("forms.labels.position", { defaultValue: "Position" }),
          isRequired: false,
          placeholder: t("forms.placeholders.position", {
            defaultValue: "Position",
          }),
        },
        {
          name: "active",
          isRequired: false,
          placeholder: t("forms.helperTexts.active", {
            defaultValue: "Active.",
          }),
          type: "checkbox",
        },
      ],
    },
  ],
});
