import {
  Discount,
  FormData,
  OrderItem,
  PaymentStatusAsOptions,
  SelectOption,
  ShippingOptionsAsOptions,
  ShippingOptionsAsOptionsOnlyCouriers,
  Unit,
} from "@konfi/types";
import type { TFunction } from "i18next";
import {
  createInvoiceRecipientFields,
  createShippingOptionAddressSections,
} from "./_helpers";
import {
  getOrderFileStatusOptions,
  getOrderWorkflowStatusOptions,
} from "../order-workflow-statuses";
import { getPaymentMethodOptions } from "../payment-methods";
import { getPrintingMethodOptions } from "../printing-methods";
import { getShippingMethodOptions } from "../shipping-methods";

function createOrderShippingAddressSections(t: TFunction) {
  return createShippingOptionAddressSections(t, {
    dependencyValues: [
      "CUSTOM",
      "COMPANY_COURIER",
      "DHL",
      "DPD",
      "FEDEX",
      "INPOST",
    ],
    isDefaultExpanded: false,
    isRequired: true,
    copy: {
      shippingLabel: {
        key: "forms.labels.deliveryAddress",
        defaultValue: "Delivery Address",
      },
      shippingPlaceholder: {
        key: "forms.placeholders.selectDeliveryAddress",
        defaultValue: "Select delivery address...",
      },
      namePlaceholder: {
        key: "forms.placeholders.name",
        defaultValue: "e.g. House",
      },
      streetLabel: { key: "forms.labels.street", defaultValue: "Street" },
      streetPlaceholder: {
        key: "forms.placeholders.street",
        defaultValue: "Street",
      },
      zipLabel: { key: "forms.labels.zip", defaultValue: "Postal Code" },
      zipPlaceholder: {
        key: "forms.placeholders.zip",
        defaultValue: "Postal Code",
      },
      savePlaceholder: {
        key: "forms.placeholders.saveShippingAddress",
        defaultValue: "Save address",
      },
    },
    locker: {
      heading: { key: "forms.headings.locker", defaultValue: "Paczkomat" },
      label: { key: "forms.labels.locker", defaultValue: "Choose locker" },
      dependencyValue: "PACZKOMATY_INPOST",
      isDefaultExpanded: false,
    },
    personalCollection: {
      dependencyValue: "PERSONAL_COLLECTION",
      isDefaultExpanded: false,
      isRequired: true,
      shippingLabel: {
        key: "forms.labels.deliveryAddress",
        defaultValue: "Delivery Address",
      },
      shippingPlaceholder: {
        key: "forms.placeholders.selectDeliveryAddress",
        defaultValue: "Select delivery address...",
      },
    },
  });
}

export const trackingForm = (t: TFunction): FormData => ({
  allowMultiple: true,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: t("forms.headings.tracking", {
        defaultValue: "Package Tracking",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "number",
          label: t("forms.labels.trackingNumber", {
            defaultValue: "Tracking Number",
          }),
          isRequired: true,
          placeholder: t("forms.placeholders.trackingNumber", {
            defaultValue: "0000000000",
          }),
        },
        {
          name: "shippingOption",
          label: t("forms.labels.delivery", { defaultValue: "Delivery" }),
          isRequired: true,
          placeholder: t("forms.placeholders.selectDelivery", {
            defaultValue: "Select delivery option...",
          }),
          type: "select",
          options: ShippingOptionsAsOptionsOnlyCouriers,
          enumName: "ShippingOptions",
        },
        {
          name: "link",
          label: t("forms.labels.link", { defaultValue: "Link" }),
          isRequired: true,
          placeholder: t("forms.placeholders.link", {
            defaultValue:
              "https://www.dhl.com/en/express/tracking.html?AWB=0000000000",
          }),
        },
      ],
    },
  ],
});

export const orderItemInitialValues: OrderItem = {
  id: "",
  product: null,
  combination: "",
  name: "",
  description: "",
  volume: 0,
  customFormat: false,
  totalPrice: 0,
  customPrice: 0,
  width: 0,
  height: 0,
  quantity: 1,
  discount: new Discount().object,
  unit: Unit.PCS,
};

const hasOrderItemTextValue = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

const hasOrderItemPositiveNumberValue = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const hasOrderItemArrayValue = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0;

const hasOrderItemProductValue = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const product = value as { id?: unknown; name?: unknown };
  return (
    hasOrderItemTextValue(product.id) || hasOrderItemTextValue(product.name)
  );
};

const hasOrderItemObjectValue = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).some((fieldValue) => {
    if (hasOrderItemTextValue(fieldValue)) {
      return true;
    }

    if (hasOrderItemPositiveNumberValue(fieldValue)) {
      return true;
    }

    if (hasOrderItemArrayValue(fieldValue)) {
      return true;
    }

    return Boolean(fieldValue) && typeof fieldValue === "object";
  });
};

