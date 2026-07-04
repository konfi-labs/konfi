import "server-only";

import { PriceTypeEnum } from "@konfi/types";
import type { KonfiDraftingDocsOutput, KonfiDraftingDocsTopic } from "./types";

const PRICE_TYPE_GUIDES = [
  {
    draftShape: [
      "product.priceType = SINGLE",
      "product.prices contains one Price row with currency and value.",
      "Use combination.id = default when a combination object is present.",
      "Do not attach customer-selectable attributes just to describe a single fixed price.",
    ],
    priceType: PriceTypeEnum.SINGLE,
    useWhen:
      "The product has one unit price and does not need storefront option selectors.",
    validationNotes: [
      "Price.value is stored in minor currency units in persisted Product data.",
      "If the product needs selectable size, material, finishing, color, shape, or similar options, choose MATRIX or DYNAMIC instead.",
    ],
  },
  {
    draftShape: [
      "product.priceType = THRESHOLD",
      "product.prices contains Price rows with threshold and value.",
      "Threshold rows are selected by the largest threshold less than or equal to the calculated quantity.",
      "Use default combination unless the existing product form intentionally combines thresholds with combinations.",
    ],
    priceType: PriceTypeEnum.THRESHOLD,
    useWhen:
      "The product has quantity breaks but no customer-visible option matrix.",
    validationNotes: [
      "Every threshold row needs a numeric threshold.",
      "Keep thresholds sorted conceptually even though runtime can sort them.",
      "Do not use THRESHOLD for products that need option selectors.",
    ],
  },
  {
    draftShape: [
      "product.priceType = MATRIX",
      "product.attributes lists every selectable attribute id.",
      "product.attributeOptions maps each attribute id to the exact allowed option values.",
      "product.productType.attributes must include all product.attributes when a product type is selected.",
      "product.prices contains rows keyed by combination.id and volume.value.",
    ],
    priceType: PriceTypeEnum.MATRIX,
    useWhen:
      "The product price table is explicit by option combination and volume.",
    validationNotes: [
      "Combination ids must match configured attribute option values; use get_product_configuration_schema on comparable products to inspect valid ids.",
      "Each matrix price row needs an active combination, a volume, currency, and a non-negative value.",
      "Use selectedAttributeOptions as attribute-id to option-value maps when pricing existing matrix products.",
    ],
  },
  {
    draftShape: [
      "product.priceType = DYNAMIC",
      "product.attributes and product.attributeOptions still define the customer-visible selectors.",
      "product.dynamicPricing.enabled must be true.",
      "product.dynamicPricing.basePrice starts the unit price.",
      "attributeRules add selected-option price or delivery-time adjustments.",
      "globalRules add price or delivery-time results from metrics, inputs, ranges, tiers, and optional attribute conditions.",
    ],
    priceType: PriceTypeEnum.DYNAMIC,
    useWhen:
      "The price is formulaic, additive, depends on attributes/metrics, or should keep selectors while one base price applies to all options.",
    validationNotes: [
      "Dynamic pricing is additive: basePrice plus selected attribute adjustments plus every matching global rule.",
      "Runtime evaluates generated prices for product volumes with quantity and volume set to the current volume.",
      "For save_draft product payloads that prefill the Product form, use persisted Product conventions: Price.value and dynamicPricing money fields are minor currency units.",
      "If presenting human review notes, include PLN equivalents separately from the machine-readable draft values.",
      "Every attribute referenced by attributeRules or globalRules.conditions must exist in product.attributes and product.attributeOptions.",
      "Do not encode order-level add-ons as per-unit adjustments unless the source explicitly says the amount is per piece.",
      "Global rule id and label are documentation only; metric, inputId, outputMultiplierMetric, ranges, calculator fields, target, and conditions control the calculation.",
    ],
  },
] satisfies KonfiDraftingDocsOutput["priceTypes"];

