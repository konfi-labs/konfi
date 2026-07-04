import { FieldData, FormData, SelectOption } from "@konfi/types";
import type { TFunction } from "i18next";
import {
  createInvoiceRecipientFields,
  createShippingOptionAddressSections,
} from "./_helpers";
import { getProofingMethodOptions } from "../units-proofing";

function createCheckoutShippingAddressSections(t: TFunction) {
  return createShippingOptionAddressSections(t, {
    dependencyValues: ["DHL", "DPD", "FEDEX", "INPOST"],
    isDefaultExpanded: true,
    isRequired: false,
    copy: {
      shippingLabel: {
        key: "forms.labels.shippingAddress",
        defaultValue: "Shipping Address",
      },
      shippingPlaceholder: {
        key: "forms.placeholders.selectShippingAddress",
        defaultValue: "Select shipping address...",
      },
      namePlaceholder: {
        key: "forms.placeholders.likeHome",
        defaultValue: "e.g. Home",
      },
      streetLabel: { key: "forms.labels.street", defaultValue: "Address" },
      streetPlaceholder: {
        key: "forms.placeholders.streetAndNumber",
        defaultValue: "Street and number, apartment, unit",
      },
      zipLabel: {
        key: "forms.labels.postalCode",
        defaultValue: "Postal Code",
      },
      zipPlaceholder: {
        key: "forms.placeholders.postalCode",
        defaultValue: "Postal Code",
      },
      savePlaceholder: {
        key: "forms.placeholders.saveAddress",
        defaultValue: "Save address",
      },
    },
    locker: {
      heading: {
        key: "forms.headings.postalCodeMachine",
        defaultValue: "Postal Code Machine",
      },
      label: {
        key: "forms.labels.chooseParcelLocker",
        defaultValue: "Choose parcel locker",
      },
      dependencyValue: "PACZKOMATY_INPOST",
      isDefaultExpanded: true,
    },
    personalCollection: {
      dependencyValue: "PERSONAL_COLLECTION",
      isDefaultExpanded: true,
      isRequired: false,
      shippingLabel: {
        key: "forms.labels.shippingAddress",
        defaultValue: "Shipping Address",
      },
      shippingPlaceholder: {
        key: "forms.placeholders.selectShippingAddress",
        defaultValue: "Select shipping address...",
      },
    },
  });
}