export const isEmptyOrderItem = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as Partial<OrderItem> & {
    carriedOutBy?: unknown;
  };
  return !(
    hasOrderItemTextValue(item.id) ||
    hasOrderItemTextValue(item.name) ||
    hasOrderItemTextValue(item.description) ||
    hasOrderItemTextValue(item.combination) ||
    hasOrderItemTextValue(item.calculatedCombination) ||
    hasOrderItemTextValue(item.warehouseId) ||
    hasOrderItemProductValue(item.product) ||
    hasOrderItemPositiveNumberValue(item.volume) ||
    hasOrderItemPositiveNumberValue(item.pageCount) ||
    hasOrderItemPositiveNumberValue(item.width) ||
    hasOrderItemPositiveNumberValue(item.height) ||
    hasOrderItemPositiveNumberValue(item.totalPrice) ||
    hasOrderItemPositiveNumberValue(item.customPrice) ||
    (item.quantity !== undefined && item.quantity !== 1) ||
    item.customFormat === true ||
    hasOrderItemArrayValue(item.customSizes) ||
    hasOrderItemArrayValue(item.carriedOutBy) ||
    hasOrderItemObjectValue(item.preview) ||
    hasOrderItemObjectValue(item.advancedAttributeSelections)
  );
};

export const stripEmptyOrderItems = <T extends { items?: unknown }>(
  data: T,
): T => {
  if (!Array.isArray(data.items)) {
    return data;
  }

  return {
    ...data,
    items: data.items.filter((item) => !isEmptyOrderItem(item)),
  };
};

const getOrderFormCdnBaseUrl = (): string | undefined => {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL?.trim().replace(/\/+$/, "");

  if (!cdnUrl) {
    return undefined;
  }

  if (cdnUrl.startsWith("http://") || cdnUrl.startsWith("https://")) {
    return cdnUrl;
  }

  return `https://${cdnUrl}`;
};

const getOrderFormCdnImageTemplate = (folder: string): string | undefined => {
  const cdnBaseUrl = getOrderFormCdnBaseUrl();

  if (!cdnBaseUrl) {
    return undefined;
  }

  return `${cdnBaseUrl}/${folder}/${"${value}"}.png?fit=max&auto=format`;
};

