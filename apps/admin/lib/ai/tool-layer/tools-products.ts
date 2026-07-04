import "server-only";

import { PriceTypeEnum, type Attribute, type Product } from "@konfi/types";
import { calcPrice, DEFAULT_COMBINATION } from "@konfi/utils";
import { ToolLayerError } from "./errors";
import {
  normalizeLimit,
  normalizePage,
  requireChannelAccess,
  requireScopes,
} from "./permissions";
import {
  countSummary,
  productSearchResult,
  summarizeProduct,
} from "./summaries";
import { auditToolCall } from "./audit";
import type {
  ExplainProductPriceInput,
  ProductDynamicPricingConfigOutput,
  PriceExplanation,
  ProductConfigurationSchema,
  ProductListOutput,
  ProductPriceRowsOutput,
  ProductPriceRowSummary,
  ProductPriceTable,
  ProductPriceTableRow,
  ProductToolSummary,
  SearchResultSummary,
  ToolLayerRuntime,
} from "./types";
import {
  requireNonEmpty,
  resolvePricesForExplanation,
  resolveToolChannel,
  summarizeConfigurationAttribute,
  toCalculationResult,
} from "./tool-helpers";
import type {
  GetProductConfigurationSchemaInput,
  GetProductDynamicPricingConfigInput,
  GetProductInput,
  ListProductPriceRowsInput,
  ListProductsInput,
  SearchProductsInput,
} from "./tool-inputs";

const DEFAULT_PRODUCT_PRICE_TABLE: ProductPriceTable = "prices";

function summarizePriceCombinations(product: Product) {
  const combinations = new Map<
    string,
    {
      id: string;
      name: string;
      priceRows: number;
    }
  >();

  for (const price of product.prices ?? []) {
    const id = price.combination?.id ?? DEFAULT_COMBINATION;
    const existing = combinations.get(id);

    if (existing) {
      existing.priceRows += 1;
      continue;
    }

    combinations.set(id, {
      id,
      name: id,
      priceRows: 1,
    });
  }

  return [...combinations.values()];
}

function summarizeProductPriceRow(
  row: ProductPriceTableRow,
): ProductPriceRowSummary {
  return {
    ...("calculatedCombination" in row
      ? { calculatedCombination: row.calculatedCombination }
      : {}),
    id: row.id,
    ...(row.isDefault !== undefined ? { isDefault: row.isDefault } : {}),
    ...("pageCount" in row ? { pageCount: row.pageCount } : {}),
    prices: row.prices,
  };
}

function numberRange(input: {
  maximum?: number;
  minimum?: number;
  step?: number;
}):
  | {
      maximum?: number;
      minimum?: number;
      step?: number;
    }
  | undefined {
  const output = {
    ...(input.maximum !== undefined ? { maximum: input.maximum } : {}),
    ...(input.minimum !== undefined ? { minimum: input.minimum } : {}),
    ...(input.step !== undefined ? { step: input.step } : {}),
  };

  return Object.keys(output).length > 0 ? output : undefined;
}

function buildProductConfigurationSchema(input: {
  attributes: Attribute[];
  channelId: string;
  product: Product;
}): ProductConfigurationSchema {
  const attributeById = new Map(
    input.attributes.map((attribute) => [attribute.id, attribute]),
  );
  const customHeight = input.product.customSize
    ? numberRange({
        maximum: input.product.spec.maximumHeight,
        minimum: input.product.spec.minimumHeight,
        step: input.product.spec.heightStep,
      })
    : undefined;
  const customWidth = input.product.customSize
    ? numberRange({
        maximum: input.product.spec.maximumWidth,
        minimum: input.product.spec.minimumWidth,
        step: input.product.spec.widthStep,
      })
    : undefined;

  return {
    ...(input.product.attributeDependencies
      ? { attributeDependencies: input.product.attributeDependencies }
      : {}),
    attributes: input.product.attributes.map((attributeId) =>
      summarizeConfigurationAttribute(
        input.product,
        attributeById.get(attributeId),
        attributeId,
      ),
    ),
    channelId: input.channelId,
    customSize: {
      enabled: input.product.customSize,
      ...(customHeight ? { height: customHeight } : {}),
      ...(customWidth ? { width: customWidth } : {}),
    },
    ...(input.product.pageCount?.enabled
      ? {
          pageCount: {
            coverPages: input.product.pageCount.coverPages,
            maximum: input.product.pageCount.maximum,
            minimum: input.product.pageCount.minimum,
            ...(input.product.pageCount.pricing?.mode
              ? { pricingMode: input.product.pageCount.pricing.mode }
              : {}),
            step: input.product.pageCount.step,
          },
        }
      : {}),
    priceCombinations: summarizePriceCombinations(input.product),
    priceType: input.product.priceType,
    pricingTool: {
      name: "explain_price",
      notes: [
        "Keep the customer's selected attributes in the MCP client context; the MCP server does not store configuration state.",
        "Use selectedAttributeOptions as a map of attribute id to option value.",
        "Use calculatedCombination from priceCombinations when pricing static matrix/threshold combinations.",
        "Call explain_price only after quantity and required product configuration inputs are known.",
      ],
      optionalInputs: [
        "selectedAttributeOptions",
        "calculatedCombination",
        "pageCount",
        "customFormat",
        "width",
        "height",
        "volume",
        "discount",
        "customPrice",
      ],
      requiredInputs: ["channelName or channelId", "productId", "quantity"],
    },
    productId: input.product.id,
    productName: input.product.name,
    quantity: {
      default: input.product.spec.defaultOrder,
      maximum: input.product.spec.maximumOrder,
      minimum: input.product.spec.minimumOrder,
      step: input.product.spec.step,
    },
    unit: input.product.prefferedUnit,
  };
}

