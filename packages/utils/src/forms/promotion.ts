import {
  ApplicationMethodAllocationAsOptions,
  ApplicationMethodTargetTypesAsOptions,
  ApplicationMethodTypesAsOptions,
  CampaignAvailabilityTypesAsOptions,
  CampaignBudgetTypesAsOptions,
  CreatePromotionRule,
  CurrencyEnumAsOptions,
  FieldData,
  FormData,
  PromotionRuleAttributeEnum,
  PromotionRuleAttributesAsOptions,
  PromotionRuleOperatorEnum,
  PromotionRuleOperatorsAsOptions,
  PromotionTypesAsOptions,
} from "@konfi/types";
import type { TFunction } from "i18next";

type PromotionRuleOption = {
  label: string;
  value: string;
};

type PromotionRuleTargetOptions = {
  channelOptions?: PromotionRuleOption[];
  customerGroupOptions?: PromotionRuleOption[];
  productTypeOptions?: PromotionRuleOption[];
};

export const createPromotionForm = (
  productOptions: {
    label: string;
    value: string;
  }[],
  categoryOptions: {
    label: string;
    value: string;
  }[],
  campaignOptions: {
    label: string;
    value: string;
  }[],
  t: TFunction,
  targetOptions: PromotionRuleTargetOptions = {},
) => {
  const promotionRuleAttributeOptions =
    getPromotionRuleAttributeOptions(targetOptions);
  const promotionForm: FormData = {
    allowMultiple: false,
    allowToggle: true,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.promotion.headings.basicInformation", {
          defaultValue: "Basic Information",
        }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "code",
            label: t("forms.promotion.labels.code", { defaultValue: "Code" }),
            isRequired: true,
            placeholder: t("forms.promotion.placeholders.code", {
              defaultValue: "Enter promotion code",
            }),
          },
          {
            name: "type",
            label: t("forms.promotion.labels.type", { defaultValue: "Type" }),
            isRequired: true,
            placeholder: t("forms.promotion.placeholders.selectType", {
              defaultValue: "Choose promotion type...",
            }),
            type: "select",
            options: PromotionTypesAsOptions,
            enumName: "PromotionTypes",
          },
          {
            name: "isAutomatic",
            label: t("forms.promotion.labels.isAutomatic", {
              defaultValue: "Apply automatically",
            }),
            isRequired: false,
            placeholder: t("forms.promotion.placeholders.applyAutomatically", {
              defaultValue: "Automatically apply this promotion",
            }),
            helperText: t("forms.helperTexts.autoApply", {
              defaultValue:
                "Apply this promotion automatically when the order meets its conditions.",
            }),
            type: "checkbox",
          },
          {
            name: "isOneTime",
            label: t("forms.promotion.labels.isOneTime", {
              defaultValue: "One-time use",
            }),
            isRequired: false,
            placeholder: t("forms.promotion.placeholders.oneTimeUse", {
              defaultValue:
                "Delete this promotion after one successful checkout",
            }),
            helperText: t("forms.helperTexts.oneTimePromotion", {
              defaultValue:
                "Delete this promotion automatically after the first successful checkout that uses it.",
            }),
            type: "checkbox",
          },
          {
            name: "minimumOrderValue",
            label: t("forms.promotion.labels.minOrderValue", {
              defaultValue: "Minimum order total",
            }),
            isRequired: false,
            placeholder: t("forms.promotion.placeholders.minOrderValue", {
              defaultValue: "Minimum order total",
            }),
            helperText: t("forms.helperTexts.minimumOrderValue", {
              defaultValue:
                "Minimum cart subtotal in the smallest currency unit required before this promotion can be applied (for example 30000 = 300 PLN).",
            }),
            type: "number",
          },
          {
            name: "active",
            label: t("forms.labels.active", { defaultValue: "Active" }),
            isRequired: false,
            placeholder: t("forms.placeholders.active", {
              defaultValue: "Active.",
            }),
            type: "checkbox",
          },
          {
            name: "createCampaign",
            label: t("forms.promotion.labels.createCampaign", {
              defaultValue: "Create linked campaign",
            }),
            isRequired: false,
            placeholder: t("forms.promotion.placeholders.createNewCampaign", {
              defaultValue: "Create and link a new campaign",
            }),
            helperText: t("forms.helperTexts.createCampaign", {
              defaultValue: "Create and link a new campaign to this promotion.",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.promotion.headings.promotionConditions", {
          defaultValue: "Promotion Conditions",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "applicationMethod.type",
            label: t("forms.promotion.labels.applicationType", {
              defaultValue: "Discount Type",
            }),
            isRequired: true,
            placeholder: t(
              "forms.promotion.placeholders.selectApplicationType",
              { defaultValue: "Choose discount type..." },
            ),
            type: "select",
            options: ApplicationMethodTypesAsOptions,
            enumName: "ApplicationMethodTypes",
            helperText: t("forms.helperTexts.applicationType", {
              defaultValue:
                "Choose whether the discount is a percentage or a fixed amount.",
            }),
          },
          {
            name: "applicationMethod.targetType",
            label: t("forms.promotion.labels.applicationTarget", {
              defaultValue: "Apply To",
            }),
            isRequired: true,
            placeholder: t(
              "forms.promotion.placeholders.selectApplicationTarget",
              { defaultValue: "Choose what the discount applies to..." },
            ),
            type: "select",
            options: ApplicationMethodTargetTypesAsOptions,
            enumName: "ApplicationMethodTargetTypes",
            helperText: t("forms.helperTexts.applicationTarget", {
              defaultValue:
                "Choose whether the discount applies to products, shipping methods, or the whole order.",
            }),
          },
          {
            name: "applicationMethod.allocation",
            label: t("forms.promotion.labels.applicationAllocation", {
              defaultValue: "Discount Distribution",
            }),
            isRequired: false,
            placeholder: t(
              "forms.promotion.placeholders.selectAllocationMethod",
              { defaultValue: "Choose how the discount is distributed..." },
            ),
            type: "select",
            options: ApplicationMethodAllocationAsOptions,
            enumName: "ApplicationMethodAllocation",
            helperText: t("forms.helperTexts.applicationAllocation", {
              defaultValue:
                "Choose whether the discount is applied to each eligible item or split across items.",
            }),
          },
          {
            name: "applicationMethod.value",
            label: t("forms.promotion.labels.value", { defaultValue: "Value" }),
            isRequired: false,
            type: "number",
            placeholder: t("forms.promotion.placeholders.promotionValue", {
              defaultValue: "Enter discount value",
            }),
          },
          {
            name: "applicationMethod.currencyCode",
            label: t("forms.promotion.labels.currencyCode", {
              defaultValue: "Currency",
            }),
            isRequired: false,
            placeholder: t("forms.promotion.placeholders.selectCurrency", {
              defaultValue: "Select currency...",
            }),
            type: "select",
            options: CurrencyEnumAsOptions,
          },
          {
            name: "applicationMethod.maxQuantity",
            label: t("forms.promotion.labels.maxQuantity", {
              defaultValue: "Quantity Limit",
            }),
            isRequired: false,
            type: "number",
            placeholder: t("forms.promotion.placeholders.maxQuantity", {
              defaultValue: "Enter quantity limit",
            }),
            helperText: t("forms.helperTexts.maxQuantity", {
              defaultValue:
                "Limit how many eligible items can receive this promotion.",
            }),
          },
          // {
          //   name: "applicationMethod.buyRulesMinQuantity",
          //   label: "Minimalna ilość produktów",
          //   isRequired: false,
          //   type: "number",
          //   helperText: "Minimalna ilość produktów w koszyku, aby promocja mogła zostać zastosowana, np. jeżeli promocja dotyczy zakupu 2 produtków aby otrzymać 1 gratis, wtedy minimalna ilość to 2.",
          //   dependsOn: "type",
          //   dependencyValue: "BUYGET",
          // },
          // {
          //   name: "applicationMethod.applyToQuantity",
          //   label: "Zastosuj do ilości",
          //   isRequired: false,
          //   type: "number",
          //   helperText: "Ilość przedmiotów do których promocja ma zostać zastosowana, np. jeżeli promocja dotyczy zakupu 2 produtków aby otrzymać 1 gratis, wtedy ilość to 1.",
          //   dependsOn: "type",
          //   dependencyValue: "BUYGET",
          // },        ],
        ],
      },
      {
        fieldArray: true,
        name: "rules",
        initialValues: {
          description: "",
          attribute: PromotionRuleAttributeEnum.CURRENCY,
          operator: PromotionRuleOperatorEnum.IN,
          values: [],
        } as CreatePromotionRule,
        heading: t("forms.headings.promotionRules", {
          defaultValue: "Promotion Rules",
        }),
        description: t("forms.promotion.descriptions.rules", {
          defaultValue:
            "Add at least one rule. Promotions without rules are not applied, even when a minimum order total is set. If the code should work for all PLN orders, add a currency rule for PLN.",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "description",
            label: t("forms.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.enterRuleDescription", {
              defaultValue: "Enter rule description",
            }),
          },
          {
            name: "attribute",
            label: t("forms.labels.attribute", { defaultValue: "Attribute" }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectAttribute", {
              defaultValue: "Select attribute...",
            }),
            type: "select",
            options: promotionRuleAttributeOptions,
            enumName: "PromotionRuleAttributes",
          },
          {
            name: "operator",
            label: t("forms.labels.operator", { defaultValue: "Operator" }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectOperator", {
              defaultValue: "Select operator",
            }),
            type: "select",
            options: PromotionRuleOperatorsAsOptions,
            enumName: "PromotionRuleOperators",
          },
          {
            name: "values",
            label: t("forms.labels.currencies", { defaultValue: "Currencies" }),
            type: "multiSelect",
            isRequired: true,
            placeholder: t("forms.placeholders.selectCurrencies", {
              defaultValue: "Select currencies...",
            }),
            dependsOn: "attribute",
            dependencyValue: PromotionRuleAttributeEnum.CURRENCY,
            options: CurrencyEnumAsOptions,
            watchNested: true,
          },
          {
            name: "values",
            label: t("forms.labels.products", { defaultValue: "Products" }),
            type: "multiSelect",
            isRequired: true,
            placeholder: t("forms.promotion.placeholders.selectProducts", {
              defaultValue: "Select products...",
            }),
            dependsOn: "attribute",
            dependencyValue: PromotionRuleAttributeEnum.PRODUCT,
            options: productOptions,
            watchNested: true,
          },
          {
            name: "values",
            label: t("forms.labels.categories", { defaultValue: "Categories" }),
            type: "multiSelect",
            isRequired: true,
            placeholder: t("forms.promotion.placeholders.selectCategories", {
              defaultValue: "Select categories...",
            }),
            dependsOn: "attribute",
            dependencyValue: PromotionRuleAttributeEnum.CATEGORY,
            options: categoryOptions,
            watchNested: true,
          },
          {
            name: "values",
            label: t("forms.labels.customer", { defaultValue: "Customer" }),
            placeholder: t("forms.placeholders.search", {
              defaultValue: "Search...",
            }),
            type: "search",
            searchFor: "customers",
            searchResult: "array",
            isCreatable: true,
            isObject: true,
            dependsOn: "attribute",
            dependencyValue: PromotionRuleAttributeEnum.USER,
            watchNested: true,
          },
          ...getPromotionRuleTargetFields(targetOptions, t),
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.campaign.headings.campaign", {
          defaultValue: "Existing Campaign",
        }),
        isDefaultExpanded: false,
        dependsOn: "createCampaign",
        dependencyValue: "false",
        fields: [
          {
            name: "campaign",
            label: t("forms.campaign.labels.campaign", {
              defaultValue: "Existing Campaign",
            }),
            placeholder: t("forms.campaign.placeholders.selectCampaign", {
              defaultValue: "Choose an existing campaign...",
            }),
            isRequired: false,
            type: "select",
            options: campaignOptions,
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.campaign.headings.newCampaign", {
          defaultValue: "New Campaign",
        }),
        isDefaultExpanded: false,
        dependsOn: "createCampaign",
        dependencyValue: "true",
        fields: [
          {
            name: "campaign.name",
            label: t("forms.campaign.labels.campaignName", {
              defaultValue: "Campaign Name",
            }),
            isRequired: true,
            placeholder: t("forms.campaign.placeholders.campaignName", {
              defaultValue: "Enter campaign name",
            }),
          },
          {
            name: "campaign.description",
            label: t("forms.campaign.labels.campaignDescription", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.campaign.placeholders.campaignDescription", {
              defaultValue: "Describe the campaign",
            }),
          },
          {
            name: "campaign.campaignIdentifier",
            label: t("forms.campaign.labels.campaignIdentifier", {
              defaultValue: "Internal Identifier",
            }),
            isRequired: true,
            placeholder: t("forms.campaign.placeholders.campaignIdentifier", {
              defaultValue: "Enter internal identifier",
            }),
          },
          {
            name: "campaign.startsAt",
            label: t("forms.campaign.labels.startDate", {
              defaultValue: "Start Date",
            }),
            isRequired: false,
            placeholder: t("forms.campaign.placeholders.startDate", {
              defaultValue: "Start date",
            }),
            type: "date",
          },
          {
            name: "campaign.endsAt",
            label: t("forms.campaign.labels.endDate", {
              defaultValue: "End Date",
            }),
            isRequired: false,
            placeholder: t("forms.campaign.placeholders.endDate", {
              defaultValue: "End date",
            }),
            type: "date",
          },
          {
            name: "campaign.availabilityTypes",
            label: t("forms.campaign.labels.availability", {
              defaultValue: "Available In",
            }),
            isRequired: false,
            placeholder: t(
              "forms.campaign.placeholders.selectAvailabilityType",
              { defaultValue: "Select availability..." },
            ),
            type: "multiSelect",
            options: CampaignAvailabilityTypesAsOptions,
            enumName: "CampaignAvailabilityTypeEnum",
          },
          {
            name: "campaign.createBudget",
            label: t("forms.campaign.labels.budget", {
              defaultValue: "Add Budget",
            }),
            isRequired: false,
            placeholder: t("forms.campaign.placeholders.hasBudget", {
              defaultValue: "Limit this campaign with a budget",
            }),
            type: "checkbox",
          },
          {
            name: "campaign.budget.type",
            label: t("forms.campaign.labels.budgetType", {
              defaultValue: "Budget Type",
            }),
            isRequired: false,
            placeholder: t("forms.campaign.placeholders.selectBudgetType", {
              defaultValue: "Choose budget type...",
            }),
            type: "select",
            options: CampaignBudgetTypesAsOptions,
            enumName: "CampaignBudgetTypes",
            dependsOn: "campaign.createBudget",
            dependencyValue: "true",
          },
          {
            name: "campaign.budget.limit",
            label: t("forms.campaign.labels.limit", {
              defaultValue: "Budget Limit",
            }),
            isRequired: false,
            placeholder: t("forms.campaign.placeholders.campaignLimit", {
              defaultValue: "Enter budget limit",
            }),
            type: "number",
            dependsOn: "campaign.createBudget",
            dependencyValue: "true",
            helperText: t("forms.campaign.helperTexts.campaignLimit", {
              defaultValue:
                "For Amount budgets, enter the limit in the smallest currency unit (for example 50000 = 500 PLN). For Usage budgets, enter the maximum number of times the campaign can be used.",
            }),
          },
        ],
      },
    ],
  };
  return promotionForm;
};