function topicSections(
  topic: KonfiDraftingDocsTopic,
): KonfiDraftingDocsOutput["sections"] {
  switch (topic) {
    case "attribute":
      return [
        {
          bullets: [
            "Attributes live in the root attributes collection and are reused by products and product types.",
            "Required fields for a draft are name, type, calculated, required, format, trackStock, and options.",
            "Each option needs label, value, customFormat, hidden, and optional formatWidth, formatHeight, pages, color, image, cost, or unitsPerSheet.",
            "Use stable option values; product.attributeOptions stores option values, not labels.",
            "Set format=true only for size/format attributes whose options carry dimensions or customFormat behavior.",
            "Set pages=true only when option pages should drive page-count-like behavior.",
          ],
          title: "Attribute Drafts",
        },
      ];
    case "category":
      return [
        {
          bullets: [
            "Category drafts live under a selected channel and prefill the admin category create form.",
            "Required field is name. Optional fields are description and seo.slug/title/description.",
            "The slug is normalized before opening the draft in Konfi; use a readable source slug when one exists.",
            "Use save_draft with draftType=category for reviewable creation drafts. It does not create the final category document.",
          ],
          title: "Category Drafts",
        },
      ];
    case "productType":
      return [
        {
          bullets: [
            "Product type drafts live in the root productTypes collection and prefill the admin product type create drawer.",
            "Required fields are name and attributes. Optional fields are id/suggestedId and isShippable.",
            "Use real attribute ids from get_draft_resource_options with draftType=productType; do not invent attribute ids.",
            "For MATRIX product drafts, the selected product type should include every product attribute.",
            "If a needed attribute is missing, draft the missing attribute first or record a blocked item instead of inventing the id.",
            "Use save_draft with draftType=productType for reviewable creation drafts. It does not create the final product type document.",
          ],
          title: "Product Type Drafts",
        },
      ];
    case "order":
      return [
        {
          bullets: [
            "Ground customer data with search_customers/get_customer when the customer already exists.",
            "Use suggest_order_items for complete initial product line suggestions before drafting quote/order items.",
            "Use search_products/get_product_configuration_schema/explain_price when refining or manually configuring a product line.",
            "Call get_konfi_drafting_docs with topic=configuration, volume, money, customSize, pageCount, or advancedFinishing when a line uses those fields.",
            "Order drafts need customer, contact, items, paymentType, deadline, filesStatus, paymentStatus, and status when known.",
            "Use get_draft_resource_options with draftType=order for payment, shipping, files, payment, and order status enum values.",
          ],
          title: "Order Drafts",
        },
      ];
    case "pricing":
      return [
        {
          bullets: [
            "Use get_product_configuration_schema for existing products; it returns attributes, allowed options, custom size bounds, pageCount bounds, priceCombinations, and explain_price input guidance.",
            "For quote/order items, selectedAttributeOptions is a map of attribute id to option value.",
            "For static matrix/threshold products, pass calculatedCombination from priceCombinations when calling explain_price.",
            "For matrix-like products, volume is the matrix quantity used for price lookup and fiscal quantity.",
            "For custom format pricing, include customFormat=true with width and height.",
          ],
          title: "Pricing Existing Products",
        },
        {
          bullets: [
            "MATRIX combination ids must match the product's calculated attribute option path; labels alone are not enough.",
            "Only attributes marked calculated contribute to calculatedCombination; non-calculated selected options may still be customer-visible but do not select the matrix price row.",
            "Matrix rows without threshold use volume.value; rows with threshold use threshold selection within the chosen combination.",
            "When an exact matrix volume is missing, runtime may fall back to the nearest usable volume in the selected combination.",
          ],
          title: "Matrix Pricing Rules",
        },
        {
          bullets: [
            "DYNAMIC fixed rules add fixedValue to price or delivery time.",
            "DYNAMIC multiplier rules multiply the selected metric or input by multiplier.",
            "DYNAMIC range rules map metric/input ranges to output ranges; use adjacent range rules for volume-based unit-price curves.",
            "DYNAMIC tier rules apply inside minimumMetricValue and maximumMetricValue; omit maximumMetricValue for the final open-ended tier.",
            "Rule conditions are option gates; every condition attribute and option must also be present in the product attribute configuration.",
          ],
          title: "Dynamic Calculator Rules",
        },
        {
          bullets: [
            "For brochures, catalogs, booklets, manuals, magazines, and folded multi-page products, prefer product.pageCount over a normal attribute when the customer chooses the number of pages.",
            "Call get_konfi_drafting_docs with topic=pageCount before drafting page-count products.",
            "When pricing an existing product with a pageCount schema, pass pageCount to explain_price.",
          ],
          title: "Page Count Pricing",
        },
        {
          bullets: [
            "Use SINGLE for one fixed price with no customer selectors.",
            "Use THRESHOLD for quantity breaks without selectors.",
            "Use MATRIX for explicit combination-by-volume tables.",
            "Use DYNAMIC for formulas, additive components, attribute adjustments, or selectable products with one base price.",
          ],
          title: "Choosing Product Price Type",
        },
      ];
    case "product":
      return [
        {
          bullets: [
            "Call get_draft_resource_options with draftType=product before drafting so category, productType, attribute, option, unit, shipping, and price type values are real.",
            "Product drafts need name, category, priceType, spec, shipping, availability, prefferedUnit, prices or dynamicPricing, and optional pageCount.",
            "For MATRIX and DYNAMIC products, include product.attributes and product.attributeOptions for every customer-visible selector.",
            "If productType is set, its attributeIds should cover product.attributes.",
            "Use missingAttributes or missingOptions when the requested catalog value does not exist; do not invent ids.",
            "Use product.pageCount for booklets, catalogs, brochures, manuals, and similar products where the customer chooses page count.",
            "Call get_konfi_drafting_docs with topic=pageCount for page-count-specific rules before drafting brochure-like products.",
            "Call get_konfi_drafting_docs with topic=money, configuration, dependencies, customSize, volume, advancedFinishing, blockedDrafts, atomicChanges, or examples for specialized product structures.",
          ],
          title: "Product Drafts",
        },
      ];
    case "pageCount":
      return [
        {
          bullets: [
            "Use product.pageCount when page count is a numeric customer choice, not a finite option list like color or paper.",
            "Typical products are brochures, catalogs, booklets, magazines, manuals, menus, folded leaflets, and multi-page bound print.",
            "Do not create a regular attribute for every page count unless the product truly has a small named option set rather than a numeric range.",
            "The customer-facing page count usually means total document pages unless the source explicitly separates cover and inner pages.",
          ],
          title: "When To Use Page Count",
        },
        {
          bullets: [
            "product.pageCount.enabled turns on the page-count input.",
            "minimum and maximum are the allowed customer-entered page counts.",
            "step controls valid increments; use 2 or 4 for booklet-style products when pages must stay even or signature-compatible.",
            "coverPages is the number of pages treated as cover pages for pricing or sheet calculations; use 0 when there is no separate cover component.",
            "placement.afterAttributeId controls where the page-count input appears relative to product attributes; omit it to render before the first attribute.",
            "externalAttributeName can store a supplier/provider attribute name used during imports.",
          ],
          title: "Page Count Fields",
        },
        {
          bullets: [
            "pricing.mode=step uses base prices plus stepPrices applied per page-count step above minimum.",
            "pricing.mode=segmented uses page-count ranges, each with basePrices and stepPrices.",
            "pricing.mode=exact uses full price tables for specific page counts.",
            "If pricing.mode is missing, treat it as the legacy compact step pricing model.",
            "For DYNAMIC pricing, pageCount can also be used by globalRules through the pageCount metric and sheet-derived metrics such as innerSheetVolume, coverSheetVolume, and totalSheetVolume.",
          ],
          title: "Page Count Pricing Modes",
        },
        {
          bullets: [
            "pageCount.constraints can narrow minimum, maximum, or step for specific attribute selections.",
            "Each constraint condition references an existing attributeId and optionValues that must be present in product.attributeOptions.",
            "Use constraints for cases such as binding type, paper type, or format changing the allowed page range.",
          ],
          title: "Conditional Page Counts",
        },
        {
          bullets: [
            "When drafting a quote or order item for a page-count product, store the selected number in item.pageCount.",
            "When calling explain_price for a page-count product, pass pageCount together with quantity and any selected attributes.",
            "Do not encode page count in selectedAttributeOptions unless the product schema exposes it as a real attribute instead of product.pageCount.",
          ],
          title: "Quote And Order Items",
        },
      ];
    case "money":
      return [
        {
          bullets: [
            "Persisted Product data uses minor currency units for Price.value, dynamicPricing.basePrice, attributeRules priceAdjustment, and globalRules fixedValue/minimumOutputValue/maximumOutputValue when target=price.",
            "For PLN, 1234 means 12.34 PLN. Keep human-readable PLN notes separate from machine-readable money fields.",
            "Quote and order item totalPrice/customPrice values are also minor units in OrderItem-style drafts.",
            "grossPrices tells reviewers whether the source prices were gross; it does not change the unit convention of persisted numeric money fields.",
          ],
          title: "Money Units",
        },
        {
          bullets: [
            "When converting a supplier or user prompt value such as 4.89 PLN, store 489 in persisted product or item money fields.",
            "For DYNAMIC pricing, never put final already-multiplied totals into basePrice or rule outputs. Convert totals to unit values first, then store those unit values in minor units.",
            "If the amount unit is ambiguous, add a blockedItems entry or review note instead of silently treating major units as minor units.",
          ],
          title: "Conversion Rules",
        },
      ];
    case "configuration":
      return [
        {
          bullets: [
            "selectedAttributeOptions is a map of attribute id to option value; use option values returned by get_product_configuration_schema or get_draft_resource_options.",
            "combination is the full selected option path in product attribute order.",
            "calculatedCombination is built from selected options whose attributes have calculated=true and is the value used for MATRIX price rows.",
            "For DYNAMIC products, resolveCalculatedCombination falls back to combination or default when no calculated combination exists.",
            "descriptionCombination is display text only; do not use it as a key for pricing or persisted option selection.",
          ],
          title: "Configuration Fields",
        },
        {
          bullets: [
            "Pass calculatedCombination from get_product_configuration_schema.priceCombinations to explain_price for static matrix pricing.",
            "When drafting a product price row, Price.combination.id must match the calculated option path, not labels.",
            "Use the default combination only for SINGLE/THRESHOLD products or DYNAMIC products whose options do not drive matrix-style price rows.",
          ],
          title: "Combination Construction",
        },
      ];
    case "dependencies":
      return [
        {
          bullets: [
            "Product.attributeDependencies controls when a child attribute is active and which child option values are allowed.",
            "Each dependency rule has dependsOn plus optional dependencyValues, conditionalOptions, and when gates.",
            "A child attribute selection is valid only when all dependency rules are met by already selected parent attributes.",
            "conditionalOptions maps parent option values to the child option values allowed for that parent value.",
          ],
          title: "Attribute Dependencies",
        },
        {
          bullets: [
            "Do not include inactive dependent attributes in selectedAttributeOptions for quote/order pricing.",
            "If a requested option is hidden by dependencies, either choose a valid option from the schema or record a blockedItems entry.",
            "For product drafts, every dependency attribute id and option value must also exist in product.attributes and product.attributeOptions.",
          ],
          title: "Drafting With Dependencies",
        },
      ];
    case "draftShapes":
      return [
        {
          bullets: [
            "get_draft_schema describes the MCP save_draft payload. It is not the full admin React form state.",
            "save_draft with draftType=product wraps the provided product payload into ProductAgentDraft-like review data with product, priceType, selectedAttributes, blockedItems, missingAttributes, missingOptions, and readyForCreate.",
            "The product payload should follow persisted Product field names such as priceType, prices, dynamicPricing, attributes, attributeOptions, attributeDependencies, pageCount, customSize, customSizes, volumes, spec, shipping, availability, category, and productType.",
            "Order and quote drafts should follow OrderItem-style item fields, not product form field arrays.",
          ],
          title: "MCP Draft Shape",
        },
        {
          bullets: [
            "Product creation durable-agent plans may use human major-unit prices internally before conversion, but MCP save_draft product payloads should use persisted Product money conventions.",
            "Admin product form helpers may derive defaults such as lowPrice, highPrice, defaultPrice, and pricing previews; do not fabricate those fields unless a tool or comparable product gives valid values.",
            "When a value is required by the form but not known from the source, set readyForCreate=false and explain the gap in blockedItems.",
          ],
          title: "Form Versus Persisted Data",
        },
      ];
    case "customSize":
      return [
        {
          bullets: [
            "Set product.customSize=true only when customers can enter custom width and height.",
            "Constrain custom dimensions with product.spec.minimumWidth, maximumWidth, widthStep, minimumHeight, maximumHeight, heightStep, and optional ratio fields.",
            "Use product.customSizes for named multi-size line components; use item.customSizes when an order line contains several width/height/quantity parts.",
            "For existing product pricing, pass customFormat=true with width and height to explain_price when custom size is enabled.",
          ],
          title: "Custom Size Products",
        },
        {
          bullets: [
            "Use DynamicPricingMetric values width, height, area, perimeter, itemsPerSheet, and sheetsNeeded for custom-size formulas.",
            "When the source gives area-based pricing, keep price rules as unit/metric formulas rather than expanding every possible width and height into matrix rows.",
            "If minimum/maximum dimensions or units are missing, block the draft rather than leaving unconstrained custom sizes.",
          ],
          title: "Custom Size Pricing",
        },
      ];
    case "volume":
      return [
        {
          bullets: [
            "quantity is the number of ordered line items and is always present on OrderItem.",
            "volume is the matrix/pricing volume used for MATRIX-like products and may be different from quantity.",
            "Product.volumes is the list of available matrix quantities; Price.volume.value keys explicit matrix price rows.",
            "For SINGLE and THRESHOLD products, runtime clears configuration.volume and uses quantity against product.spec thresholds.",
          ],
          title: "Quantity Versus Volume",
        },
        {
          bullets: [
            "When a matrix price is selected, persist item.volume with the chosen Price.volume.value.",
            "For product drafts, include product.volumes and price rows keyed by combination.id plus volume.value when priceType=MATRIX.",
            "If a requested volume is missing from an existing product schema, call explain_price only if the schema permits fallback; otherwise record a blocked item or ask for an allowed volume.",
          ],
          title: "Volume In Drafts",
        },
      ];
    case "advancedFinishing":
      return [
        {
          bullets: [
            "Advanced finishing uses AttributeInputTypeEnum.ADVANCED_FINISHING.",
            "The selected option value still lives in selectedAttributeOptions under the advanced attribute id.",
            "Detailed side/spacing settings live in advancedAttributeSelections keyed by the same attribute id.",
            "Options can carry advancedPreset defaults with reinforcementSides, tunnelSides, grommets, and cutToSize.",
          ],
          title: "Advanced Finishing Attributes",
        },
        {
          bullets: [
            "advancedAttributeSelections entries use reinforcementSides, tunnelSides, optional grommets.sides, grommets.spacing, grommets.offsetStart, grommets.offsetEnd, cutToSize, notes, and optional preset.",
            "Do not model every side combination as separate normal attributes when the product uses ADVANCED_FINISHING.",
            "When the user specifies finishing details that do not exist in presets, keep the selected preset plus explicit advancedAttributeSelections or block if the product does not support advanced finishing.",
          ],
          title: "Order Item Selection",
        },
      ];
    case "blockedDrafts":
      return [
        {
          bullets: [
            "Use blockedItems whenever a draft cannot be safely created from grounded Konfi data.",
            "Product draft blocked item types are attribute, category, field, option, price, and productType.",
            "Each blocked item needs type, label, reason, and suggestedAction, with optional attributeId and optionValue.",
            "If blockedItems is non-empty, readyForCreate must be false.",
            "When the only blocker is a missing catalog value that can be added without changing existing products, also include an atomic catalogChanges entry.",
          ],
          title: "Blocked Draft Contract",
        },
        {
          bullets: [
            "Use missingAttributes for needed attributes that do not exist in Konfi; include name, reason, suggestedType, and proposed options.",
            "Use missingOptions for options missing from an existing attribute; include attributeId, attributeName, and proposed options.",
            "Build as much of the product draft as possible, but do not invent ids, option values, category ids, product type ids, price tiers, or dependencies.",
          ],
          title: "Missing Catalog Structure",
        },
      ];
    case "atomicChanges":
      return [
        {
          bullets: [
            "Use catalogChanges for small prerequisite catalog mutations that reviewers can inspect independently from the product draft.",
            "The current catalogChangesVersion is 1 and each change is append-only with id, kind, status, payload, and either target or ref.",
            "Default status is proposed; do not mark a change approved or applied unless Konfi has actually reviewed or applied it.",
            "Keep catalogSetupPlan in collectedData as the aggregate compatibility shape while catalogChanges carries the atomic detail.",
          ],
          title: "Atomic Catalog Change Drafts",
        },
        {
          bullets: [
            "Use attribute.option.add when the requested product only needs one or more missing options on an existing attribute.",
            "Use attribute.create when a required customer selector does not exist; include suggestedId, name, inputType, calculated, and optional options.",
            "Use productType.create and productType.attribute.attach when a new reusable product type is needed.",
            "Do not use catalogChanges for destructive operations, renames, deletions, or broad migrations; record those as blockedItems for manual review.",
          ],
          title: "Supported Catalog Change Kinds",
        },
        {
          bullets: [
            "If a product is otherwise complete but waits on catalogChanges, set readyForCreate=false and include blockedItems or reviewSummary explaining the prerequisite.",
            "For one missing option, prefer drafting attribute.option.add rather than putting the whole product on hold with only prose.",
            "For large ambiguous setup such as unknown pricing tables, dependencies, or supplier semantics, use blockedItems until the missing facts are grounded.",
          ],
          title: "Readiness Rules",
        },
      ];
    case "examples":
      return [
        {
          bullets: [
            "The examples array contains concrete payload fragments that MCP clients can copy structurally while replacing ids, option values, volumes, and money values with tool-grounded data.",
            "Examples are intentionally partial; call get_draft_schema, get_draft_resource_options, get_product_configuration_schema, and explain_price for live values before save_draft.",
          ],
          title: "How To Use Examples",
        },
      ];
    case "quote":
      return [
        {
          bullets: [
            "Ground customer data with search_customers/get_customer when the customer already exists.",
            "Use suggest_order_items for complete initial product line suggestions before drafting quote/order items.",
            "Use search_products/get_product_configuration_schema/explain_price when refining or manually configuring a product line.",
            "Call get_konfi_drafting_docs with topic=configuration, volume, money, customSize, pageCount, or advancedFinishing when a line uses those fields.",
            "Quote drafts need customer, contact, items, optional shipping, specialNotes, and optional validUntil.",
            "Use get_draft_resource_options with draftType=quote for valid shipping options.",
          ],
          title: "Quote Drafts",
        },
      ];
    case "overview":
      return [
        {
          bullets: [
            "Start with list_channels and use channelName for channel-scoped tools.",
            "Call get_draft_schema for the draft shape and get_draft_resource_options for real selectable values.",
            "Use business resource tools for read-only lookup of attributes, productTypes, products, orders, quotes, settings, and other admin records.",
            "Use save_draft only for completed category, productType, quote, order, or product drafts that a human will review in Konfi.",
            "Do not invent ids, enum values, attribute options, price tiers, or product type memberships.",
          ],
          title: "MCP Drafting Workflow",
        },
      ];
  }
}

