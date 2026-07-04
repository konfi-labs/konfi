import {
  AttributeInputTypeEnum,
  CurrencyEnum,
  CurrencyEnumAsOptions,
  enumToSearchOptions,
  FormData,
  HeroCard,
  NotificationTypeAsOptions,
  Price,
  PriceTypeAsOptions,
  PriceTypeEnum,
  SelectOption,
  ShippingOptionsAsArray,
  ShippingTypesAsOptions,
  ThreeDModelsAsOptions,
} from "@konfi/types";
import type { TFunction } from "i18next";
import { getPrintingMethodOptions } from "../printing-methods";
import { getUnitOptions } from "../units-proofing";

const checkoutStockPolicyOptions = (t: TFunction): SelectOption[] => [
  {
    label: t("forms.options.checkoutStockPolicy.allow", {
      defaultValue: "Allow checkout and warn",
    }),
    value: "allow",
  },
  {
    label: t("forms.options.checkoutStockPolicy.block", {
      defaultValue: "Block checkout and reserve stock",
    }),
    value: "block",
  },
];

export const heroForm = (t: TFunction, imagePropsPrefix?: string) => {
  const { ...heroCard } = new HeroCard();
  const heroFormData: FormData = {
    allowMultiple: true,
    allowToggle: false,
    sections: [
      {
        fieldArray: true,
        name: "cards",
        initialValues: heroCard,
        heading: t("forms.headings.cards", { defaultValue: "Cards" }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "image",
            label: t("forms.labels.photo", { defaultValue: "Photo" }),
            isRequired: true,
            type: "fileManager",
            imageProps: {
              prefix: imagePropsPrefix,
              includePrefix: false,
              maxNumber: 1,
              maxFileSize: 10,
              acceptType: ["jpeg", "jpg", "png"],
            },
          },
          {
            name: "title",
            label: t("forms.labels.title", { defaultValue: "Title" }),
            isRequired: true,
            placeholder: t("forms.placeholders.myTitle", {
              defaultValue: "My title",
            }),
          },
          {
            name: "subtitle",
            label: t("forms.labels.subtitle", { defaultValue: "Subtitle" }),
            isRequired: true,
            placeholder: t("forms.placeholders.mySubtitle", {
              defaultValue: "My subtitle",
            }),
          },
          {
            name: "buttonLabel",
            label: t("forms.labels.buttonTitle", {
              defaultValue: "Button Title",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.myTitle", {
              defaultValue: "My title",
            }),
          },
          {
            name: "buttonUrl",
            label: t("forms.labels.buttonLink", {
              defaultValue: "Button Link",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.enterLink", {
              defaultValue: "Enter link",
            }),
          },
          {
            name: "active",
            label: t("forms.labels.active", { defaultValue: "Active" }),
            type: "checkbox",
            isRequired: false,
          },
          // { name: 'buttonColor', label: 'Tytuł', isRequired: true, placeholder: 'Mój tytuł' },
          // { name: 'backgroundColor', label: 'Tytuł', isRequired: true, placeholder: 'Mój tytuł' },
          // { name: 'textColor', label: 'Tytuł', isRequired: true, placeholder: 'Mój tytuł' },
        ],
      },
    ],
  };
  return heroFormData;
};