export const updatePromotionForm = (
  productOptions: {
    label: string;
    value: string;
  }[],
  categoryOptions: {
    label: string;
    value: string;
  }[],
  campaignOptions: {
    label: string;
    value: string;
  }[],
  t: TFunction,
  targetOptions: PromotionRuleTargetOptions = {},
) => {
  const promotionRuleAttributeOptions =
    getPromotionRuleAttributeOptions(targetOptions);
  const promotionForm: FormData = {
    allowMultiple: false,
    allowToggle: true,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.promotion.headings.basicInformation", {
          defaultValue: "Basic Information",
        }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "code",
            label: t("forms.promotion.labels.code", { defaultValue: "Code" }),
            isRequired: true,
            placeholder: t("forms.promotion.placeholders.code", {
              defaultValue: "Code",
            }),
          },
          {
            name: "type",
            label: t("forms.promotion.labels.type", { defaultValue: "Type" }),
            isRequired: true,
            placeholder: t("forms.promotion.placeholders.selectType", {
              defaultValue: "Select type...",
            }),
            type: "select",
            options: PromotionTypesAsOptions,
            enumName: "PromotionTypes",
          },
          {
            name: "isAutomatic",
            label: t("forms.promotion.labels.isAutomatic", {
              defaultValue: "Automatic",
            }),
            isRequired: false,
            placeholder: t("forms.promotion.placeholders.applyAutomatically", {
              defaultValue: "Apply automatically.",
            }),
            helperText: t("forms.helperTexts.autoApply", {
              defaultValue: "Should the promotion be applied automatically?",
            }),
            type: "checkbox",
          },
          {
            name: "isOneTime",
            label: t("forms.promotion.labels.isOneTime", {
              defaultValue: "One-time use",
            }),
            isRequired: false,
            placeholder: t("forms.promotion.placeholders.oneTimeUse", {
              defaultValue:
                "Delete this promotion after one successful checkout",
            }),
            helperText: t("forms.helperTexts.oneTimePromotion", {
              defaultValue:
                "Delete this promotion automatically after the first successful checkout that uses it.",
            }),
            type: "checkbox",
          },
          {
            name: "minimumOrderValue",
            label: t("forms.promotion.labels.minOrderValue", {
              defaultValue: "Minimum order total",
            }),
            isRequired: false,
            placeholder: t("forms.promotion.placeholders.minOrderValue", {
              defaultValue: "Minimum order total",
            }),
            helperText: t("forms.helperTexts.minimumOrderValue", {
              defaultValue:
                "Minimum cart subtotal in the smallest currency unit required before this promotion can be applied (for example 30000 = 300 PLN).",
            }),
            type: "number",
          },
          {
            name: "active",
            label: t("forms.labels.active", { defaultValue: "Active" }),
            isRequired: false,
            placeholder: t("forms.placeholders.active", {
              defaultValue: "Active.",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: true,
        name: "rules",
        initialValues: {
          description: "",
          attribute: PromotionRuleAttributeEnum.CURRENCY,
          operator: PromotionRuleOperatorEnum.IN,
          values: [],
        } as CreatePromotionRule,
        heading: t("forms.headings.promotionRules", {
          defaultValue: "Promotion Rules",
        }),
        description: t("forms.promotion.descriptions.rules", {
          defaultValue:
            "Add at least one rule. Promotions without rules are not applied, even when a minimum order total is set. If the code should work for all PLN orders, add a currency rule for PLN.",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "description",
            label: t("forms.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.enterRuleDescription", {
              defaultValue: "Enter rule description",
            }),
          },
          {
            name: "attribute",
            label: t("forms.labels.attribute", { defaultValue: "Attribute" }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectAttribute", {
              defaultValue: "Select attribute...",
            }),
            type: "select",
            options: promotionRuleAttributeOptions,
            enumName: "PromotionRuleAttributes",
          },
          {
            name: "operator",
            label: t("forms.labels.operator", { defaultValue: "Operator" }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectOperator", {
              defaultValue: "Select operator",
            }),
            type: "select",
            options: PromotionRuleOperatorsAsOptions,
            enumName: "PromotionRuleOperators",
          },
          {
            name: "values",
            label: t("forms.labels.currencies", { defaultValue: "Currencies" }),
            type: "multiSelect",
            isRequired: true,
            placeholder: t("forms.placeholders.selectCurrencies", {
              defaultValue: "Select currencies...",
            }),
            dependsOn: "attribute",
            dependencyValue: PromotionRuleAttributeEnum.CURRENCY,
            options: CurrencyEnumAsOptions,
            watchNested: true,
          },
          {
            name: "values",
            label: t("forms.labels.products", { defaultValue: "Products" }),
            type: "multiSelect",
            isRequired: true,
            placeholder: t("forms.promotion.placeholders.selectProducts", {
              defaultValue: "Select products...",
            }),
            dependsOn: "attribute",
            dependencyValue: PromotionRuleAttributeEnum.PRODUCT,
            options: productOptions,
            watchNested: true,
          },
          {
            name: "values",
            label: t("forms.labels.categories", { defaultValue: "Categories" }),
            type: "multiSelect",
            isRequired: true,
            placeholder: t("forms.promotion.placeholders.selectCategories", {
              defaultValue: "Select categories...",
            }),
            dependsOn: "attribute",
            dependencyValue: PromotionRuleAttributeEnum.CATEGORY,
            options: categoryOptions,
            watchNested: true,
          },
          {
            name: "values",
            label: t("forms.labels.customer", { defaultValue: "Customer" }),
            placeholder: t("forms.placeholders.search", {
              defaultValue: "Search...",
            }),
            type: "search",
            searchFor: "customers",
            searchResult: "array",
            isCreatable: true,
            isObject: true,
            dependsOn: "attribute",
            dependencyValue: PromotionRuleAttributeEnum.USER,
            watchNested: true,
          },
          ...getPromotionRuleTargetFields(targetOptions, t),
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.promotion.headings.promotionConditions", {
          defaultValue: "Promotion Conditions",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "applicationMethod.type",
            label: t("forms.promotion.labels.applicationType", {
              defaultValue: "Application Type",
            }),
            isRequired: true,
            placeholder: t(
              "forms.promotion.placeholders.selectApplicationType",
              { defaultValue: "Select application type..." },
            ),
            type: "select",
            options: ApplicationMethodTypesAsOptions,
            enumName: "ApplicationMethodTypes",
            helperText: t("forms.helperTexts.applicationType", {
              defaultValue:
                "Is the promotion value a percentage or fixed amount?",
            }),
          },
          {
            name: "applicationMethod.targetType",
            label: t("forms.promotion.labels.applicationTarget", {
              defaultValue: "Application Target",
            }),
            isRequired: true,
            placeholder: t(
              "forms.promotion.placeholders.selectApplicationTarget",
              { defaultValue: "Select application target..." },
            ),
            type: "select",
            options: ApplicationMethodTargetTypesAsOptions,
            enumName: "ApplicationMethodTargetTypes",
            helperText: t("forms.helperTexts.applicationTarget", {
              defaultValue:
                "Is the promotion value applied to cart items, shipping methods, or the entire order?",
            }),
          },
          {
            name: "applicationMethod.allocation",
            label: t("forms.promotion.labels.applicationAllocation", {
              defaultValue: "Value Allocation",
            }),
            isRequired: false,
            placeholder: t(
              "forms.promotion.placeholders.selectAllocationMethod",
              { defaultValue: "Select allocation method..." },
            ),
            type: "select",
            options: ApplicationMethodAllocationAsOptions,
            enumName: "ApplicationMethodAllocation",
            helperText: t("forms.helperTexts.applicationAllocation", {
              defaultValue:
                "Should the promotion value be applied to each item separately or distributed among items?",
            }),
          },
          {
            name: "applicationMethod.value",
            label: t("forms.promotion.labels.value", { defaultValue: "Value" }),
            isRequired: false,
            type: "number",
            placeholder: t("forms.promotion.placeholders.promotionValue", {
              defaultValue: "Promotion value",
            }),
          },
          {
            name: "applicationMethod.currencyCode",
            label: t("forms.promotion.labels.currencyCode", {
              defaultValue: "Currency",
            }),
            isRequired: false,
            placeholder: t("forms.promotion.placeholders.selectCurrency", {
              defaultValue: "Select currency...",
            }),
            type: "select",
            options: CurrencyEnumAsOptions,
          },
          {
            name: "applicationMethod.maxQuantity",
            label: t("forms.promotion.labels.maxQuantity", {
              defaultValue: "Maximum Quantity",
            }),
            isRequired: false,
            type: "number",
            placeholder: t("forms.promotion.placeholders.maxQuantity", {
              defaultValue: "Maximum quantity",
            }),
            helperText: t("forms.helperTexts.maxQuantity", {
              defaultValue:
                "Maximum number of items to which the promotion can be applied.",
            }),
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.campaign.headings.campaign", {
          defaultValue: "Campaign",
        }),
        isDefaultExpanded: false,
        dependsOn: "createCampaign",
        dependencyValue: "false",
        fields: [
          {
            name: "campaignId",
            label: t("forms.campaign.labels.campaign", {
              defaultValue: "Campaign",
            }),
            placeholder: t("forms.campaign.placeholders.selectCampaign", {
              defaultValue: "Select campaign...",
            }),
            isRequired: false,
            type: "select",
            options: campaignOptions,
          },
        ],
      },
    ],
  };
  return promotionForm;
};