function docsRelatedTools(topic: KonfiDraftingDocsTopic): string[] {
  const commonTools = [
    "list_channels",
    "get_draft_schema",
    "get_draft_resource_options",
    "search_business_records",
    "query_firestore_records",
    "get_business_record",
  ];

  switch (topic) {
    case "attribute":
    case "category":
    case "productType":
      return commonTools;
    case "order":
      return [
        ...commonTools,
        "search_customers",
        "get_customer",
        "list_orders",
        "search_orders",
        "get_order",
        "get_order_by_number",
        "search_products",
        "suggest_order_items",
        "get_product_configuration_schema",
        "explain_price",
        "save_draft",
      ];
    case "pricing":
    case "money":
    case "configuration":
    case "dependencies":
    case "customSize":
    case "volume":
    case "advancedFinishing":
      return [
        "search_products",
        "suggest_order_items",
        "get_product",
        "get_product_configuration_schema",
        "explain_price",
        "get_draft_resource_options",
        "get_konfi_drafting_docs",
      ];
    case "draftShapes":
    case "blockedDrafts":
    case "atomicChanges":
    case "examples":
      return [
        ...commonTools,
        "search_products",
        "suggest_order_items",
        "get_product",
        "get_product_configuration_schema",
        "explain_price",
        "save_draft",
      ];
    case "pageCount":
      return [
        "get_draft_schema",
        "get_draft_resource_options",
        "search_products",
        "suggest_order_items",
        "get_product",
        "get_product_configuration_schema",
        "explain_price",
        "save_draft",
      ];
    case "product":
      return [
        ...commonTools,
        "search_products",
        "get_product",
        "get_product_configuration_schema",
        "save_draft",
      ];
    case "quote":
      return [
        ...commonTools,
        "search_customers",
        "get_customer",
        "search_products",
        "suggest_order_items",
        "get_product_configuration_schema",
        "explain_price",
        "save_draft",
      ];
    case "overview":
      return [
        ...commonTools,
        "search_customers",
        "get_customer",
        "search_products",
        "suggest_order_items",
        "get_product_configuration_schema",
        "explain_price",
        "save_draft",
      ];
  }
}

