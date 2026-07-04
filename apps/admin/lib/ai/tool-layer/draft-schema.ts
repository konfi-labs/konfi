import "server-only";

import {
  OrderFilesStatus,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  PriceTypeEnum,
  ShippingOptions,
  ShippingTypes,
  Unit,
} from "@konfi/types";
import { requireChannelAccess } from "./permissions";
import type {
  DraftResourceOptionsOutput,
  DraftSchemaOutput,
  DraftSchemaType,
  ToolLayerRuntime,
} from "./types";
import {
  enumOptions,
  resolveToolChannel,
  summarizeCatalogAttribute,
  summarizeNamedResource,
  summarizeProductTypeResource,
} from "./tool-helpers";
import type { GetDraftResourceOptionsInput } from "./tool-inputs";

const ORDER_ITEM_FIELDS = [
  {
    description: "Resolved product id from search_products/get_product.",
    name: "product.id",
    required: true,
    type: "string",
  },
  {
    description: "Human-readable item description for review.",
    name: "description",
    required: true,
    type: "string",
  },
  {
    description: "Product quantity; respect the product schema quantity step.",
    name: "quantity",
    required: true,
    type: "number",
  },
  {
    description: "Selected attribute option values keyed by attribute id.",
    name: "selectedAttributeOptions",
    required: false,
    type: "Record<string,string>",
  },
  {
    description: "Combination id returned by get_product_configuration_schema.",
    name: "calculatedCombination",
    required: false,
    type: "string",
  },
  {
    description: "Custom width and height when customSize.enabled is true.",
    name: "width/height",
    required: false,
    type: "number",
  },
  {
    description: "Page count when pageCount is present in the product schema.",
    name: "pageCount",
    required: false,
    type: "number",
  },
  {
    description:
      "Matrix/pricing volume selected from product.volumes; may differ from quantity.",
    name: "volume",
    required: false,
    type: "number",
  },
  {
    description: "Advanced finishing details keyed by advanced attribute id.",
    name: "advancedAttributeSelections",
    required: false,
    type: "Record<string,AdvancedAttributeSelection>",
  },
  {
    description: "Exact line price from explain_price, or manual override.",
    name: "customPrice",
    required: false,
    type: "number | null",
  },
] satisfies DraftSchemaOutput["itemFields"];

export function draftSchema(draftType: DraftSchemaType): DraftSchemaOutput {
  if (draftType === "product") {
    return {
      draftType,
      fields: [
        {
          description: "Display name used in admin and storefront surfaces.",
          name: "name",
          required: true,
          type: "string",
        },
        {
          description: "Catalog category id/name selected by an admin.",
          name: "category",
          required: true,
          type: "{ id: string; name: string }",
        },
        {
          description:
            "Product pricing mode such as SINGLE, THRESHOLD, MATRIX, or DYNAMIC.",
          name: "priceType",
          required: true,
          type: "PriceTypeEnum",
        },
        {
          description: "Selectable attribute ids and allowed option values.",
          name: "attributes / attributeOptions",
          required: false,
          type: "string[] / Record<string,string[]>",
        },
        {
          description:
            "Quantity, size, page-count, shipping, and availability rules.",
          name: "spec / pageCount / shipping / availability",
          required: true,
          type: "object",
        },
      ],
      notes: [
        "This tool returns a planning schema only; it does not create or update products.",
        "Call get_draft_resource_options with draftType=product to fetch real category IDs, product type IDs, attributes, options, units, shipping types, and price types.",
        "Call get_konfi_drafting_docs with topic=product or topic=pricing before building MATRIX or DYNAMIC product drafts.",
        "Call get_konfi_drafting_docs with topic=pageCount for brochures, catalogs, booklets, manuals, and other page-count products.",
        "Call get_konfi_drafting_docs with topic=money, configuration, dependencies, draftShapes, customSize, volume, advancedFinishing, blockedDrafts, atomicChanges, or examples for specialized structures.",
        "Use existing product records as references before drafting a new product.",
        "A human admin should review product drafts before a future write tool persists them.",
      ],
    };
  }

  if (draftType === "category") {
    return {
      draftType,
      fields: [
        {
          description: "Display name used in admin and storefront catalog UI.",
          name: "name",
          required: true,
          type: "string",
        },
        {
          description:
            "Short category description for admin/storefront review.",
          name: "description",
          required: false,
          type: "string",
        },
        {
          description:
            "SEO metadata. Slug is normalized before the draft opens in Konfi.",
          name: "seo",
          required: false,
          type: "{ slug?: string; title?: string; description?: string }",
        },
      ],
      notes: [
        "This tool returns a planning schema only; it does not create or update categories.",
        "Use save_draft with draftType=category to save a reviewable category draft for the selected channel.",
        "A human admin opens the returned URL, reviews the prefilled category form, and performs the final create.",
      ],
    };
  }

  if (draftType === "productType") {
    return {
      draftType,
      fields: [
        {
          description: "Stable product type document id, normalized for Konfi.",
          name: "id",
          required: false,
          type: "string",
        },
        {
          description: "Display name used in admin product type selectors.",
          name: "name",
          required: true,
          type: "string",
        },
        {
          description:
            "Existing attribute ids included in this reusable product type.",
          name: "attributes",
          required: true,
          type: "string[]",
        },
        {
          description: "Whether products using this type can be shipped.",
          name: "isShippable",
          required: false,
          type: "boolean",
        },
      ],
      notes: [
        "This tool returns a planning schema only; it does not create or update product types.",
        "Call get_draft_resource_options with draftType=productType to fetch real attribute IDs before drafting.",
        "Use save_draft with draftType=productType to save a reviewable product type draft.",
        "A human admin opens the returned URL, reviews the prefilled product type drawer, and performs the final create.",
      ],
    };
  }

  return {
    draftType,
    fields: [
      {
        description: "Existing customer id/name or a new customer draft.",
        name: "customer",
        required: true,
        type: "string | { id?: string; name: string }",
      },
      {
        description: "Contact person details for the quote/order.",
        name: "contact",
        required: true,
        type: "{ name: string; email?: string; phone?: string }",
      },
      {
        description: "Configured product lines.",
        name: "items",
        required: true,
        type: "OrderItem[]",
      },
      {
        description:
          "Delivery method, shipping address, and shipping price when known.",
        name: "shipping",
        required: false,
        type: "object",
      },
      {
        description:
          "Internal notes or customer-visible quote notes depending on UI context.",
        name: "specialNotes",
        required: false,
        type: "string",
      },
      ...(draftType === "order"
        ? [
            {
              description:
                "Payment method selected by admin or imported source.",
              name: "paymentType",
              required: true,
              type: "PaymentType",
            },
            {
              description:
                "Production deadline and current file/payment/order statuses.",
              name: "deadline / filesStatus / paymentStatus / status",
              required: true,
              type: "object",
            },
          ]
        : [
            {
              description: "How long the quote should remain valid.",
              name: "validUntil",
              required: false,
              type: "date",
            },
          ]),
    ],
    itemFields: ORDER_ITEM_FIELDS,
    notes: [
      "This tool returns a draft planning schema only; it does not create or persist data.",
      "Call get_draft_resource_options for real enum values and channel-scoped options before proposing a draft.",
      "Call get_konfi_drafting_docs when field semantics or pricing structure are unclear, especially topic=configuration, money, volume, customSize, pageCount, or advancedFinishing for line items.",
      "Search customers first and use suggest_order_items or search_products so item ids are grounded in existing data.",
      "Keep the draft in the MCP client context and present it for human review before any future write action.",
    ],
    pricingFlow: {
      description:
        "For quote/order items, call suggest_order_items first for complete configured draft lines. Use search_products, get_product_configuration_schema, and explain_price when manually refining selections or prices.",
      tools: [
        "suggest_order_items",
        "search_products",
        "get_product_configuration_schema",
        "explain_price",
      ],
    },
  };
}

