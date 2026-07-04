import type { FieldData, FormData } from "@konfi/types";
import type { TFunction } from "i18next";

type FormSection = FormData["sections"][number];

type TranslationText = {
  key: string;
  defaultValue: string;
};

type ShippingAddressCopy = {
  shippingLabel: TranslationText;
  shippingPlaceholder: TranslationText;
  namePlaceholder: TranslationText;
  streetLabel: TranslationText;
  streetPlaceholder: TranslationText;
  zipLabel: TranslationText;
  zipPlaceholder: TranslationText;
  savePlaceholder: TranslationText;
};

type ShippingAddressSectionOptions = {
  dependencyValues: string[];
  isDefaultExpanded: boolean;
  isRequired: boolean;
  copy: ShippingAddressCopy;
  locker?: {
    heading: TranslationText;
    label: TranslationText;
    dependencyValue: string;
    isDefaultExpanded: boolean;
  };
  personalCollection?: {
    dependencyValue: string;
    isDefaultExpanded: boolean;
    isRequired: boolean;
    shippingLabel: TranslationText;
    shippingPlaceholder: TranslationText;
  };
};

function translate(t: TFunction, text: TranslationText): string {
  return t(text.key, { defaultValue: text.defaultValue });
}

const invoiceRecipientRoleOptions = (t: TFunction) => [
  {
    value: "recipient",
    label: t("forms.invoiceRecipientRoleOptions.recipient", {
      defaultValue: "Recipient",
    }),
  },
  {
    value: "additionalBuyer",
    label: t("forms.invoiceRecipientRoleOptions.additionalBuyer", {
      defaultValue: "Additional buyer",
    }),
  },
  {
    value: "payer",
    label: t("forms.invoiceRecipientRoleOptions.payer", {
      defaultValue: "Paying party",
    }),
  },
  {
    value: "jst",
    label: t("forms.invoiceRecipientRoleOptions.jst", {
      defaultValue: "Local government unit",
    }),
  },
  {
    value: "vatGroupMember",
    label: t("forms.invoiceRecipientRoleOptions.vatGroupMember", {
      defaultValue: "VAT group member",
    }),
  },
  {
    value: "employee",
    label: t("forms.invoiceRecipientRoleOptions.employee", {
      defaultValue: "Employee",
    }),
  },
  {
    value: "other",
    label: t("forms.invoiceRecipientRoleOptions.other", {
      defaultValue: "Other role",
    }),
  },
];

function createVisibleWhenEnabled(
  enabledFieldName: string,
  options: {
    visibilityDependencies?: FieldData["dependencies"];
    watchNested?: true;
  },
): Pick<
  FieldData,
  "dependsOn" | "dependencyValue" | "dependencies" | "watchNested"
> {
  const nestedWatch = options.watchNested ? { watchNested: true as const } : {};
  const enabledDependency = {
    name: enabledFieldName,
    value: "true",
    ...nestedWatch,
  };

  if (options.visibilityDependencies) {
    return {
      dependencies: [...options.visibilityDependencies, enabledDependency],
    };
  }

  return {
    dependsOn: enabledFieldName,
    dependencyValue: "true",
    ...nestedWatch,
  };
}

/**
 * Builds invoice recipient sub-fields shared by the order, checkout, and
 * contact (customer/supplier) forms. Used as a spreadable section so every
 * consumer renders an identical set of inputs.
 */
export const createInvoiceRecipientFields = (
  t: TFunction,
  options: {
    prefix?: string;
    visibilityDependencies?: FieldData["dependencies"];
    watchNested?: true;
  } = {},
): FieldData[] => {
  const fieldName = (name: string) =>
    options.prefix ? `${options.prefix}.${name}` : name;
  const nestedWatch = options.watchNested ? { watchNested: true as const } : {};
  const enabledFieldName = fieldName("invoiceRecipientEnabled");
  const detailDependencyName = options.watchNested
    ? "invoiceRecipientEnabled"
    : enabledFieldName;
  const roleDependencyName = options.watchNested
    ? "invoiceRecipientRole"
    : fieldName("invoiceRecipientRole");
  const detailDependency = createVisibleWhenEnabled(detailDependencyName, {
    visibilityDependencies: options.visibilityDependencies,
    watchNested: options.watchNested,
  });
  const roleDescriptionDependency = {
    dependencies: [
      ...(options.visibilityDependencies ?? []),
      { name: detailDependencyName, value: "true", ...nestedWatch },
      { name: roleDependencyName, value: "other", ...nestedWatch },
    ],
  };

  return [
    {
      name: enabledFieldName,
      type: "checkbox",
      isRequired: false,
      placeholder: t("forms.labels.invoiceRecipientEnabled", {
        defaultValue: "Invoice recipient",
      }),
      helperText: t("forms.helperTexts.invoiceRecipientEnabled", {
        defaultValue:
          "Use when a recipient other than the buyer should appear on the invoice.",
      }),
      ...(options.visibilityDependencies
        ? { dependencies: options.visibilityDependencies }
        : {}),
    },
    {
      name: fieldName("invoiceRecipientRole"),
      label: t("forms.labels.invoiceRecipientRole", {
        defaultValue: "Recipient role",
      }),
      isRequired: false,
      placeholder: t("forms.placeholders.invoiceRecipientRole", {
        defaultValue: "Select recipient role",
      }),
      type: "select",
      options: invoiceRecipientRoleOptions(t),
      ...detailDependency,
    },
    {
      name: fieldName("invoiceRecipientRoleDescription"),
      label: t("forms.labels.invoiceRecipientRoleDescription", {
        defaultValue: "Role description",
      }),
      isRequired: false,
      placeholder: t("forms.placeholders.invoiceRecipientRoleDescription", {
        defaultValue: "Enter recipient role",
      }),
      ...roleDescriptionDependency,
    },
    {
      name: fieldName("invoiceRecipientName"),
      label: t("forms.labels.invoiceRecipientName", {
        defaultValue: "Recipient name",
      }),
      isRequired: false,
      placeholder: t("forms.placeholders.invoiceRecipientName", {
        defaultValue: "Recipient name",
      }),
      ...detailDependency,
    },
    {
      name: fieldName("invoiceRecipientNip"),
      label: t("forms.labels.invoiceRecipientNip", {
        defaultValue: "Recipient NIP",
      }),
      isRequired: false,
      placeholder: t("forms.placeholders.nip", { defaultValue: "NIP" }),
      autocomplete: "billing vat",
      getCustomerDataModal: true,
      ...detailDependency,
    },
    {
      name: fieldName("invoiceRecipientStreet"),
      label: t("forms.labels.invoiceRecipientStreet", {
        defaultValue: "Recipient street",
      }),
      isRequired: false,
      placeholder: t("forms.placeholders.streetAndNumber", {
        defaultValue: "Street and number",
      }),
      autocomplete: "billing street-address",
      type: "addressAutocomplete",
      ...detailDependency,
    },
    {
      name: fieldName("invoiceRecipientZip"),
      label: t("forms.labels.invoiceRecipientPostalCode", {
        defaultValue: "Recipient postal code",
      }),
      isRequired: false,
      placeholder: t("forms.placeholders.postalCode", {
        defaultValue: "00-000",
      }),
      autocomplete: "billing postal-code",
      ...detailDependency,
    },
    {
      name: fieldName("invoiceRecipientCity"),
      label: t("forms.labels.invoiceRecipientCity", {
        defaultValue: "Recipient city",
      }),
      isRequired: false,
      placeholder: t("forms.placeholders.city", { defaultValue: "City" }),
      autocomplete: "billing address-level2",
      ...detailDependency,
    },
  ];
};