function docsExamples(
  topic: KonfiDraftingDocsTopic,
): KonfiDraftingDocsOutput["examples"] {
  if (
    topic !== "examples" &&
    topic !== "overview" &&
    topic !== "atomicChanges"
  ) {
    return undefined;
  }

  return [
    {
      description:
        "Quote or order item for an existing matrix product after search_products, get_product_configuration_schema, and explain_price.",
      title: "Configured Quote Or Order Item",
      value: {
        calculatedCombination: "a4-170gsm-matte",
        customFormat: false,
        customPrice: 129900,
        description: "A4 brochure, 170 gsm matte paper, 16 pages",
        discount: { type: "fixed", value: 0 },
        pageCount: 16,
        product: { id: "product-brochure-a4", name: "A4 Brochure" },
        quantity: 100,
        selectedAttributeOptions: {
          format: "a4",
          paper: "170gsm-matte",
        },
        totalPrice: 129900,
        unit: "PCS",
        volume: 100,
      },
    },
    {
      description:
        "Persisted Product-style matrix pricing rows. Replace all ids, options, volumes, and values with grounded Konfi data.",
      title: "Matrix Product Price Rows",
      value: {
        grossPrices: true,
        priceType: PriceTypeEnum.MATRIX,
        product: {
          attributeOptions: {
            format: ["standard", "square"],
            paper: ["matte-350", "soft-touch-350"],
          },
          attributes: ["format", "paper"],
          name: "Business Cards",
          prices: [
            {
              combination: {
                active: true,
                customFormat: false,
                id: "standard-matte-350",
              },
              currency: "PLN",
              value: 5900,
              volume: { deliveryTime: 3, value: 250 },
            },
          ],
          priceType: PriceTypeEnum.MATRIX,
          volumes: [{ value: 250 }, { value: 500 }],
        },
        readyForCreate: true,
      },
    },
    {
      description:
        "Dynamic brochure sketch using pageCount and sheet-derived metrics. Money fields are persisted minor units.",
      title: "Dynamic Page Count Product",
      value: {
        grossPrices: true,
        priceType: PriceTypeEnum.DYNAMIC,
        product: {
          attributeOptions: {
            binding: ["stapled", "perfect-bound"],
            paper: ["130gsm-gloss", "170gsm-matte"],
          },
          attributes: ["binding", "paper"],
          dynamicPricing: {
            attributeRules: [
              {
                adjustments: [
                  { optionValue: "170gsm-matte", priceAdjustment: 45 },
                ],
                attributeId: "paper",
                mode: "adjust",
              },
            ],
            basePrice: 1200,
            enabled: true,
            globalRules: [
              {
                calculator: "multiplier",
                id: "inner-sheet-volume",
                label: "Inner sheet print volume",
                metric: "innerSheetVolume",
                multiplier: 8,
                target: "price",
              },
            ],
          },
          name: "Brochure",
          pageCount: {
            coverPages: 4,
            enabled: true,
            maximum: 96,
            minimum: 8,
            pricing: { mode: "step" },
            step: 4,
          },
          priceType: PriceTypeEnum.DYNAMIC,
        },
        readyForCreate: true,
      },
    },
    {
      description:
        "Product draft when catalog or price evidence is missing. Keep it reviewable but blocked.",
      title: "Blocked Product Draft",
      value: {
        blockedItems: [
          {
            label: "Foil color option",
            reason:
              "The requested holographic foil option is not present on attribute finishing.",
            suggestedAction:
              "Ask an admin to add the option or choose an existing finishing value.",
            type: "option",
            attributeId: "finishing",
            optionValue: "holographic-foil",
          },
        ],
        missingAttributes: [],
        missingOptions: [
          {
            attributeId: "finishing",
            attributeName: "Finishing",
            options: [{ label: "Holographic foil", value: "holographic-foil" }],
          },
        ],
        priceType: PriceTypeEnum.DYNAMIC,
        product: {
          attributeOptions: { finishing: ["matte", "gloss"] },
          attributes: ["finishing"],
          name: "Premium Flyer",
          priceType: PriceTypeEnum.DYNAMIC,
        },
        readyForCreate: false,
      },
    },
    {
      description:
        "Product draft that is complete except for one missing option on an existing attribute. The atomic change is reviewable independently and also rolls up into catalogSetupPlan after save_draft.",
      title: "Atomic Missing Option Draft",
      value: {
        blockedItems: [
          {
            attributeId: "paper",
            label: "Premium silk 350 gsm",
            optionValue: "premium-silk-350",
            reason: "The requested paper is not present on attribute paper.",
            suggestedAction:
              "Approve the proposed option before opening the product form.",
            type: "option",
          },
        ],
        catalogChanges: [
          {
            id: "catalog-attribute-option-add-paper-premium-silk-350",
            kind: "attribute.option.add",
            payload: {
              label: "Premium silk 350 gsm",
              reason: "Required for the requested flyer product.",
              value: "premium-silk-350",
            },
            status: "proposed",
            target: {
              attributeId: "paper",
              attributeName: "Paper",
            },
          },
        ],
        catalogChangesVersion: 1,
        missingOptions: [
          {
            attributeId: "paper",
            attributeName: "Paper",
            options: [
              {
                label: "Premium silk 350 gsm",
                value: "premium-silk-350",
              },
            ],
          },
        ],
        priceType: PriceTypeEnum.DYNAMIC,
        product: {
          attributeOptions: { paper: ["premium-silk-350"] },
          attributes: ["paper"],
          name: "Premium Flyer",
          priceType: PriceTypeEnum.DYNAMIC,
        },
        readyForCreate: false,
      },
    },
    {
      description:
        "Advanced finishing order selection: normal option value plus detailed side and spacing settings.",
      title: "Advanced Finishing Selection",
      value: {
        advancedAttributeSelections: {
          finishing: {
            cutToSize: true,
            grommets: {
              offsetEnd: 100,
              offsetStart: 100,
              sides: ["top", "bottom"],
              spacing: 500,
            },
            notes: "Grommets on top and bottom edges only.",
            preset: "grommets",
            reinforcementSides: ["top", "bottom"],
            tunnelSides: [],
          },
        },
        selectedAttributeOptions: {
          finishing: "grommets",
        },
      },
    },
  ] satisfies KonfiDraftingDocsOutput["examples"];
}