export const orderForm = (
  carriedOutByOptions: SelectOption[],
  designatedPickupAreasOptions: SelectOption[],
  availablePaymentTypes: string[],
  t: TFunction,
  printingMethodOptions: SelectOption[] = getPrintingMethodOptions(null, t),
  shippingMethodOptions: SelectOption[] = getShippingMethodOptions(null, {}, t),
  paymentMethodOptions: SelectOption[] = getPaymentMethodOptions(null, t),
  orderStatusOptions: SelectOption[] = getOrderWorkflowStatusOptions(null, t),
  fileStatusOptions: SelectOption[] = getOrderFileStatusOptions(null, t),
) => {
  const orderFormData: FormData = {
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
            name: "customer",
            label: t("forms.labels.customer", { defaultValue: "Customer" }),
            placeholder: t("forms.placeholders.search", {
              defaultValue: "Search...",
            }),
            type: "search",
            searchFor: "customers",
            searchResult: "object",
            isCreatable: true,
            isObject: true,
            noFilter: true,
          },
          {
            name: "saveCustomer",
            isRequired: false,
            placeholder: t("forms.placeholders.saveAsNewCustomer", {
              defaultValue: "Save as new customer",
            }),
            type: "checkbox",
          },
          {
            name: "invoice",
            type: "checkbox",
            placeholder: t("forms.labels.invoice", { defaultValue: "Invoice" }),
            isRequired: false,
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.billingAddress", {
          defaultValue: "Billing Address",
        }),
        isDefaultExpanded: false,
        dependencyValue: "true",
        dependsOn: "invoice",
        fields: [
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
            placeholder: t("forms.placeholders.name", {
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
              defaultValue: "e.g. Company",
            }),
            autocomplete: "billing organization",
            watch: true,
          },
          {
            name: "billing.nip",
            label: t("forms.labels.nip", { defaultValue: "NIP" }),
            isRequired: true,
            placeholder: t("forms.placeholders.nip", { defaultValue: "NIP" }),
            autocomplete: "billing vat",
            watch: true,
            getCustomerDataModal: true,
          },
          {
            name: "billing.street",
            label: t("forms.labels.street", { defaultValue: "Street" }),
            isRequired: true,
            placeholder: t("forms.placeholders.street", {
              defaultValue: "Street",
            }),
            autocomplete: "billing street-address",
            type: "addressAutocomplete",
            watch: true,
          },
          {
            name: "billing.zip",
            label: t("forms.labels.zip", { defaultValue: "Postal Code" }),
            isRequired: true,
            placeholder: t("forms.placeholders.zip", {
              defaultValue: "Postal Code",
            }),
            autocomplete: "billing postal-code",
            watch: true,
          },
          {
            name: "billing.city",
            label: t("forms.labels.city", { defaultValue: "City" }),
            isRequired: true,
            placeholder: t("forms.placeholders.city", { defaultValue: "City" }),
            autocomplete: "billing address-level2",
            watch: true,
          },
          ...createInvoiceRecipientFields(t, { prefix: "billing" }),
          {
            name: "saveBillingAddress",
            isRequired: false,
            placeholder: t("forms.placeholders.saveAsNewBillingAddress", {
              defaultValue: "Save as new billing address",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.contact", { defaultValue: "Contact" }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "contact",
            label: t("forms.labels.contact", { defaultValue: "Contact" }),
            placeholder: t("forms.placeholders.selectContact", {
              defaultValue: "Select contact...",
            }),
            isRequired: false,
            type: "radioGrid",
            isObject: true,
            optionsKey: "contacts",
          },
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
            isRequired: false,
            placeholder: t("forms.placeholders.nameDomainPl", {
              defaultValue: "name@domain.com",
            }),
            autocomplete: "email",
          },
          {
            name: "sendStatusChangeEmail",
            isRequired: false,
            placeholder: t("forms.placeholders.sendStatusChangeEmail", {
              defaultValue: "Send status change emails",
            }),
            type: "checkbox",
          },
          {
            name: "contact.phone",
            label: t("forms.labels.phone", { defaultValue: "Phone" }),
            isRequired: false,
            placeholder: t("forms.placeholders.phone", {
              defaultValue: "123456789",
            }),
            autocomplete: "tel-national",
          },
          {
            name: "saveContact",
            isRequired: false,
            placeholder: t("forms.placeholders.saveAsNewContact", {
              defaultValue: "Save as new contact",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: true,
        name: "items",
        initialValues: orderItemInitialValues,
        heading: t("forms.headings.products", { defaultValue: "Products" }),
        isDefaultExpanded: true,
        stackDirection: "column",
        fields: [
          {
            name: "product",
            label: t("forms.labels.product", { defaultValue: "Product" }),
            isRequired: true,
            placeholder: t("forms.placeholders.search", {
              defaultValue: "Search...",
            }),
            type: "groupedIndexedSearch",
            searchFor: "products",
            searchResult: "object",
            isObject: true,
            dependsOn: "customer",
          },
          { name: "combination", combination: true },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.deadlineAndOther", {
          defaultValue: "Deadline and other",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "exactTime",
            placeholder: t("forms.placeholders.exactTime", {
              defaultValue: "Exact time of realization",
            }),
            isRequired: false,
            type: "checkbox",
          },
          {
            name: "deadlineString",
            label: t("forms.labels.deadline", { defaultValue: "Deadline" }),
            helperText: t("forms.placeholders.deadline", {
              defaultValue: "Date by which the order must be completed.",
            }),
            isRequired: true,
            placeholder: "",
            type: "date",
            dependencyValue: "false",
            dependsOn: "exactTime",
          },
          {
            name: "deadlineString",
            label: t("forms.labels.deadline", { defaultValue: "Deadline" }),
            helperText: t("forms.placeholders.deadline", {
              defaultValue: "Date by which the order must be completed.",
            }),
            isRequired: true,
            placeholder: "",
            type: "datetime-local",
            dependencyValue: "true",
            dependsOn: "exactTime",
          },
          {
            name: "specialNotes",
            isRequired: false,
            placeholder: t("forms.placeholders.notes", {
              defaultValue: "Notes",
            }),
            type: "textarea",
          },
          {
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
          },
          {
            name: "mailLink",
            label: t("forms.labels.mailLink", { defaultValue: "Mail Link" }),
            isRequired: false,
            placeholder: t("forms.placeholders.mailLink", {
              defaultValue: "https://mail.example.com/message/123",
            }),
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.shippingType", {
          defaultValue: "Shipping Type",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "shippingOption",
            label: t("forms.labels.delivery", { defaultValue: "Delivery" }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectDelivery", {
              defaultValue: "Select delivery option...",
            }),
            type: "radioGrid",
            options: shippingMethodOptions,
            enumName: "ShippingOptions",
            gridColumns: [1, 1, 3],
            showImages: true,
            imageUrlTemplate: getOrderFormCdnImageTemplate("shippingOptions"),
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.address", { defaultValue: "Address" }),
        isDefaultExpanded: false,
        dependencyValue: "CUSTOM",
        dependsOn: "shippingOption",
        fields: [
          {
            name: "shipping",
            label: t("forms.labels.deliveryAddress", {
              defaultValue: "Delivery Address",
            }),
            placeholder: t("forms.placeholders.selectDeliveryAddress", {
              defaultValue: "Select delivery address...",
            }),
            isRequired: true,
            type: "radioGrid",
            isObject: true,
            optionsKey: "shippingAddresses",
          },
          {
            name: "shipping.name",
            label: t("forms.labels.name", { defaultValue: "Name" }),
            isRequired: false,
            placeholder: t("forms.placeholders.name", {
              defaultValue: "e.g. House",
            }),
            autocomplete: "shipping name",
            watch: true,
          },
          {
            name: "shipping.street",
            label: t("forms.labels.street", { defaultValue: "Street" }),
            isRequired: true,
            placeholder: t("forms.placeholders.street", {
              defaultValue: "Street",
            }),
            autocomplete: "shipping street-address",
            type: "addressAutocomplete",
            watch: true,
          },
          {
            name: "shipping.zip",
            label: t("forms.labels.zip", { defaultValue: "Postal Code" }),
            isRequired: true,
            placeholder: t("forms.placeholders.zip", {
              defaultValue: "Postal Code",
            }),
            autocomplete: "shipping postal-code",
            watch: true,
          },
          {
            name: "shipping.city",
            label: t("forms.labels.city", { defaultValue: "City" }),
            isRequired: true,
            placeholder: t("forms.placeholders.city", { defaultValue: "City" }),
            autocomplete: "shipping address-level2",
            watch: true,
          },
          {
            name: "saveShippingAddress",
            isRequired: false,
            placeholder: t("forms.placeholders.saveShippingAddress", {
              defaultValue: "Save address",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.address", { defaultValue: "Address" }),
        isDefaultExpanded: false,
        dependencyValue: "COMPANY_COURIER",
        dependsOn: "shippingOption",
        fields: [
          {
            name: "shipping",
            label: t("forms.labels.deliveryAddress", {
              defaultValue: "Delivery Address",
            }),
            placeholder: t("forms.placeholders.selectDeliveryAddress", {
              defaultValue: "Select delivery address...",
            }),
            isRequired: true,
            type: "radioGrid",
            isObject: true,
            optionsKey: "shippingAddresses",
          },
          {
            name: "shipping.name",
            label: t("forms.labels.name", { defaultValue: "Name" }),
            isRequired: false,
            placeholder: t("forms.placeholders.name", {
              defaultValue: "e.g. House",
            }),
            autocomplete: "shipping name",
            watch: true,
          },
          {
            name: "shipping.street",
            label: t("forms.labels.street", { defaultValue: "Street" }),
            isRequired: true,
            placeholder: t("forms.placeholders.street", {
              defaultValue: "Street",
            }),
            autocomplete: "shipping street-address",
            type: "addressAutocomplete",
            watch: true,
          },
          {
            name: "shipping.zip",
            label: t("forms.labels.zip", { defaultValue: "Postal Code" }),
            isRequired: true,
            placeholder: t("forms.placeholders.zip", {
              defaultValue: "Postal Code",
            }),
            autocomplete: "shipping postal-code",
            watch: true,
          },
          {
            name: "shipping.city",
            label: t("forms.labels.city", { defaultValue: "City" }),
            isRequired: true,
            placeholder: t("forms.placeholders.city", { defaultValue: "City" }),
            autocomplete: "shipping address-level2",
            watch: true,
          },
          {
            name: "saveShippingAddress",
            isRequired: false,
            placeholder: t("forms.placeholders.saveShippingAddress", {
              defaultValue: "Save address",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.address", { defaultValue: "Address" }),
        isDefaultExpanded: false,
        dependencyValue: "DHL",
        dependsOn: "shippingOption",
        fields: [
          {
            name: "shipping",
            label: t("forms.labels.deliveryAddress", {
              defaultValue: "Delivery Address",
            }),
            placeholder: t("forms.placeholders.selectDeliveryAddress", {
              defaultValue: "Select delivery address...",
            }),
            isRequired: true,
            type: "radioGrid",
            isObject: true,
            optionsKey: "shippingAddresses",
          },
          {
            name: "shipping.name",
            label: t("forms.labels.name", { defaultValue: "Name" }),
            isRequired: false,
            placeholder: t("forms.placeholders.name", {
              defaultValue: "e.g. House",
            }),
            autocomplete: "shipping name",
            watch: true,
          },
          {
            name: "shipping.street",
            label: t("forms.labels.street", { defaultValue: "Street" }),
            isRequired: true,
            placeholder: t("forms.placeholders.street", {
              defaultValue: "Street",
            }),
            autocomplete: "shipping street-address",
            type: "addressAutocomplete",
            watch: true,
          },
          {
            name: "shipping.zip",
            label: t("forms.labels.zip", { defaultValue: "Postal Code" }),
            isRequired: true,
            placeholder: t("forms.placeholders.zip", {
              defaultValue: "Postal Code",
            }),
            autocomplete: "shipping postal-code",
            watch: true,
          },
          {
            name: "shipping.city",
            label: t("forms.labels.city", { defaultValue: "City" }),
            isRequired: true,
            placeholder: t("forms.placeholders.city", { defaultValue: "City" }),
            autocomplete: "shipping address-level2",
            watch: true,
          },
          {
            name: "saveShippingAddress",
            isRequired: false,
            placeholder: t("forms.placeholders.saveShippingAddress", {
              defaultValue: "Save address",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.address", { defaultValue: "Address" }),
        isDefaultExpanded: false,
        dependencyValue: "DPD",
        dependsOn: "shippingOption",
        fields: [
          {
            name: "shipping",
            label: t("forms.labels.deliveryAddress", {
              defaultValue: "Delivery Address",
            }),
            placeholder: t("forms.placeholders.selectDeliveryAddress", {
              defaultValue: "Select delivery address...",
            }),
            isRequired: true,
            type: "radioGrid",
            isObject: true,
            optionsKey: "shippingAddresses",
          },
          {
            name: "shipping.name",
            label: t("forms.labels.name", { defaultValue: "Name" }),
            isRequired: false,
            placeholder: t("forms.placeholders.name", {
              defaultValue: "e.g. House",
            }),
            autocomplete: "shipping name",
            watch: true,
          },
          {
            name: "shipping.street",
            label: t("forms.labels.street", { defaultValue: "Street" }),
            isRequired: true,
            placeholder: t("forms.placeholders.street", {
              defaultValue: "Street",
            }),
            autocomplete: "shipping street-address",
            type: "addressAutocomplete",
            watch: true,
          },
          {
            name: "shipping.zip",
            label: t("forms.labels.zip", { defaultValue: "Postal Code" }),
            isRequired: true,
            placeholder: t("forms.placeholders.zip", {
              defaultValue: "Postal Code",
            }),
            autocomplete: "shipping postal-code",
            watch: true,
          },
          {
            name: "shipping.city",
            label: t("forms.labels.city", { defaultValue: "City" }),
            isRequired: true,
            placeholder: t("forms.placeholders.city", { defaultValue: "City" }),
            autocomplete: "shipping address-level2",
            watch: true,
          },
          {
            name: "saveShippingAddress",
            isRequired: false,
            placeholder: t("forms.placeholders.saveShippingAddress", {
              defaultValue: "Save address",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.address", { defaultValue: "Address" }),
        isDefaultExpanded: false,
        dependencyValue: "FEDEX",
        dependsOn: "shippingOption",
        fields: [
          {
            name: "shipping",
            label: t("forms.labels.deliveryAddress", {
              defaultValue: "Delivery Address",
            }),
            placeholder: t("forms.placeholders.selectDeliveryAddress", {
              defaultValue: "Select delivery address...",
            }),
            isRequired: true,
            type: "radioGrid",
            isObject: true,
            optionsKey: "shippingAddresses",
          },
          {
            name: "shipping.name",
            label: t("forms.labels.name", { defaultValue: "Name" }),
            isRequired: false,
            placeholder: t("forms.placeholders.name", {
              defaultValue: "e.g. House",
            }),
            autocomplete: "shipping name",
            watch: true,
          },
          {
            name: "shipping.street",
            label: t("forms.labels.street", { defaultValue: "Street" }),
            isRequired: true,
            placeholder: t("forms.placeholders.street", {
              defaultValue: "Street",
            }),
            autocomplete: "shipping street-address",
            type: "addressAutocomplete",
            watch: true,
          },
          {
            name: "shipping.zip",
            label: t("forms.labels.zip", { defaultValue: "Postal Code" }),
            isRequired: true,
            placeholder: t("forms.placeholders.zip", {
              defaultValue: "Postal Code",
            }),
            autocomplete: "shipping postal-code",
            watch: true,
          },
          {
            name: "shipping.city",
            label: t("forms.labels.city", { defaultValue: "City" }),
            isRequired: true,
            placeholder: t("forms.placeholders.city", { defaultValue: "City" }),
            autocomplete: "shipping address-level2",
            watch: true,
          },
          {
            name: "saveShippingAddress",
            isRequired: false,
            placeholder: t("forms.placeholders.saveShippingAddress", {
              defaultValue: "Save address",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.address", { defaultValue: "Address" }),
        isDefaultExpanded: false,
        dependencyValue: "INPOST",
        dependsOn: "shippingOption",
        fields: [
          {
            name: "shipping",
            label: t("forms.labels.deliveryAddress", {
              defaultValue: "Delivery Address",
            }),
            placeholder: t("forms.placeholders.selectDeliveryAddress", {
              defaultValue: "Select delivery address...",
            }),
            isRequired: true,
            type: "radioGrid",
            isObject: true,
            optionsKey: "shippingAddresses",
          },
          {
            name: "shipping.name",
            label: t("forms.labels.name", { defaultValue: "Name" }),
            isRequired: false,
            placeholder: t("forms.placeholders.name", {
              defaultValue: "e.g. House",
            }),
            autocomplete: "shipping name",
            watch: true,
          },
          {
            name: "shipping.street",
            label: t("forms.labels.street", { defaultValue: "Street" }),
            isRequired: true,
            placeholder: t("forms.placeholders.street", {
              defaultValue: "Street",
            }),
            autocomplete: "shipping street-address",
            type: "addressAutocomplete",
            watch: true,
          },
          {
            name: "shipping.zip",
            label: t("forms.labels.zip", { defaultValue: "Postal Code" }),
            isRequired: true,
            placeholder: t("forms.placeholders.zip", {
              defaultValue: "Postal Code",
            }),
            autocomplete: "shipping postal-code",
            watch: true,
          },
          {
            name: "shipping.city",
            label: t("forms.labels.city", { defaultValue: "City" }),
            isRequired: true,
            placeholder: t("forms.placeholders.city", { defaultValue: "City" }),
            autocomplete: "shipping address-level2",
            watch: true,
          },
          {
            name: "saveShippingAddress",
            isRequired: false,
            placeholder: t("forms.placeholders.saveShippingAddress", {
              defaultValue: "Save address",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.locker", { defaultValue: "Paczkomat" }),
        isDefaultExpanded: false,
        dependencyValue: "PACZKOMATY_INPOST",
        dependsOn: "shippingOption",
        fields: [
          {
            name: "shipping",
            label: t("forms.labels.locker", { defaultValue: "Choose locker" }),
            isRequired: true,
            type: "inpost-geowidget",
            watch: true,
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.address", { defaultValue: "Address" }),
        isDefaultExpanded: false,
        dependencyValue: "PERSONAL_COLLECTION",
        dependsOn: "shippingOption",
        fields: [
          {
            name: "shipping",
            label: t("forms.labels.deliveryAddress", {
              defaultValue: "Delivery Address",
            }),
            placeholder: t("forms.placeholders.selectDeliveryAddress", {
              defaultValue: "Select delivery address...",
            }),
            isRequired: true,
            type: "radioGrid",
            isObject: true,
            optionsKey: "shippingAddresses",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.paymentAndStatus", {
          defaultValue: "Payment and Status",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "status",
            label: t("forms.labels.status", { defaultValue: "Order Status" }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectStatus", {
              defaultValue: "Select order status...",
            }),
            type: "select",
            options: orderStatusOptions,
            enumName: "OrderStatus",
          },
          {
            name: "paymentType",
            label: t("forms.labels.paymentType", {
              defaultValue: "Payment Type",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectPaymentType", {
              defaultValue: "Select payment type...",
            }),
            type: "radioGrid",
            options: paymentMethodOptions.filter((option) =>
              availablePaymentTypes.includes(option.value),
            ),
            enumName: "PaymentType",
            gridColumns: [1, 1, 3],
            showImages: true,
            imageUrlTemplate: getOrderFormCdnImageTemplate("paymentTypes"),
          },
          {
            name: "paymentStatus",
            label: t("forms.labels.paymentStatus", {
              defaultValue: "Payment Status",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectPaymentStatus", {
              defaultValue: "Select payment status...",
            }),
            type: "select",
            options: PaymentStatusAsOptions,
            enumName: "PaymentStatus",
          },
          {
            name: "paymentDocumentId",
            label: t("forms.labels.paymentDocument", {
              defaultValue: "Payment Document",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.paymentDocument", {
              defaultValue: "F/0000/00/00",
            }),
          },
          {
            name: "filesStatus",
            label: t("forms.labels.filesStatus", {
              defaultValue: "Files Status",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectFilesStatus", {
              defaultValue: "Select files status...",
            }),
            type: "select",
            options: fileStatusOptions,
            enumName: "OrderFilesStatus",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.realization", {
          defaultValue: "Realization",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "printingMethods",
            label: t("forms.labels.printingMethods", {
              defaultValue: "Printing Methods",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectPrintingMethods", {
              defaultValue: "Select printing methods...",
            }),
            type: "multiSelect",
            options: printingMethodOptions,
            enumName: "PrintingMethod",
          },
          {
            name: "carriedOutBy",
            label: t("forms.labels.carriedOutBy", {
              defaultValue: "Carried Out By",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectCarriedOutBy", {
              defaultValue: "Select carried out by...",
            }),
            type: "multiSelect",
            options: carriedOutByOptions,
          },
          // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
          ...(process.env.NODE_ENV === "development"
            ? [
                {
                  name: "designatedPickupAreaId",
                  label: t("forms.labels.designatedPickupArea", {
                    defaultValue: "Designated Pickup Area",
                  }),
                  placeholder: t("forms.placeholders.selectPickupArea", {
                    defaultValue: "Select pickup area...",
                  }),
                  isRequired: false,
                  type: "select" as const,
                  options: designatedPickupAreasOptions,
                },
              ]
            : []),
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.additionalInformation", {
          defaultValue: "Additional Information",
        }),
        isDefaultExpanded: false,
        fields: [
          // {
          //   name: "difficulty",
          //   label: t("forms.labels.difficulty", { defaultValue: "Difficulty" }),
          //   helperText: t("forms.helperTexts.difficulty", { defaultValue: "Order difficulty on a scale from 1 to 10." }),
          //   isRequired: true,
          //   placeholder: t("forms.placeholders.difficulty", { defaultValue: "Difficulty from 1 to 10" }),
          //   type: "slider",
          //   min: 1,
          //   max: 10,
          // },
          {
            name: "priority",
            label: t("forms.labels.priority", { defaultValue: "Priority" }),
            helperText: t("forms.helperTexts.priority", {
              defaultValue: "Order priority on a scale from 1 to 3.",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.priority", {
              defaultValue: "Priority from 1 to 3",
            }),
            type: "slider",
            min: 1,
            max: 3,
          },
          {
            name: "isTest",
            isRequired: false,
            placeholder: t("forms.placeholders.isTest", {
              defaultValue: "Test order.",
            }),
            type: "checkbox",
            updateDisabled: true,
          },
          {
            name: "active",
            type: "checkbox",
            placeholder: t("forms.placeholders.active", {
              defaultValue: "Active",
            }),
            isRequired: false,
          },
        ],
      },
    ],
  };
  return orderFormData;
};

export const updateOrderForm = (
  carriedOutByOptions: SelectOption[],
  designatedPickupAreasOptions: SelectOption[],
  availablePaymentTypes: string[],
  t: TFunction,
  printingMethodOptions: SelectOption[] = getPrintingMethodOptions(null, t),
  shippingMethodOptions: SelectOption[] = getShippingMethodOptions(null, {}, t),
  paymentMethodOptions: SelectOption[] = getPaymentMethodOptions(null, t),
  orderStatusOptions: SelectOption[] = getOrderWorkflowStatusOptions(null, t),
  fileStatusOptions: SelectOption[] = getOrderFileStatusOptions(null, t),
) => {
  const updateOrderFormData: FormData = {
    allowMultiple: true,
    allowToggle: true,
    sections: orderForm(
      carriedOutByOptions,
      designatedPickupAreasOptions,
      availablePaymentTypes,
      t,
      printingMethodOptions,
      shippingMethodOptions,
      paymentMethodOptions,
      orderStatusOptions,
      fileStatusOptions,
    ).sections,
  };
  return updateOrderFormData;
};

export const updateOrderFormStore = (
  carriedOutByOptions: SelectOption[],
  t: TFunction,
  printingMethodOptions: SelectOption[] = getPrintingMethodOptions(null, t),
  shippingMethodOptions: SelectOption[] = getShippingMethodOptions(null, {}, t),
  orderStatusOptions: SelectOption[] = getOrderWorkflowStatusOptions(null, t),
  fileStatusOptions: SelectOption[] = getOrderFileStatusOptions(null, t),
) => {
  const updateOrderFormData: FormData = {
    allowMultiple: true,
    allowToggle: true,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.storeOrder.headings.deliveryDeadlineNotes", {
          defaultValue: "Delivery, Deadline and Notes",
        }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "deadlineString",
            label: t("forms.storeOrder.labels.deadline", {
              defaultValue: "Deadline",
            }),
            helperText: t("forms.storeOrder.helperTexts.deadline", {
              defaultValue: "Date by which the order should be executed.",
            }),
            isRequired: true,
            placeholder: "",
            type: "date",
          },
          {
            name: "specialNotes",
            isRequired: false,
            placeholder: t("forms.storeOrder.placeholders.notes", {
              defaultValue: "Notes",
            }),
            type: "textarea",
          },
          {
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
          },
          {
            name: "mailLink",
            label: t("forms.labels.mailLink", { defaultValue: "Mail Link" }),
            isRequired: false,
            placeholder: t("forms.placeholders.mailLink", {
              defaultValue: "https://mail.example.com/message/123",
            }),
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.address", { defaultValue: "Address" }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "shippingOption",
            label: t("forms.labels.delivery", { defaultValue: "Delivery" }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectDelivery", {
              defaultValue: "Select delivery option...",
            }),
            type: "radioGrid",
            options: shippingMethodOptions,
            enumName: "ShippingOptions",
            gridColumns: [1, 1, 3],
            showImages: true,
            imageUrlTemplate: getOrderFormCdnImageTemplate("shippingOptions"),
          },
        ],
      },
      ...createOrderShippingAddressSections(t),
      {
        fieldArray: false,
        heading: t("forms.storeOrder.headings.paymentAndStatuses", {
          defaultValue: "Payment and Statuses",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "status",
            label: t("forms.storeOrder.labels.orderStatus", {
              defaultValue: "Order Status",
            }),
            isRequired: true,
            placeholder: t("forms.storeOrder.placeholders.selectOrderStatus", {
              defaultValue: "Select order status...",
            }),
            type: "select",
            options: orderStatusOptions,
            enumName: "OrderStatus",
          },
          {
            name: "paymentStatus",
            label: t("forms.storeOrder.labels.paymentStatus", {
              defaultValue: "Payment Status",
            }),
            isRequired: true,
            placeholder: t(
              "forms.storeOrder.placeholders.selectPaymentStatus",
              { defaultValue: "Select payment status..." },
            ),
            type: "select",
            options: PaymentStatusAsOptions,
            enumName: "PaymentStatus",
          },
          {
            name: "paymentDocumentId",
            label: t("forms.storeOrder.labels.paymentDocument", {
              defaultValue: "Payment Document",
            }),
            isRequired: false,
            placeholder: t("forms.storeOrder.placeholders.paymentDocumentId", {
              defaultValue: "F/0000/00/00",
            }),
          },
          {
            name: "filesStatus",
            label: t("forms.storeOrder.labels.filesStatus", {
              defaultValue: "Files Status",
            }),
            isRequired: true,
            placeholder: t("forms.storeOrder.placeholders.selectFilesStatus", {
              defaultValue: "Select files status...",
            }),
            type: "select",
            options: fileStatusOptions,
            enumName: "OrderFilesStatus",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.storeOrder.headings.execution", {
          defaultValue: "Execution",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "printingMethods",
            label: t("forms.storeOrder.labels.executionDepartments", {
              defaultValue: "Execution Departments",
            }),
            isRequired: true,
            placeholder: t(
              "forms.storeOrder.placeholders.selectExecutionDepartments",
              { defaultValue: "Select execution departments..." },
            ),
            type: "multiSelect",
            options: printingMethodOptions,
            enumName: "PrintingMethod",
          },
          {
            name: "carriedOutBy",
            label: t("forms.storeOrder.labels.carriedOutBy", {
              defaultValue: "Carried Out By",
            }),
            isRequired: true,
            placeholder: t("forms.storeOrder.placeholders.selectCarriedOutBy", {
              defaultValue: "Select carried out by...",
            }),
            type: "multiSelect",
            options: carriedOutByOptions,
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.storeOrder.headings.additionalInformation", {
          defaultValue: "Additional Information",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "priority",
            label: t("forms.storeOrder.labels.priority", {
              defaultValue: "Priority",
            }),
            helperText: t("forms.storeOrder.helperTexts.priority", {
              defaultValue: "Order priority on a scale from 1 to 3.",
            }),
            isRequired: true,
            placeholder: t("forms.storeOrder.placeholders.priority_1To_3", {
              defaultValue: "Priority from 1 to 3",
            }),
            type: "slider",
            min: 1,
            max: 3,
          },
          {
            name: "active",
            type: "checkbox",
            placeholder: t("forms.storeOrder.placeholders.active", {
              defaultValue: "Active",
            }),
            isRequired: false,
          },
        ],
      },
    ],
  };
  return updateOrderFormData;
};

export const quoteForm = (t: TFunction): FormData => ({
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
          name: "customer",
          label: t("forms.labels.customer", { defaultValue: "Customer" }),
          placeholder: t("forms.placeholders.search", {
            defaultValue: "Search...",
          }),
          type: "search",
          searchFor: "customers",
          searchResult: "object",
          updateDisabled: true,
          isCreatable: true,
          isObject: true,
          noFilter: true,
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.headings.contact", { defaultValue: "Contact" }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "contact",
          label: t("forms.labels.contact", { defaultValue: "Contact" }),
          placeholder: t("forms.placeholders.selectContact", {
            defaultValue: "Select contact...",
          }),
          isRequired: false,
          type: "radioGrid",
          isObject: true,
          optionsKey: "contacts",
        },
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
          isRequired: false,
          placeholder: t("forms.placeholders.nameDomainPl", {
            defaultValue: "name@domain.com",
          }),
          autocomplete: "email",
        },
        {
          name: "contact.phone",
          label: t("forms.labels.phone", { defaultValue: "Phone" }),
          isRequired: false,
          placeholder: t("forms.placeholders.phone", {
            defaultValue: "123456789",
          }),
          autocomplete: "tel-national",
        },
      ],
    },
    orderForm([], [], [], t).sections[3],
    {
      fieldArray: false,
      heading: t("forms.headings.shippingNotes", {
        defaultValue: "Delivery and Notes",
      }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "shippingOption",
          label: t("forms.labels.shippingOption", {
            defaultValue: "Shipping Option",
          }),
          isRequired: true,
          placeholder: t("forms.placeholders.selectDelivery", {
            defaultValue: "Select delivery option...",
          }),
          type: "select",
          options: ShippingOptionsAsOptions,
          enumName: "ShippingOptions",
        },
        {
          name: "specialNotes",
          isRequired: false,
          placeholder: t("forms.placeholders.comments", {
            defaultValue: "Comments",
          }),
          type: "textarea",
        },
        {
          name: "mailLink",
          label: t("forms.labels.mailLink", { defaultValue: "Mail Link" }),
          isRequired: false,
          placeholder: t("forms.placeholders.mailLink", {
            defaultValue: "https://mail.example.com/message/123",
          }),
        },
      ],
    },
  ],
});

export const updateQuoteForm = (t: TFunction): FormData => ({
  ...quoteForm(t),
  sections: [
    {
      fieldArray: false,
      heading: t("forms.headings.basicInformation", {
        defaultValue: "Basic Information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "customer",
          label: t("forms.labels.customer", { defaultValue: "Customer" }),
          placeholder: t("forms.placeholders.search", {
            defaultValue: "Search...",
          }),
          type: "search",
          searchFor: "customers",
          searchResult: "object",
          isCreatable: true,
          isObject: true,
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.headings.contact", { defaultValue: "Contact" }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "contact",
          label: t("forms.labels.contact", { defaultValue: "Contact" }),
          placeholder: t("forms.placeholders.selectContact", {
            defaultValue: "Select contact...",
          }),
          isRequired: false,
          type: "radioGrid",
          isObject: true,
          optionsKey: "contacts",
        },
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
          isRequired: false,
          placeholder: t("forms.placeholders.nameDomainPl", {
            defaultValue: "name@domain.com",
          }),
          autocomplete: "email",
        },
        {
          name: "contact.phone",
          label: t("forms.labels.phone", { defaultValue: "Phone" }),
          isRequired: false,
          placeholder: t("forms.placeholders.phone", {
            defaultValue: "123456789",
          }),
          autocomplete: "tel-national",
        },
      ],
    },
    orderForm([], [], [], t).sections[3],
    {
      fieldArray: false,
      heading: t("forms.headings.shippingNotes", {
        defaultValue: "Delivery and Notes",
      }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "shippingOption",
          label: t("forms.labels.shippingOption", {
            defaultValue: "Shipping Option",
          }),
          isRequired: true,
          placeholder: t("forms.placeholders.selectDelivery", {
            defaultValue: "Select delivery option...",
          }),
          type: "select",
          options: ShippingOptionsAsOptions,
          enumName: "ShippingOptions",
        },
        {
          name: "specialNotes",
          isRequired: false,
          placeholder: t("forms.placeholders.comments", {
            defaultValue: "Comments",
          }),
          type: "textarea",
        },
        {
          name: "mailLink",
          label: t("forms.labels.mailLink", { defaultValue: "Mail Link" }),
          isRequired: false,
          placeholder: t("forms.placeholders.mailLink", {
            defaultValue: "https://mail.example.com/message/123",
          }),
        },
      ],
    },
  ],
});
