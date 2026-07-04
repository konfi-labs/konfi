import {

  AddressTypeEnum,
  Contact,
  enumToSearchOptions,
  FormData,
  NotificationType,
  SelectOption,
  ShippingOptionsAsOptions,
} from "@konfi/types";
import type { TFunction } from "i18next";

export const memberForm = (
  channelIdsOptions: SelectOption[],
  t: TFunction,
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
          label: t("forms.labels.fullName", { defaultValue: "Full Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.janKowalski", {
            defaultValue: "John Smith",
          }),
          updateDisabled: true,
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
          placeholder: t("forms.placeholders.phone", {
            defaultValue: "123456789",
          }),
        },
        {
          name: "channelIds",
          label: t("forms.labels.channels", { defaultValue: "Channels" }),
          isRequired: false,
          placeholder: t("forms.placeholders.selectChannels", {
            defaultValue: "Select channels...",
          }),
          type: "multiSelect",
          options: channelIdsOptions,
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.headings.notificationSettings", {
        defaultValue: "Notification Settings",
      }),
      isDefaultExpanded: false,
      fields: Object.values(NotificationType).flatMap((type) => [
        {
          name: `notifications.${type}.enabled`,
          label: t(`NotificationType.${type}`),
          isRequired: false,
          type: "checkbox",
        },
        {
          name: `notifications.${type}.email`,
          label: t(`forms.labels.email`),
          isRequired: false,
          placeholder: t("forms.placeholders.email", {
            defaultValue: "notifications@example.com",
          }),
        },
      ]),
    },
  ],
});

export const warehouseForm = (t: TFunction): FormData => ({
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
          updateDisabled: true,
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.headings.address", { defaultValue: "Address" }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "address.name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.home", { defaultValue: "Home" }),
        },
        {
          name: "address.type",
          isRequired: true,
          placeholder: t("forms.placeholders.selectAddressType", {
            defaultValue: "Select address type...",
          }),
          type: "select",
          options: enumToSearchOptions(AddressTypeEnum),
          enumName: "AddressTypeEnum",
        },
        {
          name: "address.street",
          label: t("forms.labels.street", { defaultValue: "Street" }),
          isRequired: false,
          placeholder: t("forms.placeholders.exampleStreet", {
            defaultValue: "Example",
          }),
        },
        {
          name: "address.zip",
          label: t("forms.labels.postalCode", { defaultValue: "Postal Code" }),
          isRequired: false,
          placeholder: t("forms.placeholders.postalCode", {
            defaultValue: "00-000",
          }),
          autocomplete: "postal-code",
        },
        {
          name: "address.city",
          label: t("forms.labels.city", { defaultValue: "City" }),
          isRequired: false,
          placeholder: t("forms.placeholders.warsaw", {
            defaultValue: "Warsaw",
          }),
        },
        {
          name: "address.country",
          label: t("forms.labels.country", { defaultValue: "Country" }),
          isRequired: false,
          placeholder: t("forms.placeholders.poland", {
            defaultValue: "Poland",
          }),
        },
        {
          name: "address.active",
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
      initialValues: {
        name: "",
        email: "",
        phone: "",
        active: false,
      } as Contact,
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

export const designatedPickupAreaForm = (t: TFunction): FormData => ({
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
          placeholder: t("forms.placeholders.pickupAreaName", {
            defaultValue: "e.g., A1-R2, Loading Dock B",
          }),
          updateDisabled: true,
        },
        {
          name: "description",
          label: t("forms.labels.description", { defaultValue: "Description" }),
          isRequired: false,
          placeholder: t("forms.placeholders.pickupAreaDescription", {
            defaultValue: "Optional description for this pickup area",
          }),
          type: "textarea",
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.headings.shippingConfiguration", {
        defaultValue: "Shipping Configuration",
      }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "shippingOptions",
          label: t("forms.labels.supportedShippingOptions", {
            defaultValue: "Supported Shipping Options",
          }),
          isRequired: false,
          placeholder: t("forms.placeholders.selectShippingOptions", {
            defaultValue: "Select shipping options...",
          }),
          type: "multiSelect",
          options: ShippingOptionsAsOptions,
          enumName: "ShippingOptions",
        },
      ],
    },
  ],
});
export const b2bForm = (t: TFunction): FormData => ({
  allowMultiple: false,
  allowToggle: false,
  sections: [
    {
      fieldArray: false,
      heading: t("forms.headings.businessInformation", {
        defaultValue: "Business Information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "businessDescription",
          label: t("forms.b2b.labels.businessDescription", {
            defaultValue: "Business Description",
          }),
          isRequired: true,
          placeholder: t("forms.b2b.placeholders.min_150Max_500Chars", {
            defaultValue: "min. 150 characters, max. 500 characters",
          }),
          type: "textarea",
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.headings.billingAddress", {
        defaultValue: "Billing Address",
      }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "billing.companyName",
          label: t("forms.b2b.labels.companyName", {
            defaultValue: "Company Name",
          }),
          isRequired: true,
          placeholder: t("forms.b2b.placeholders.companyName", {
            defaultValue: "Company name",
          }),
          autocomplete: "billing organization",
          watch: true,
        },
        {
          name: "billing.nip",
          label: t("forms.b2b.labels.nip", { defaultValue: "NIP (Tax ID)" }),
          isRequired: true,
          placeholder: t("forms.b2b.placeholders.nip", { defaultValue: "NIP" }),
          autocomplete: "billing vat",
          watch: true,
        },
        {
          name: "billing.street",
          label: t("forms.b2b.labels.street", { defaultValue: "Street" }),
          isRequired: true,
          placeholder: t("forms.b2b.placeholders.street", {
            defaultValue: "Street",
          }),
          autocomplete: "billing street-address",
          type: "addressAutocomplete",
          watch: true,
        },
        {
          name: "billing.zip",
          label: t("forms.b2b.labels.postalCode", {
            defaultValue: "Postal Code",
          }),
          isRequired: true,
          placeholder: t("forms.b2b.placeholders.postalCode", {
            defaultValue: "Postal code",
          }),
          autocomplete: "billing postal-code",
          watch: true,
        },
        {
          name: "billing.city",
          label: t("forms.b2b.labels.city", { defaultValue: "City" }),
          isRequired: true,
          placeholder: t("forms.b2b.placeholders.city", {
            defaultValue: "City",
          }),
          autocomplete: "billing address-level2",
          watch: true,
        },
      ],
    },
  ],
});