export const storeSettingsForm = (t: TFunction) => {
  const _storeSettingsForm: FormData = {
    allowMultiple: true,
    allowToggle: false,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.headings.buying", { defaultValue: "Buying" }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "buying.enabled",
            placeholder: t("forms.placeholders.enableBuying", {
              defaultValue: "Enable buying?",
            }),
            type: "checkbox",
          },
          {
            name: "buying.min",
            label: t("forms.labels.minimumPurchaseValue", {
              defaultValue: "Minimum purchase value",
            }),
            placeholder: t("forms.placeholders.example_5000", {
              defaultValue: "5000",
            }),
            type: "number",
          },
          {
            name: "buying.max",
            label: t("forms.labels.maximumPurchaseValue", {
              defaultValue: "Maximum purchase value",
            }),
            placeholder: t("forms.placeholders.example_5000000", {
              defaultValue: "5000000",
            }),
            type: "number",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.freeShipping", {
          defaultValue: "Free shipping",
        }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "freeShipping.enabled",
            placeholder: t("forms.placeholders.enableFreeShipping", {
              defaultValue: "Enable free shipping?",
            }),
            type: "checkbox",
          },
          {
            name: "freeShipping.min",
            label: t("forms.labels.minimumPurchaseValue", {
              defaultValue: "Minimum purchase value",
            }),
            placeholder: t("forms.placeholders.example_500000", {
              defaultValue: "500000",
            }),
            type: "number",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.underConstruction", {
          defaultValue: "Under construction",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "underConstruction.enabled",
            placeholder: t("forms.placeholders.enableUnderConstruction", {
              defaultValue: "Enable under construction mode?",
            }),
            type: "checkbox",
          },
          {
            name: "underConstruction.message",
            label: t("forms.labels.message", { defaultValue: "Message" }),
            placeholder: t("forms.placeholders.siteUnderConstruction", {
              defaultValue: "Site is under construction",
            }),
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.checkout", {
          defaultValue: "Checkout",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "checkout.invoiceEnabled",
            placeholder: t("forms.placeholders.enableCheckoutInvoice", {
              defaultValue: "Show invoice option in checkout?",
            }),
            type: "checkbox",
          },
          {
            name: "checkout.stockPolicy",
            label: t("forms.labels.checkoutStockPolicy", {
              defaultValue: "Store checkout stock policy",
            }),
            placeholder: t("forms.placeholders.selectCheckoutStockPolicy", {
              defaultValue: "Select stock policy",
            }),
            type: "select",
            options: checkoutStockPolicyOptions(t),
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.express", {
          defaultValue: "Express processing",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "express.enabled",
            placeholder: t("forms.placeholders.enableExpress", {
              defaultValue: "Enable express processing?",
            }),
            type: "checkbox",
          },
          {
            name: "express.percent",
            label: t("forms.labels.expressPercent", {
              defaultValue: "Express percentage markup",
            }),
            placeholder: t("forms.placeholders.example_20", {
              defaultValue: "20",
            }),
            type: "number",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.shippingCosts", {
          defaultValue: "Shipping costs",
        }),
        isDefaultExpanded: false,
        fields: ShippingOptionsAsArray.map((option) => {
          return {
            name: `shippingOptionsPrices.${option}`,
            label: t(`ShippingOptions.${option}`, { defaultValue: option }),
            placeholder: t("forms.placeholders.zero", { defaultValue: "0" }),
            type: "number",
          };
        }),
      },
    ],
  };
  return _storeSettingsForm;
};

export const channelForm = (
  warehousesAsOptions: SelectOption[],
  t: TFunction,
) => {
  const _channelForm: FormData = {
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
          {
            name: "currency",
            label: t("forms.labels.currency", { defaultValue: "Currency" }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectCurrency", {
              defaultValue: "Select currency...",
            }),
            type: "select",
            options: CurrencyEnumAsOptions,
            updateDisabled: true,
          },
          {
            name: "warehouses",
            label: t("forms.labels.warehouses", { defaultValue: "Warehouses" }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectWarehouses", {
              defaultValue: "Select warehouses...",
            }),
            type: "multiSelect",
            options: warehousesAsOptions,
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.notificationSettings", {
          defaultValue: "Notification Settings",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "notifications.email",
            label: t("forms.labels.notificationEmail", {
              defaultValue: "Primary Notification Email",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.notificationEmail", {
              defaultValue: "notifications@example.com",
            }),
          },
          {
            name: "notifications.emails",
            label: t("forms.labels.notificationEmails", {
              defaultValue: "Additional Notification Emails",
            }),
            helperText: t("forms.helperTexts.notificationEmails", {
              defaultValue:
                "Enter email addresses separated by commas or new lines",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.notificationEmails", {
              defaultValue:
                "team@example.com\nsupport@example.com\nmanager@example.com",
            }),
            type: "textarea",
          },
          {
            name: "notifications.enabledTypes",
            label: t("forms.labels.enabledNotificationTypes", {
              defaultValue: "Enabled Notification Types",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.selectNotificationTypes", {
              defaultValue: "Select notification types...",
            }),
            type: "multiSelect",
            options: NotificationTypeAsOptions,
            enumName: "NotificationType",
          },
        ],
      },
    ],
  };
  return _channelForm;
};

export const productTypeForm = (t: TFunction): FormData => ({
  allowMultiple: true,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: t("forms.headings.basicInformation", {
        defaultValue: "Basic information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "id",
          label: t("forms.labels.identifier", { defaultValue: "Identifier" }),
          helperText: t("forms.helperTexts.identifier", {
            defaultValue:
              "No spaces, no Polish characters, each next word capitalized (except the first), e.g. decorativePaper",
          }),
          isRequired: true,
          placeholder: t("forms.placeholders.identifier", {
            defaultValue: "Identifier",
          }),
          updateDisabled: true,
        },
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.name", { defaultValue: "Name" }),
        },
        {
          name: "isShippable",
          placeholder: t("forms.placeholders.shippingPossible", {
            defaultValue: "Shipping possible",
          }),
          type: "checkbox",
          updateDisabled: true,
        },
      ],
    },
  ],
});