export function draftingDocs(
  topic: KonfiDraftingDocsTopic,
): KonfiDraftingDocsOutput {
  const examples = docsExamples(topic);

  return {
    notes: [
      "This documentation describes valid Konfi draft structures for MCP clients; it is not a write operation.",
      "Use returned resource ids and enum values from tools, not labels guessed from the user prompt.",
      "If the needed catalog structure is missing, keep the draft reviewable and record the missing value instead of fabricating one.",
    ],
    ...(topic === "product" ||
    topic === "pricing" ||
    topic === "pageCount" ||
    topic === "money" ||
    topic === "configuration" ||
    topic === "draftShapes" ||
    topic === "customSize" ||
    topic === "volume" ||
    topic === "advancedFinishing" ||
    topic === "examples" ||
    topic === "overview"
      ? { priceTypes: PRICE_TYPE_GUIDES }
      : {}),
    ...(examples ? { examples } : {}),
    relatedTools: docsRelatedTools(topic),
    sections: topicSections(topic),
    sourceModels: [
      "Product",
      "DynamicPricingConfig",
      "Combination",
      "Volume",
      "Price",
      "Attribute",
      "Category",
      "Option",
      "AdvancedAttributeSelection",
      "ProductType",
      "Configuration",
      "OrderItem",
      "FormattedOrderItem",
      "Quote",
      "ProductAgentDraft",
    ],
    topic,
  };
}