export async function buildDraftResourceOptions(
  runtime: ToolLayerRuntime,
  input: GetDraftResourceOptionsInput,
): Promise<DraftResourceOptionsOutput> {
  const isProductDraft = input.draftType === "product";
  const isProductTypeDraft = input.draftType === "productType";
  const isCategoryDraft = input.draftType === "category";
  const isOrderDraft = input.draftType === "order";
  const isQuoteDraft = input.draftType === "quote";
  const channelId =
    isCategoryDraft ||
    isProductDraft ||
    isProductTypeDraft ||
    isOrderDraft ||
    isQuoteDraft
      ? await resolveToolChannel(runtime, input)
      : undefined;

  if (channelId) {
    requireChannelAccess(runtime.auth, channelId);
  }

  const [categories, attributes, productTypes] = await Promise.all([
    isProductDraft && channelId
      ? runtime.readers.listCategories({ channelId })
      : Promise.resolve([]),
    isProductDraft || isProductTypeDraft
      ? runtime.readers.listAttributes()
      : Promise.resolve([]),
    isProductDraft ? runtime.readers.listProductTypes() : Promise.resolve([]),
  ]);

  return {
    ...(isProductDraft || isProductTypeDraft
      ? {
          attributes: attributes.map(summarizeCatalogAttribute),
        }
      : {}),
    ...(isProductDraft
      ? {
          categories: categories.map(summarizeNamedResource),
          productTypes: productTypes.map(summarizeProductTypeResource),
        }
      : {}),
    ...(channelId ? { channelId } : {}),
    draftType: input.draftType,
    enums: {
      ...(isProductDraft
        ? {
            priceTypes: enumOptions(PriceTypeEnum),
            shippingTypes: enumOptions(ShippingTypes),
            units: enumOptions(Unit),
          }
        : {}),
      ...(isOrderDraft
        ? {
            filesStatuses: enumOptions(OrderFilesStatus),
            orderStatuses: enumOptions(OrderStatus),
            paymentStatuses: enumOptions(PaymentStatus),
            paymentTypes: enumOptions(PaymentType),
            shippingOptions: enumOptions(ShippingOptions),
          }
        : {}),
      ...(isQuoteDraft
        ? {
            shippingOptions: enumOptions(ShippingOptions),
          }
        : {}),
    },
    notes: [
      "Use these ids and enum values when drafting. Do not invent category, attribute, product type, shipping, payment, or status values.",
      "Keep the draft in the MCP client context; this response is a source-of-truth snapshot for selectable values.",
      "If the needed value is missing, ask the user to choose an existing value or create it in Konfi before persisting a future draft.",
    ],
  };
}