export const checkoutForm = (
  t: TFunction,
  proofingMethodOptions: SelectOption[] = getProofingMethodOptions(null, t),
  options: {
    invoiceEnabled?: boolean;
  } = {},
): FormData => {
  const invoiceEnabled = options.invoiceEnabled !== false;
  const basicInformationFields: FieldData[] = [
    {
      name: "contact.name",
      label: t("forms.labels.fullName", { defaultValue: "Full Name" }),
      isRequired: true,
      placeholder: t("forms.placeholders.janKowalski", {
        defaultValue: "John Smith",
      }),
      autocomplete: "name",
    },
    {
      name: "contact.email",
      label: t("forms.labels.email", { defaultValue: "Email" }),
      isRequired: true,
      placeholder: t("forms.placeholders.nameDomainPl", {
        defaultValue: "name@domain.com",
      }),
      autocomplete: "email",
    },
    {
      name: "contact.phone",
      label: t("forms.labels.phone", { defaultValue: "Phone" }),
      isRequired: true,
      placeholder: t("forms.placeholders.phone", {
        defaultValue: "123456789",
      }),
      autocomplete: "tel-national",
    },
  ];

  if (invoiceEnabled) {
    basicInformationFields.push({
      name: "invoice",
      isRequired: false,
      placeholder: t("forms.placeholders.wantInvoice", {
        defaultValue: "I want to receive an invoice",
      }),
      type: "checkbox",
    });
  }

  const fileVerificationFields: FieldData[] = [
    {
      name: "proofing",
      label: t("forms.labels.fileVerification", {
        defaultValue: "File Verification",
      }),
      isRequired: true,
      placeholder: t("forms.placeholders.verification", {
        defaultValue: "File Verification",
      }),
      type: "radio",
      options: proofingMethodOptions,
      enumName: "ProofingOptions",
    },
    {
      name: "specialNotes",
      label: t("forms.labels.notes", { defaultValue: "Notes" }),
      isRequired: false,
      placeholder: t("forms.placeholders.notes", { defaultValue: "Notes" }),
      type: "textarea",
    },
  ];

  if (invoiceEnabled) {
    fileVerificationFields.push({
      name: "invoiceNotes",
      label: t("forms.labels.invoiceNotes", {
        defaultValue: "Invoice notes",
        ns: "translation",
      }),
      helperText: t("forms.helperTexts.invoiceNotes", {
        defaultValue: "These notes will be visible on the invoice.",
        ns: "translation",
      }),
      isRequired: false,
      placeholder: t("forms.placeholders.invoiceNotes", {
        defaultValue: "Notes visible on the invoice",
        ns: "translation",
      }),
      type: "textarea",
    });
  }

  const sections: FormData["sections"] = [
    {
      fieldArray: false,
      heading: t("forms.headings.basicInformation", {
        defaultValue: "Basic Information",
      }),
      isDefaultExpanded: true,
      fields: basicInformationFields,
    },
  ];

  if (invoiceEnabled) {
    const companyDataFields: FieldData[] = [
      {
        name: "billing",
        label: t("forms.labels.billingAddress", {
          defaultValue: "Billing Address",
        }),
        placeholder: t("forms.placeholders.selectBillingAddress", {
          defaultValue: "Select billing address...",
        }),
        isRequired: false,
        type: "radioGrid",
        isObject: true,
        optionsKey: "billingAddresses",
      },
      {
        name: "billing.name",
        label: t("forms.labels.name", { defaultValue: "Name" }),
        isRequired: false,
        placeholder: t("forms.placeholders.likeCompany", {
          defaultValue: "e.g. Company",
        }),
        autocomplete: "billing name",
        watch: true,
      },
      {
        name: "billing.companyName",
        label: t("forms.labels.companyName", {
          defaultValue: "Company Name",
        }),
        isRequired: true,
        placeholder: t("forms.placeholders.companyName", {
          defaultValue: "Company Name",
        }),
        autocomplete: "billing organization",
        watch: true,
      },
      {
        name: "billing.nip",
        label: t("forms.labels.nip", { defaultValue: "Tax ID" }),
        isRequired: true,
        placeholder: t("forms.placeholders.taxId", {
          defaultValue: "Tax ID",
        }),
        autocomplete: "billing vat",
        watch: true,
      },
      {
        name: "billing.street",
        label: t("forms.labels.street", { defaultValue: "Address" }),
        isRequired: true,
        placeholder: t("forms.placeholders.streetAndNumber", {
          defaultValue: "Street and number, apartment, unit",
        }),
        autocomplete: "billing street-address",
        type: "addressAutocomplete",
        watch: true,
      },
      {
        name: "billing.zip",
        label: t("forms.labels.postalCode", {
          defaultValue: "Postal Code",
        }),
        isRequired: true,
        placeholder: t("forms.placeholders.postalCode", {
          defaultValue: "Postal Code",
        }),
        autocomplete: "billing postal-code",
        watch: true,
      },
      {
        name: "billing.city",
        label: t("forms.labels.city", { defaultValue: "City" }),
        isRequired: true,
        placeholder: t("forms.placeholders.city", {
          defaultValue: "City",
        }),
        autocomplete: "billing address-level2",
        watch: true,
      },
      ...createInvoiceRecipientFields(t, { prefix: "billing" }),
      {
        name: "saveBillingAddress",
        isRequired: false,
        placeholder: t("forms.placeholders.saveAddress", {
          defaultValue: "Save address",
        }),
        type: "checkbox",
      },
    ];

    sections.push({
      fieldArray: false,
      heading: t("forms.headings.companyData", {
        defaultValue: "Company Data",
      }),
      isDefaultExpanded: true,
      dependencyValue: "true",
      dependsOn: "invoice",
      fields: companyDataFields,
    });
  }

  sections.push(...createCheckoutShippingAddressSections(t));
  sections.push({
    fieldArray: false,
    heading: t("forms.headings.fileVerification", {
      defaultValue: "File Verification",
    }),
    isDefaultExpanded: true,
    fields: fileVerificationFields,
  });

  return {
    allowMultiple: true,
    allowToggle: true,
    sections,
  };
};