function getPromotionRuleAttributeOptions({
  channelOptions = [],
  customerGroupOptions = [],
  productTypeOptions = [],
}: PromotionRuleTargetOptions): PromotionRuleOption[] {
  return PromotionRuleAttributesAsOptions.filter((option) => {
    if (option.value === PromotionRuleAttributeEnum.CHANNEL) {
      return channelOptions.length > 0;
    }

    if (option.value === PromotionRuleAttributeEnum.CUSTOMER_GROUP) {
      return customerGroupOptions.length > 0;
    }

    if (option.value === PromotionRuleAttributeEnum.PRODUCT_TYPE) {
      return productTypeOptions.length > 0;
    }

    return true;
  });
}

function getPromotionRuleTargetFields(
  {
    channelOptions = [],
    customerGroupOptions = [],
    productTypeOptions = [],
  }: PromotionRuleTargetOptions,
  t: TFunction,
): FieldData[] {
  const fields: FieldData[] = [];

  fields.push(
    {
      name: "values.0",
      label: t("forms.labels.firstOrder", {
        defaultValue: "First order",
      }),
      type: "select",
      isRequired: true,
      placeholder: t("forms.promotion.placeholders.selectFirstOrder", {
        defaultValue: "Select first-order status...",
      }),
      dependsOn: "attribute",
      dependencyValue: PromotionRuleAttributeEnum.FIRST_ORDER,
      options: [
        {
          label: t("common.yes", { defaultValue: "Yes" }),
          value: "true",
        },
        {
          label: t("common.no", { defaultValue: "No" }),
          value: "false",
        },
      ],
      watchNested: true,
    },
    {
      name: "values.0",
      label: t("forms.labels.usageCount", {
        defaultValue: "Usage count",
      }),
      type: "number",
      isRequired: true,
      placeholder: t("forms.promotion.placeholders.enterUsageCount", {
        defaultValue: "Enter usage count...",
      }),
      dependsOn: "attribute",
      dependencyValue: PromotionRuleAttributeEnum.USAGE_COUNT,
      watchNested: true,
    },
  );

  if (channelOptions.length > 0) {
    fields.push({
      name: "values",
      label: t("forms.labels.channels", { defaultValue: "Channels" }),
      type: "multiSelect",
      isRequired: true,
      placeholder: t("forms.promotion.placeholders.selectChannels", {
        defaultValue: "Select channels...",
      }),
      dependsOn: "attribute",
      dependencyValue: PromotionRuleAttributeEnum.CHANNEL,
      options: channelOptions,
      watchNested: true,
    });
  }

  if (customerGroupOptions.length > 0) {
    fields.push({
      name: "values",
      label: t("forms.labels.customerGroups", {
        defaultValue: "Customer groups",
      }),
      type: "multiSelect",
      isRequired: true,
      placeholder: t("forms.promotion.placeholders.selectCustomerGroups", {
        defaultValue: "Select customer groups…",
      }),
      dependsOn: "attribute",
      dependencyValue: PromotionRuleAttributeEnum.CUSTOMER_GROUP,
      options: customerGroupOptions,
      watchNested: true,
    });
  }

  if (productTypeOptions.length > 0) {
    fields.push({
      name: "values",
      label: t("forms.labels.productTypes", {
        defaultValue: "Product types",
      }),
      type: "multiSelect",
      isRequired: true,
      placeholder: t("forms.promotion.placeholders.selectProductTypes", {
        defaultValue: "Select product types...",
      }),
      dependsOn: "attribute",
      dependencyValue: PromotionRuleAttributeEnum.PRODUCT_TYPE,
      options: productTypeOptions,
      watchNested: true,
    });
  }

  return fields;
}