/** @deprecated Use createInvoiceRecipientFields. */
export const createJstRecipientFields = createInvoiceRecipientFields;

function createShippingAddressSection(
  t: TFunction,
  dependencyValue: string,
  options: ShippingAddressSectionOptions,
): FormSection {
  return {
    fieldArray: false,
    heading: t("forms.headings.address", { defaultValue: "Address" }),
    isDefaultExpanded: options.isDefaultExpanded,
    dependencyValue,
    dependsOn: "shippingOption",
    fields: [
      {
        name: "shipping",
        label: translate(t, options.copy.shippingLabel),
        placeholder: translate(t, options.copy.shippingPlaceholder),
        isRequired: options.isRequired,
        type: "radioGrid",
        isObject: true,
        optionsKey: "shippingAddresses",
      },
      {
        name: "shipping.name",
        label: t("forms.labels.name", { defaultValue: "Name" }),
        isRequired: false,
        placeholder: translate(t, options.copy.namePlaceholder),
        autocomplete: "shipping name",
        watch: true,
      },
      {
        name: "shipping.street",
        label: translate(t, options.copy.streetLabel),
        isRequired: true,
        placeholder: translate(t, options.copy.streetPlaceholder),
        autocomplete: "shipping street-address",
        type: "addressAutocomplete",
        watch: true,
      },
      {
        name: "shipping.zip",
        label: translate(t, options.copy.zipLabel),
        isRequired: true,
        placeholder: translate(t, options.copy.zipPlaceholder),
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
        placeholder: translate(t, options.copy.savePlaceholder),
        type: "checkbox",
      },
    ],
  };
}

function createLockerSection(
  t: TFunction,
  locker: NonNullable<ShippingAddressSectionOptions["locker"]>,
): FormSection {
  return {
    fieldArray: false,
    heading: translate(t, locker.heading),
    isDefaultExpanded: locker.isDefaultExpanded,
    dependencyValue: locker.dependencyValue,
    dependsOn: "shippingOption",
    fields: [
      {
        name: "shipping",
        label: translate(t, locker.label),
        isRequired: true,
        type: "inpost-geowidget",
        watch: true,
      },
    ],
  };
}

function createPersonalCollectionSection(
  t: TFunction,
  personalCollection: NonNullable<
    ShippingAddressSectionOptions["personalCollection"]
  >,
): FormSection {
  return {
    fieldArray: false,
    heading: t("forms.headings.address", { defaultValue: "Address" }),
    isDefaultExpanded: personalCollection.isDefaultExpanded,
    dependencyValue: personalCollection.dependencyValue,
    dependsOn: "shippingOption",
    fields: [
      {
        name: "shipping",
        label: translate(t, personalCollection.shippingLabel),
        placeholder: translate(t, personalCollection.shippingPlaceholder),
        isRequired: personalCollection.isRequired,
        type: "radioGrid",
        isObject: true,
        optionsKey: "shippingAddresses",
      },
    ],
  };
}

export function createShippingOptionAddressSections(
  t: TFunction,
  options: ShippingAddressSectionOptions,
): FormSection[] {
  const sections = options.dependencyValues.map((dependencyValue) =>
    createShippingAddressSection(t, dependencyValue, options),
  );

  if (options.locker) {
    sections.push(createLockerSection(t, options.locker));
  }

  if (options.personalCollection) {
    sections.push(
      createPersonalCollectionSection(t, options.personalCollection),
    );
  }

  return sections;
}