export async function getProductConfigurationSchema(
  runtime: ToolLayerRuntime,
  input: GetProductConfigurationSchemaInput,
): Promise<ProductConfigurationSchema> {
  const productId = requireNonEmpty(input.productId, "productId");

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      productId,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["products:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const product = await runtime.readers.getProduct({
        channelId,
        productId,
      });
      if (!product) {
        throw new ToolLayerError("not_found", "Product not found.");
      }

      const attributes = await runtime.readers.getDynamicPricingAttributes(
        product.attributes,
      );

      return buildProductConfigurationSchema({
        attributes,
        channelId,
        product,
      });
    },
    outputSummary: (result) => ({
      attributes: result.attributes.length,
      priceCombinations: result.priceCombinations.length,
    }),
    requestedScopes: ["products:read"],
    runtime,
    toolName: "getProductConfigurationSchema",
  });
}

export async function searchProducts(
  runtime: ToolLayerRuntime,
  input: SearchProductsInput,
): Promise<SearchResultSummary[]> {
  const query = requireNonEmpty(input.query, "query");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 25,
  });

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      limit,
      query,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["products:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const productIds = await runtime.readers.searchProducts({
        channelId,
        limit,
        query,
      });
      const products = await runtime.readers.listProductsByIds({
        channelId,
        productIds,
      });

      return products.map(productSearchResult);
    },
    outputSummary: (result) => countSummary(result.length),
    requestedScopes: ["products:read"],
    runtime,
    toolName: "searchProducts",
  });
}

export async function listProducts(
  runtime: ToolLayerRuntime,
  input: ListProductsInput,
): Promise<ProductListOutput> {
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 50,
    maximumLimit: 100,
  });
  const page = normalizePage(input.page);

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      limit,
      page,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["products:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const products = await runtime.readers.listProducts({
        channelId,
        limit: limit + 1,
        offset: page * limit,
      });
      const pageProducts = products.slice(0, limit);

      return {
        limit,
        ...(products.length > limit ? { nextPage: page + 1 } : {}),
        page,
        products: pageProducts.map(summarizeProduct),
        totalReturned: pageProducts.length,
      };
    },
    outputSummary: (result) => ({
      count: result.totalReturned,
      nextPage: result.nextPage ?? null,
      page: result.page,
    }),
    requestedScopes: ["products:read"],
    runtime,
    toolName: "listProducts",
  });
}

export async function listProductPriceRows(
  runtime: ToolLayerRuntime,
  input: ListProductPriceRowsInput,
): Promise<ProductPriceRowsOutput> {
  const productId = requireNonEmpty(input.productId, "productId");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 50,
    maximumLimit: 100,
  });
  const page = normalizePage(input.page);
  const table = input.table ?? DEFAULT_PRODUCT_PRICE_TABLE;

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      limit,
      page,
      productId,
      table,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["products:read", "pricing:explain"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const product = await runtime.readers.getProduct({
        channelId,
        productId,
      });
      if (!product) {
        throw new ToolLayerError("not_found", "Product not found.");
      }

      const rows = await runtime.readers.listProductPriceRows({
        channelId,
        limit: limit + 1,
        offset: page * limit,
        productId,
        table,
      });
      const pageRows = rows.slice(0, limit);

      return {
        channelId,
        limit,
        ...(rows.length > limit ? { nextPage: page + 1 } : {}),
        page,
        priceType: product.priceType,
        productId,
        rows: pageRows.map(summarizeProductPriceRow),
        table,
        totalReturned: pageRows.length,
      };
    },
    outputSummary: (result) => ({
      count: result.totalReturned,
      nextPage: result.nextPage ?? null,
      page: result.page,
      table: result.table,
    }),
    requestedScopes: ["products:read", "pricing:explain"],
    runtime,
    toolName: "listProductPriceRows",
  });
}