export const createCampaignForm = (t: TFunction): FormData => ({
  allowMultiple: false,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: t("forms.campaign.headings.basicInformation", {
        defaultValue: "Basic Information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "name",
          label: t("forms.campaign.labels.campaignName", {
            defaultValue: "Campaign Name",
          }),
          isRequired: true,
          placeholder: t("forms.campaign.placeholders.campaignName", {
            defaultValue: "Enter campaign name",
          }),
        },
        {
          name: "description",
          label: t("forms.campaign.labels.campaignDescription", {
            defaultValue: "Description",
          }),
          isRequired: false,
          placeholder: t("forms.campaign.placeholders.campaignDescription", {
            defaultValue: "Describe the campaign",
          }),
        },
        {
          name: "campaignIdentifier",
          label: t("forms.campaign.labels.campaignIdentifier", {
            defaultValue: "Internal Identifier",
          }),
          isRequired: true,
          placeholder: t("forms.campaign.placeholders.campaignIdentifier", {
            defaultValue: "Enter internal identifier",
          }),
        },
        {
          name: "startsAt",
          label: t("forms.campaign.labels.startDate", {
            defaultValue: "Start Date",
          }),
          isRequired: true,
          placeholder: t("forms.campaign.placeholders.startDate", {
            defaultValue: "Start date",
          }),
          type: "date",
        },
        {
          name: "endsAt",
          label: t("forms.campaign.labels.endDate", {
            defaultValue: "End Date",
          }),
          isRequired: true,
          placeholder: t("forms.campaign.placeholders.endDate", {
            defaultValue: "End date",
          }),
          type: "date",
        },
        {
          name: "availabilityTypes",
          label: t("forms.campaign.labels.availability", {
            defaultValue: "Available In",
          }),
          isRequired: false,
          placeholder: t("forms.campaign.placeholders.selectAvailabilityType", {
            defaultValue: "Select availability...",
          }),
          type: "multiSelect",
          options: CampaignAvailabilityTypesAsOptions,
          enumName: "CampaignAvailabilityTypeEnum",
        },
        {
          name: "budget.type",
          label: t("forms.campaign.labels.budgetType", {
            defaultValue: "Budget Type",
          }),
          isRequired: false,
          placeholder: t("forms.campaign.placeholders.selectBudgetType", {
            defaultValue: "Choose budget type...",
          }),
          type: "select",
          options: CampaignBudgetTypesAsOptions,
          enumName: "CampaignBudgetTypes",
          dependsOn: "createBudget",
          dependencyValue: "true",
        },
        {
          name: "budget.limit",
          label: t("forms.campaign.labels.limit", {
            defaultValue: "Budget Limit",
          }),
          isRequired: false,
          placeholder: t("forms.campaign.placeholders.campaignLimit", {
            defaultValue: "Enter budget limit",
          }),
          type: "number",
          dependsOn: "createBudget",
          dependencyValue: "true",
          helperText: t("forms.campaign.helperTexts.campaignLimit", {
            defaultValue:
              "For Amount budgets, enter the limit in the smallest currency unit (for example 50000 = 500 PLN). For Usage budgets, enter the maximum number of times the campaign can be used.",
          }),
        },
      ],
    },
  ],
});