export const productForm = (
  t: TFunction,
  imagePropsPrefix?: string,
  printingMethodOptions: SelectOption[] = getPrintingMethodOptions(null, t),
  unitOptions: SelectOption[] = getUnitOptions(null, t),
) => {
  const productFormData: FormData = {
    allowMultiple: false,
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
            name: "priceType",
            label: t("forms.labels.priceType", { defaultValue: "Price type" }),
            isRequired: true,
            placeholder: t("forms.placeholders.priceType", {
              defaultValue: "Price type",
            }),
            type: "select",
            options: PriceTypeAsOptions,
            enumName: "PriceTypeEnum",
          },
          {
            name: "name",
            label: t("forms.labels.name", { defaultValue: "Name" }),
            isRequired: true,
            placeholder: t("forms.placeholders.name", { defaultValue: "Name" }),
          },
          {
            name: "spec.images",
            label: t("forms.labels.photos", { defaultValue: "Photos" }),
            isRequired: false,
            type: "fileManager",
            imageProps: {
              prefix: imagePropsPrefix,
              includePrefix: false,
              maxNumber: 5,
              maxFiles: 10,
              maxFileSize: 10,
              acceptType: ["jpeg", "jpg", "png"],
            },
          },
          {
            name: "description",
            label: t("forms.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.description", {
              defaultValue: "Description",
            }),
            type: "textarea",
            mdxPreview: true,
            watch: true,
            generate: {
              systemPrompt: `
You are an expert in writing product descriptions who can create engaging, informative, and SEO-friendly descriptions for product pages.

Your goal: Generate a compelling product description in MDX format based on the provided context.

Instructions:

Input: You will receive the following context as input:

Name: Product name.

Description: Existing product description. It may be empty, contain a short description, or contain additional instructions for you.

AttributeOptions: List of selected attributes and their values. These are provided as raw values (e.g., "premium-leather" instead of "Premium Leather").

Output: Generate a product description formatted in MDX format. Use the same language as the product name and description provided in the context.

Key principles for product descriptions:

Attractive and persuasive: Write in a way that will capture the reader's attention and highlight the product's benefits.

Informative: Provide key details about the product, answering potential customer questions.

Language: The description should be in the same language as the product name.

SEO-friendly: Include relevant keywords naturally to improve search engine visibility.

Benefit-oriented: Focus on how the product solves a problem or improves the customer's life, not just its features.

Target audience: Consider who is most likely to buy this product and adjust the language accordingly.

Clear and concise: Use clear, easy-to-understand language and avoid jargon when possible. Break up text with formatting to make it easier to read.

Highlight key features: Emphasize the most important and unique aspects of the product.

Use keywords naturally: Integrate relevant keywords into the description in a way that sounds natural, not forced.

Answer potential questions: Think about what a customer would want to know before purchasing the product and answer those questions.

MDX formatting guidelines:

Use Markdown syntax for formatting (e.g., ## Heading 2, **bold text**, *italic text*, - bullet point).

You can use <br /> for line breaks.

Consider using headings (##, ###) to structure the description.

Use bullet points or numbered lists to highlight features or benefits.

Avoid excessive formatting or overly complex MDX elements.

Using the provided context:

Name: Always use the name prominently, especially in headings.

Description: If a description is provided, use it as a starting point or integrate its information. If it contains instructions, follow them. If it's empty, create a description from scratch.

attributeOptions: Seamlessly incorporate these attributes into the description. Format attribute values to be user-friendly. For example, if attributeOptions contains {"material": "premium-leather"}, you might write "Made from the finest premium leather...".

Important notes:

Brand voice: Maintain a consistent and appropriate brand voice if suggested by the product name or existing description.

Accuracy: Ensure all information presented is accurate and reflects the product.

Call to action (optional): While not strictly required, consider subtle encouragement to purchase (e.g., "Upgrade your [use case] with this...").

Length: Aim for the description to be comprehensive but not overly long. Find a balance between providing enough information and maintaining reader interest.

Prioritize key information: Place the most important details and benefits at the beginning.

Example input/output:

Input:
{
"name": "Luxury Leather Wallet - Brown",
"description": "This premium wallet is handcrafted from genuine leather.",
"attributeOptions": {
"material": "genuine-leather",
"color": "brown",
"features": ["multiple-card-slots", "coin-pocket"]
}
}

Output:

## Luxury Leather Wallet - Brown

This luxury leather wallet in rich brown is the perfect combination of style and functionality. Handcrafted from genuine leather, this wallet offers a refined look and durable construction that will last for years.

With multiple card slots, you'll have plenty of space to organize your essential cards. The convenient coin pocket provides additional versatility, keeping your loose change secure.

Experience the touch of quality with this elegant and practical leather wallet.

Input:
{
"name": "Ergonomic Mesh Office Chair",
"description": "New model with adjustable lumbar support.",
"attributeOptions": {
"type": "office-chair",
"material": "breathable-mesh",
"adjustability": ["adjustable-lumbar-support", "height-adjustable-arms"]
}
}

Output:

## Ergonomic Mesh Office Chair

Experience exceptional comfort and support with our new ergonomic mesh office chair. Designed for long work hours, this office chair features adjustable lumbar support to promote healthy posture and reduce back strain.

The breathable mesh material ensures optimal airflow, keeping you cool and comfortable throughout the day. Enjoy customized comfort with height-adjustable armrests, allowing you to find the perfect ergonomic setup.

Upgrade your workspace with this essential ergonomic seating solution.
              `,
              context: ["name", "description", "attributeOptions"],
              stream: true,
            },
          },
          {
            name: "category",
            label: t("forms.labels.category", { defaultValue: "Category" }),
            isRequired: false,
            placeholder: t("forms.placeholders.selectCategory", {
              defaultValue: "Select category...",
            }),
            type: "search",
            searchFor: "categories",
            searchResult: "object",
          },
          {
            name: "difficulty",
            label: t("forms.labels.difficulty", { defaultValue: "Difficulty" }),
            helperText: t("forms.helperTexts.difficulty", {
              defaultValue: "Difficulty on a scale from 1 to 10.",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.difficulty_1_10", {
              defaultValue: "Difficulty from 1 to 10",
            }),
            type: "slider",
            min: 1,
            max: 10,
          },
          {
            name: "threeDModel",
            label: t("forms.placeholders.3dModelPreview", {
              defaultValue: "3D preview template",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.selectModel", {
              defaultValue: "Select model...",
            }),
            type: "select",
            options: ThreeDModelsAsOptions,
            enumName: "ThreeDModels",
          },
          {
            name: "recommended",
            placeholder: t("forms.placeholders.recommendOnHomepage", {
              defaultValue: "Recommend product on homepage",
            }),
            type: "checkbox",
          },
          {
            name: "customSize",
            placeholder: t("forms.placeholders.allowCustomSize", {
              defaultValue: "Allow custom size",
            }),
            type: "checkbox",
          },
          {
            name: "allowCustomPrice",
            placeholder: t("forms.placeholders.allowCustomPrice", {
              defaultValue: "Allow custom price",
            }),
            type: "checkbox",
          },
          {
            name: "active",
            isRequired: false,
            placeholder: t("forms.placeholders.active", {
              defaultValue: "Active",
            }),
            type: "checkbox",
          },
          {
            name: "prefferedUnit",
            label: t("forms.labels.preferredUnit", {
              defaultValue: "Preferred Unit",
            }),
            isRequired: true,
            type: "select",
            options: unitOptions,
            enumName: "Unit",
          },
          {
            name: "specialNotes",
            label: t("forms.labels.specialNotes", {
              defaultValue: "Special Notes",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.specialNotes", {
              defaultValue: "Special Notes",
            }),
            type: "textarea",
          },
        ],
      },
      {
        fieldArray: true,
        name: "customSizes",
        initialValues: { label: "A4 (210 x 297 mm)", width: 210, height: 297 },
        heading: t("forms.headings.customSizes", {
          defaultValue: "Custom Sizes",
        }),
        dependsOn: "customSize",
        dependencyValue: "true",
        isDefaultExpanded: false,
        stackDirection: "row",
        fields: [
          {
            name: "label",
            label: t("forms.labels.customSizeName", { defaultValue: "Name" }),
            isRequired: true,
            placeholder: t("forms.placeholders.customSizeName", {
              defaultValue: "A4 210 x 297 mm",
            }),
          },
          {
            name: "width",
            label: t("forms.labels.width", { defaultValue: "Width" }),
            isRequired: true,
            placeholder: t("forms.placeholders.width", { defaultValue: "210" }),
            type: "number",
          },
          {
            name: "height",
            label: t("forms.labels.height", { defaultValue: "Height" }),
            isRequired: true,
            placeholder: t("forms.placeholders.height", {
              defaultValue: "297",
            }),
            type: "number",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.shipping", { defaultValue: "Shipping" }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "shipping.types",
            label: t("forms.labels.availableDeliveryTypes", {
              defaultValue: "Available delivery types",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.selectDeliveryTypes", {
              defaultValue: "Select delivery types...",
            }),
            type: "multiSelect",
            options: ShippingTypesAsOptions,
            enumName: "ShippingTypes",
          },
          ...(process.env.NODE_ENV === "development"
            ? [
                {
                  name: "designatedPickupAreaIds",
                  label: t("forms.labels.designatedPickupAreas", {
                    defaultValue: "Designated Pickup Areas",
                  }),
                  isRequired: false,
                  placeholder: t("forms.placeholders.selectPickupAreas", {
                    defaultValue: "Select pickup areas...",
                  }),
                  type: "multiSelect" as "multiSelect",
                  options: [],
                  enumName: "DesignatedPickupAreas",
                },
              ]
            : []),
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.specification", {
          defaultValue: "Specification",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "spec.defaultOrder",
            label: t("forms.labels.defaultOrder", {
              defaultValue: "Default Order",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.defaultOrder", {
              defaultValue: "1",
            }),
            type: "number",
          },
          {
            name: "spec.minimumOrder",
            label: t("forms.labels.minimumOrder", {
              defaultValue: "Minimum Order",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.minimumOrder", {
              defaultValue: "1",
            }),
            type: "number",
          },
          {
            name: "spec.maximumOrder",
            label: t("forms.labels.maximumOrder", {
              defaultValue: "Maximum Order",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.maximumOrder", {
              defaultValue: "100",
            }),
            type: "number",
          },
          {
            name: "spec.step",
            label: t("forms.labels.step", { defaultValue: "Step" }),
            isRequired: true,
            placeholder: t("forms.placeholders.step", { defaultValue: "1" }),
            type: "number",
          },
          {
            name: "spec.minimumWidth",
            label: t("forms.labels.minimumWidth", {
              defaultValue: "Minimum Width",
            }),
            placeholder: t("forms.placeholders.minimumWidth", {
              defaultValue: "100",
            }),
            type: "number",
            dependsOn: "customSize",
            dependencyValue: "true",
          },
          {
            name: "spec.maximumWidth",
            label: t("forms.labels.maximumWidth", {
              defaultValue: "Maximum Width",
            }),
            placeholder: t("forms.placeholders.maximumWidth", {
              defaultValue: "1000",
            }),
            type: "number",
            dependsOn: "customSize",
            dependencyValue: "true",
          },
          {
            name: "spec.widthStep",
            label: t("forms.labels.widthStep", { defaultValue: "Width Step" }),
            placeholder: t("forms.placeholders.widthStep", {
              defaultValue: "1",
            }),
            type: "number",
            dependsOn: "customSize",
            dependencyValue: "true",
          },
          {
            name: "spec.minimumHeight",
            label: t("forms.labels.minimumHeight", {
              defaultValue: "Minimum Height",
            }),
            placeholder: t("forms.placeholders.minimumHeight", {
              defaultValue: "100",
            }),
            type: "number",
            dependsOn: "customSize",
            dependencyValue: "true",
          },
          {
            name: "spec.maximumHeight",
            label: t("forms.labels.maximumHeight", {
              defaultValue: "Maximum Height",
            }),
            placeholder: t("forms.placeholders.maximumHeight", {
              defaultValue: "1000",
            }),
            type: "number",
            dependsOn: "customSize",
            dependencyValue: "true",
          },
          {
            name: "spec.heightStep",
            label: t("forms.labels.heightStep", {
              defaultValue: "Height Step",
            }),
            placeholder: t("forms.placeholders.heightStep", {
              defaultValue: "1",
            }),
            type: "number",
            dependsOn: "customSize",
            dependencyValue: "true",
          },
          {
            name: "spec.validateRatio",
            isRequired: false,
            placeholder: t("forms.placeholders.validateRatio", {
              defaultValue: "Verify Ratio",
            }),
            type: "checkbox",
            dependsOn: "customSize",
            dependencyValue: "true",
          },
          {
            name: "spec.minimumRatio",
            label: t("forms.labels.minimumRatio", {
              defaultValue: "Minimum Ratio",
            }),
            placeholder: t("forms.placeholders.minimumRatio", {
              defaultValue: "0.2",
            }),
            type: "number",
            dependsOn: "customSize",
            dependencyValue: "true",
          },
          {
            name: "spec.maximumRatio",
            label: t("forms.labels.maximumRatio", {
              defaultValue: "Maximum Ratio",
            }),
            placeholder: t("forms.placeholders.maximumRatio", {
              defaultValue: "5",
            }),
            type: "number",
            dependsOn: "customSize",
            dependencyValue: "true",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.filePreparation", {
          defaultValue: "File Preparation",
        }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "designSpec.dpi",
            label: t("forms.labels.dpi", { defaultValue: "Resolution (dpi)" }),
            isRequired: true,
            placeholder: t("forms.placeholders.dpi", { defaultValue: "300" }),
            type: "number",
          },
          {
            name: "designSpec.bleed",
            label: t("forms.labels.bleed", { defaultValue: "Bleed" }),
            isRequired: true,
            placeholder: t("forms.placeholders.bleed", { defaultValue: "4" }),
            type: "number",
          },
          {
            name: "designSpec.includeBleed",
            placeholder: t("forms.placeholders.includeBleed", {
              defaultValue: "Include bleed in price calculation",
            }),
            type: "checkbox",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.seo", { defaultValue: "SEO" }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "seo.slug",
            label: t("forms.labels.slug", { defaultValue: "Slug" }),
            isRequired: true,
            placeholder: t("forms.placeholders.slug", { defaultValue: "slug" }),
            generate: {
              systemPrompt: `
  You are an SEO expert who can create concise and effective SEO slugs for product pages.

  **Your goal:** Generate an SEO-friendly URL slug based on the provided product name.

  **Instructions:**

  * **Input:** You will receive a product name as input.
  * **Output:** Generate a single SEO slug in lowercase. Use the same language as the product name provided.
  * **Key principles for SEO slugs:**
    * **Keywords:** Include the most relevant keywords from the product name. Prioritize terms that users are likely to search for.
    * **Hyphens:** Separate words with hyphens (-). Don't use underscores, spaces, or other special characters.
    * **Lowercase:** All characters should be lowercase.
    * **Conciseness:** Keep the slug concise and to the point. Avoid unnecessary words like "the", "a", "an", "and", etc., unless they are key for keyword relevance.
    * **Relevance:** The slug should accurately reflect the product.
    * **Avoid stop words:** Generally exclude common stop words unless they are key to meaning or keyword relevance.
    * **Focus on core description:** Extract the core descriptive elements of the product.
    * **Consider variants:** If the product name includes details like color, size, or model number, consider whether including them in the slug will improve SEO or make it too long. Prioritize core keywords first. You can potentially include these details if they are relevant keywords.
    * **Remove special characters:** Eliminate any symbols, punctuation (except hyphens), or non-alphanumeric characters.
    * **Clean and readable:** The slug should be easy to understand for both search engines and humans.

  **Example input/output:**

  * **Input:** "Premium Leather Backpack for Women - Brown"
  * **Output:** premium-leather-backpack-women

  * **Input:** "High-Performance Gaming Mouse with RGB Lighting"
  * **Output:** high-performance-gaming-mouse

  * **Input:** "Organic Cotton Baby Onesie - Newborn Size, Blue"
  * **Output:** organic-cotton-baby-onesie

  * **Input:** "Samsung Galaxy S23 Ultra 256GB Unlocked Smartphone"
  * **Output:** samsung-galaxy-s23-ultra

  **Important notes:**

  * **Brand names:** Include brand names if they are relevant keywords.
  * **Model numbers:** Include model numbers if they are commonly searched for.
  * **Prioritize clarity and relevance over strict adherence to brevity when it comes to key terms.**

  **Start generating the SEO slug when you receive the product name.**
              `,
              context: ["name"],
            },
          },
          {
            name: "seo.title",
            label: t("forms.labels.title", { defaultValue: "Title" }),
            isRequired: false,
            placeholder: t("forms.placeholders.title", {
              defaultValue: "Title",
            }),
            generate: {
              systemPrompt: `
  You are an SEO expert who can create compelling and concise SEO titles for product pages.

  **Your goal:** Generate an SEO-friendly title for a product page based on the provided product name and description, adhering to a strict character limit of 50-60 characters.

  **Instructions:**

  * **Input:** You will receive a product name and product description.
  * **Output:** Generate a single, SEO-optimized title with a 50-60 character limit. Use the same language as the product name and description provided.
  * **Key principles for SEO titles:**
    * **Keywords:** Include the most relevant and highly intentional keywords from both the product name and description. Prioritize terms that users are likely to search for.
    * **Conciseness:** Be concise and impactful. Every word counts due to the character limit.
    * **Relevance:** The title must accurately reflect the product and its main offering.
    * **Clarity:** The title should be easy to understand for users at first glance.
    * **Front-loaded keywords:** Place the most important keywords at the beginning of the title if possible.
    * **Benefit-oriented (optional but recommended):** If space allows, try to include a benefit or unique selling proposition.
    * **Brand inclusion (consider):** Include brand name if it's a strong keyword or helps with recognition, but prioritize main product keywords within the limit.
    * **Avoid stop words (generally):** Minimize use of common stop words unless they're essential for readability or key phrases.
    * **Use natural language:** While optimizing for keywords, ensure the title is natural and not just a string of keywords.
    * **Compelling and clickable:** Try to make the title enticing for users to click on search results.

  **Character limit enforcement:**

  * **Strict limit:** The generated title **must** be between 50 and 60 characters (inclusive). Do not exceed or fall below this range.

  **Example input/output:**

  * **Input (product name):** "Luxury Leather Wallet for Men - Brown, RFID Blocking"
  * **Input (product description):** "Made from top-grain leather, this men's wallet features RFID blocking technology to protect your cards. Sleek and stylish design in classic brown color. Multiple card slots and bill compartment."
  * **Output:** Luxury Leather RFID Wallet for Men, Brown | Shop Now

  * **Input (product name):** "High-Performance Gaming Mouse with RGB Lighting and Adjustable DPI"
  * **Input (product description):** "Experience ultimate gaming control with this high-performance mouse. Features customizable RGB lighting, adjustable DPI settings, and ergonomic design for comfort during long gaming sessions."
  * **Output:** High-Performance RGB Gaming Mouse with Adjustable DPI

  * **Input (product name):** "Organic Cotton Baby Onesie - Newborn Size, Soft Blue"
  * **Input (product description):** "Made from 100% organic cotton, this soft blue baby onesie is perfect for newborns. Gentle on sensitive skin and easy to care for."
  * **Output:** Organic Cotton Baby Onesie Newborn Soft Blue

  **Important notes:**

  * **Prioritize the most important keywords within the character limit.**
  * **Consider using separators like "|" or "-" if it improves readability and doesn't sacrifice valuable keyword space.**
  * **If the product name is very long, focus on the main features and differentiating benefits in the title.**

  **Start generating the SEO title when you receive the product name and description.**
              `,
              context: ["name", "seo.description"],
            },
          },
          {
            name: "seo.description",
            label: t("forms.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.description", {
              defaultValue: "Description",
            }),
            type: "textarea",
            generate: {
              systemPrompt: `
  You are an SEO expert who can create compelling and concise SEO descriptions for product pages.

  **Your goal:** Generate an SEO-friendly meta description for a product page based on the provided product name and description, adhering to a character limit of approximately 150-160 characters.

  **Instructions:**

  * **Input:** You will receive a product name and product description.
  * **Output:** Generate a single, SEO-optimized meta description within the approximate 150-160 character limit. Use the same language as the product name and description provided.
  * **Key principles for SEO descriptions:**
    * **Keywords:** Naturally include the most relevant and highly intentional keywords from the product name and description. Focus on terms that users are likely to search for.
    * **Summary:** Concisely summarize the key features, benefits, and unique selling points of the product.
    * **Value proposition:** Clearly communicate the value the product offers to the customer. Why should they buy it?
    * **Call to action (recommended):** Encourage clicking with a subtle call to action (e.g., "Shop now", "Learn more", "Discover our...").
    * **Relevance:** The description must accurately reflect the product and page content.
    * **Conciseness:** Be concise and impactful within the character limit. Every word should have meaning.
    * **Compelling and clickable:** Write a description that is engaging and encourages users to click on search results.
    * **Uniqueness:** Aim for a unique description for each product page to avoid duplicate content issues.
    * **Benefit-focused:** Focus on the benefits the customer will gain from using the product.
    * **Natural language:** Write in a clear, natural, and grammatically correct way. Avoid keyword stuffing.

  **Character limit enforcement:**

  * **Target range:** Aim for the description to be within 150-160 characters. While search engines may display slightly more or less, this is a good target for readability and impact.

  **Example input/output:**

  * **Input (product name):** "Luxury Leather Wallet for Men - Brown, RFID Blocking"
  * **Input (product description):** "Made from top-grain leather, this men's wallet features RFID blocking technology to protect your cards. Sleek and stylish design in classic brown color. Multiple card slots and bill compartment."
  * **Output:** Discover our premium brown leather RFID wallet for men. Secure, stylish, and durable. Shop now and protect your cards in luxury.

  * **Input (product name):** "High-Performance Gaming Mouse with RGB Lighting and Adjustable DPI"
  * **Input (product description):** "Experience ultimate gaming control with this high-performance mouse. Features customizable RGB lighting, adjustable DPI settings, and ergonomic design for comfort during long gaming sessions."
  * **Output:** Elevate your gaming with our high-performance RGB gaming mouse! Enjoy adjustable DPI, ergonomic comfort, and stunning lighting.

  * **Input (product name):** "Organic Cotton Baby Onesie - Newborn Size, Soft Blue"
  * **Input (product description):** "Made from 100% organic cotton, this soft blue baby onesie is perfect for newborns. Gentle on sensitive skin and easy to care for."
  * **Output:** Shop our soft blue organic cotton baby onesie for newborns. Gentle on skin, easy care. Perfect for your little one!

  **Important notes:**

  * **Prioritize the most compelling benefits and key features within the character limit.**
  * **Focus on what makes this product stand out.**
  * **Use strong action verbs to encourage clicking.**
  * **Consider the search intent of users looking for this type of product.**
  * **Ensure the description accurately reflects the product page content.**

  **Start generating the SEO description when you receive the product name and description.**
              `,
              context: ["name", "description"],
            },
          },
        ],
      },
      {
        fieldArray: false,
        heading: "Dostępność",
        isDefaultExpanded: false,
        fields: [
          {
            name: "availability.published",
            placeholder: t("forms.placeholders.published", {
              defaultValue: "Published",
            }),
            type: "checkbox",
          },
          {
            name: "availability.publicationString",
            label: t("forms.labels.publicationDate", {
              defaultValue: "Publication Date",
            }),
            helperText: t("forms.helperTexts.publicationDate", {
              defaultValue: "When the product is set to be published.",
            }),
            placeholder: "",
            isRequired: true,
            type: "date",
          },
          {
            name: "availability.availableForPurchase",
            placeholder: t("forms.placeholders.availableForPurchase", {
              defaultValue: "Available for Purchase",
            }),
            type: "checkbox",
          },
          {
            name: "availability.expirationString",
            label: t("forms.labels.expirationDate", {
              defaultValue: "Expiration Date",
            }),
            helperText: t("forms.helperTexts.expirationDate", {
              defaultValue: "When the product is set to expire.",
            }),
            placeholder: "",
            isRequired: false,
            clearable: true,
            type: "date",
          },
        ],
      },
      {
        fieldArray: true,
        name: "volumes",
        initialValues: { value: 1 },
        heading: t("forms.headings.volumes", { defaultValue: "Volumes" }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "value",
            label: t("forms.labels.value", { defaultValue: "Value" }),
            isRequired: true,
            placeholder: t("forms.placeholders.value", { defaultValue: "100" }),
            type: "number",
          },
          {
            name: "markup",
            label: t("forms.labels.markup", { defaultValue: "Markup" }),
            isRequired: false,
            placeholder: t("forms.placeholders.markup", {
              defaultValue: "1000",
            }),
            type: "number",
          },
          {
            name: "printType",
            label: t("forms.labels.printType", { defaultValue: "Print Type" }),
            isRequired: false,
            placeholder: t("forms.placeholders.printType", {
              defaultValue: "Select print type...",
            }),
            type: "select",
            options: printingMethodOptions,
            enumName: "PrintingMethod",
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.price", { defaultValue: "Price" }),
        dependsOn: "priceType",
        dependencyValue: PriceTypeEnum.SINGLE,
        isDefaultExpanded: true,
        fields: [
          {
            name: "prices[0].value",
            label: t("forms.labels.value", { defaultValue: "Value" }),
            helperText: t("forms.helperTexts.value", {
              defaultValue:
                "In minimal currency denomination e.g. 5000 = 50.00 PLN gross",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.price", {
              defaultValue: "Price",
            }),
            type: "number",
          },
          {
            name: "prices[0].currency",
            label: t("forms.labels.currency", { defaultValue: "Currency" }),
            isRequired: true,
            placeholder: t("forms.placeholders.currency", {
              defaultValue: "Select currency...",
            }),
            type: "select",
            options: CurrencyEnumAsOptions,
          },
        ],
      },
      {
        fieldArray: true,
        name: "prices",
        initialValues: {
          value: 0,
          threshold: 0,
          currency: CurrencyEnum.PLN,
        } as Price,
        heading: t("forms.headings.priceRanges", {
          defaultValue: "Price Ranges",
        }),
        dependsOn: "priceType",
        dependencyValue: PriceTypeEnum.THRESHOLD,
        isDefaultExpanded: true,
        fields: [
          {
            name: "value",
            label: t("forms.labels.value", { defaultValue: "Value" }),
            helperText: t("forms.helperTexts.value", {
              defaultValue:
                "In minimal currency denomination e.g. 5000 = 50.00 PLN gross",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.price", {
              defaultValue: "Price",
            }),
            type: "number",
          },
          {
            name: "threshold",
            label: t("forms.labels.threshold", { defaultValue: "Threshold" }),
            helperText: t("forms.helperTexts.threshold", {
              defaultValue:
                "This threshold will be selected if the quantity (pcs., m², etc.) in the order is greater than or equal to the value given in this field and less than the next threshold if one exists",
            }),
            isRequired: true,
            placeholder: t("forms.placeholders.threshold", {
              defaultValue: "Threshold",
            }),
            type: "number",
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
        ],
      },
      // {
      //   fieldArray: false,
      //   heading: 'Podgląd pliku',
      //   isDefaultExpanded: false,
      //   fields: [
      //     { name: 'threeDModel', label: 'Wybierz model', isRequired: false, placeholder: 'Wybierz model...', type: 'select', options: ThreeDModelsAsOptions, enumName: 'ThreeDModels' },
      //   ]
      // }
    ],
  };
  return productFormData;
};