export async function getProduct(
  runtime: ToolLayerRuntime,
  input: GetProductInput,
): Promise<ProductToolSummary> {
  const productId = requireNonEmpty(input.productId, "productId");

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      productId,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["products:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const product = await runtime.readers.getProduct({
        channelId,
        productId,
      });
      if (!product) {
        throw new ToolLayerError("not_found", "Product not found.");
      }

      return summarizeProduct(product);
    },
    outputSummary: () => ({ found: true }),
    requestedScopes: ["products:read"],
    runtime,
    toolName: "getProduct",
  });
}

export async function getProductDynamicPricingConfig(
  runtime: ToolLayerRuntime,
  input: GetProductDynamicPricingConfigInput,
): Promise<ProductDynamicPricingConfigOutput> {
  const productId = requireNonEmpty(input.productId, "productId");

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      includeLinkedPresets: input.includeLinkedPresets ?? false,
      productId,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["products:read", "pricing:explain"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const product = await runtime.readers.getProduct({
        channelId,
        productId,
      });
      if (!product) {
        throw new ToolLayerError("not_found", "Product not found.");
      }

      const config = await runtime.readers.getProductDynamicPricing({
        channelId,
        productId,
      });

      if (product.priceType !== PriceTypeEnum.DYNAMIC && !config) {
        throw new ToolLayerError(
          "validation_error",
          "Product does not use DYNAMIC pricing and has no dynamic pricing config.",
        );
      }

      const notes =
        product.priceType !== PriceTypeEnum.DYNAMIC && config
          ? [
              "This product is not DYNAMIC, but an orphan dynamic pricing config exists.",
            ]
          : [];
      const linkedPresetIds = config?.linkedPresetIds ?? [];
      const linkedPresets =
        input.includeLinkedPresets && linkedPresetIds.length > 0
          ? await runtime.readers.getDynamicPricingPresetsByIds({
              channelId,
              presetIds: linkedPresetIds,
            })
          : undefined;

      return {
        channelId,
        config,
        ...(linkedPresets ? { linkedPresets } : {}),
        notes,
        priceType: product.priceType,
        productId,
      };
    },
    outputSummary: (result) => ({
      hasConfig: Boolean(result.config),
      linkedPresets: result.linkedPresets?.length ?? 0,
      notes: result.notes.length,
    }),
    requestedScopes: ["products:read", "pricing:explain"],
    runtime,
    toolName: "getProductDynamicPricingConfig",
  });
}

export async function explainProductPrice(
  runtime: ToolLayerRuntime,
  input: ExplainProductPriceInput,
): Promise<PriceExplanation> {
  const productId = requireNonEmpty(input.productId, "productId");
  const quantity = Number(input.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ToolLayerError("validation_error", "quantity must be positive.");
  }

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      customFormat: input.customFormat ?? false,
      productId,
      quantity,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["pricing:explain", "products:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const product = await runtime.readers.getProduct({
        channelId,
        productId,
      });
      if (!product) {
        throw new ToolLayerError("not_found", "Product not found.");
      }

      const prices = await resolvePricesForExplanation(
        runtime,
        {
          ...input,
          channelId,
          productId,
          quantity,
        },
        product,
      );
      const selectedCombination =
        input.calculatedCombination ?? DEFAULT_COMBINATION;
      const calculated = toCalculationResult(
        calcPrice(
          quantity,
          prices,
          product.priceType,
          input.discount,
          selectedCombination,
          input.volume,
          input.customFormat ?? false,
          input.width,
          input.height,
          product.spec.minimumOrder,
          input.customPrice,
        ),
      );

      const base: PriceExplanation = {
        channelId,
        productId,
        productName: product.name,
        priceType: product.priceType,
        pricesConsidered: prices.length,
        quantity,
        selectedCombination,
        volume: input.volume,
      };

      if ("error" in calculated) {
        return {
          ...base,
          error: calculated.error,
        };
      }

      return {
        ...base,
        deliveryTime: calculated.deliveryTime ?? undefined,
        formattedPrice: calculated.formattedPrice,
        result: calculated.result,
      };
    },
    outputSummary: (result) => ({
      error: result.error ?? null,
      pricesConsidered: result.pricesConsidered,
      result: result.result ?? null,
    }),
    requestedScopes: ["pricing:explain", "products:read"],
    runtime,
    toolName: "explainProductPrice",
  });
}