export const updateCampaignForm = (t: TFunction): FormData => ({
  allowMultiple: false,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: t("forms.campaign.headings.basicInformation", {
        defaultValue: "Basic Information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "name",
          label: t("forms.campaign.labels.campaignName", {
            defaultValue: "Campaign Name",
          }),
          isRequired: true,
          placeholder: t("forms.campaign.placeholders.campaignName", {
            defaultValue: "Enter campaign name",
          }),
        },
        {
          name: "description",
          label: t("forms.campaign.labels.campaignDescription", {
            defaultValue: "Description",
          }),
          isRequired: false,
          placeholder: t("forms.campaign.placeholders.campaignDescription", {
            defaultValue: "Describe the campaign",
          }),
        },
        {
          name: "campaignIdentifier",
          label: t("forms.campaign.labels.campaignIdentifier", {
            defaultValue: "Internal Identifier",
          }),
          isRequired: true,
          placeholder: t("forms.campaign.placeholders.campaignIdentifier", {
            defaultValue: "Enter internal identifier",
          }),
        },
        {
          name: "startsAt",
          label: t("forms.campaign.labels.startDate", {
            defaultValue: "Start Date",
          }),
          isRequired: true,
          placeholder: t("forms.campaign.placeholders.startDate", {
            defaultValue: "Start date",
          }),
          type: "date",
        },
        {
          name: "endsAt",
          label: t("forms.campaign.labels.endDate", {
            defaultValue: "End Date",
          }),
          isRequired: true,
          placeholder: t("forms.campaign.placeholders.endDate", {
            defaultValue: "End date",
          }),
          type: "date",
        },
        {
          name: "availabilityTypes",
          label: t("forms.campaign.labels.availability", {
            defaultValue: "Available In",
          }),
          isRequired: false,
          placeholder: t("forms.campaign.placeholders.selectAvailabilityType", {
            defaultValue: "Select availability...",
          }),
          type: "multiSelect",
          options: CampaignAvailabilityTypesAsOptions,
          enumName: "CampaignAvailabilityTypeEnum",
        },
        {
          name: "budget.type",
          label: t("forms.campaign.labels.budgetType", {
            defaultValue: "Budget Type",
          }),
          isRequired: false,
          placeholder: t("forms.campaign.placeholders.selectBudgetType", {
            defaultValue: "Choose budget type...",
          }),
          type: "select",
          options: CampaignBudgetTypesAsOptions,
          enumName: "CampaignBudgetTypes",
          dependsOn: "createBudget",
          dependencyValue: "true",
        },
        {
          name: "budget.limit",
          label: t("forms.campaign.labels.limit", {
            defaultValue: "Budget Limit",
          }),
          isRequired: false,
          placeholder: t("forms.campaign.placeholders.campaignLimit", {
            defaultValue: "Enter budget limit",
          }),
          type: "number",
          dependsOn: "createBudget",
          dependencyValue: "true",
          helperText: t("forms.campaign.helperTexts.campaignLimit", {
            defaultValue:
              "For Amount budgets, enter the limit in the smallest currency unit (for example 50000 = 500 PLN). For Usage budgets, enter the maximum number of times the campaign can be used.",
          }),
        },
      ],
    },
  ],
});
