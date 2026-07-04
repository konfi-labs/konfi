import "server-only";

import type { Attribute, Category, Order, Product } from "@konfi/types";
import type { Option } from "@konfi/types";
import { StoreMcpToolError } from "./errors";
import type {
  PublicProductRecord,
  StoreMcpAuthContext,
  StoreMcpRuntime,
  StoreMcpScope,
} from "./types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_ORDER_ITEMS = 20;
const MAX_PRICE_ROWS = 20;
const MAX_CATEGORY_SCHEMA_PRODUCTS = 999;

type PriceRowSummary = {
  combination?: {
    id?: string;
    name?: string;
  };
  currency?: string;
  threshold?: number;
  value?: number | null;
  volume?: {
    label?: string;
    value?: number;
  };
};

interface CategorySummary {
  description?: string;
  id: string;
  name: string;
  parentId?: string | null;
  path?: {
    id: string;
    name: string;
  }[];
  slug?: string;
  title?: string;
}

interface CatalogAttributeSummary {
  calculated: boolean;
  format: boolean;
  id: string;
  name: string;
  optionCount: number;
  pages: boolean;
  required: boolean;
  type: string;
}

interface CategoryCatalogSchema {
  attributeIds: string[];
  attributes: CatalogAttributeSummary[];
  depth: number;
  description?: string;
  id: string;
  kind: "category" | "subcategory";
  name: string;
  parentId?: string | null;
  path: {
    id: string;
    name: string;
  }[];
  productCount: number;
  productIds: string[];
  slug?: string;
}

interface ProductSummary {
  active: boolean;
  attributes: string[];
  category?: {
    id?: string;
    name?: string;
    parentId?: string | null;
    path?: {
      id: string;
      name: string;
    }[];
  };
  customSize: {
    enabled: boolean;
    height?: {
      maximum?: number;
      minimum?: number;
      step?: number;
    };
    width?: {
      maximum?: number;
      minimum?: number;
      step?: number;
    };
  };
  description?: string;
  id: string;
  images: string[];
  name: string;
  pageCount?: {
    maximum: number;
    minimum: number;
    step: number;
  };
  priceRowCount: number;
  priceRows: PriceRowSummary[];
  priceType: string;
  published: boolean;
  quantity: {
    default: number;
    maximum: number;
    minimum: number;
    step: number;
  };
  slug?: string;
  startingPrice?: PriceRowSummary;
  unit: string;
  url: string;
}

interface ProductSearchResult {
  category?: string;
  description?: string;
  id: string;
  name: string;
  slug?: string;
  startingPrice?: PriceRowSummary;
  unit: string;
  url: string;
}

interface ConfigurationOptionSummary {
  color?: string;
  customFormat: boolean;
  formatHeight?: number | null;
  formatWidth?: number | null;
  label: string;
  pages?: number | null;
  value: string;
}

interface ConfigurationAttributeSummary {
  calculated: boolean;
  format: boolean;
  id: string;
  name: string;
  options: ConfigurationOptionSummary[];
  pages: boolean;
  required: boolean;
  type: string;
}

interface ProductConfigurationSchema {
  attributeDependencies?: Product["attributeDependencies"];
  attributes: ConfigurationAttributeSummary[];
  customSize: ProductSummary["customSize"];
  pageCount?: ProductSummary["pageCount"] & {
    coverPages: number;
    pricingMode?: string;
  };
  priceCombinations: {
    id: string;
    name: string;
    priceRows: number;
  }[];
  priceType: string;
  pricingTool: {
    notes: string[];
  };
  productId: string;
  productName: string;
  quantity: ProductSummary["quantity"];
  unit: string;
}

interface CustomerOrderSummary {
  currency: string;
  deadline?: string;
  filesStatus: string;
  id: string;
  itemCount: number;
  items: {
    description: string;
    id: string;
    product?: {
      id?: string;
      name?: string;
      slug?: string;
    };
    quantity: number;
    totalPrice: number;
    unit: string;
  }[];
  number: number;
  paymentStatus: string;
  paymentType: string;
  shippingOption?: string | null;
  status: string;
  totalPrice: number;
}

export interface GetStoreContextOutput {
  auth: {
    customerAuthenticated: boolean;
    scopes: StoreMcpScope[];
  };
  availableTools: {
    catalog: string[];
    customer: string[];
  };
  notes: string[];
  store: {
    name?: string;
    url?: string;
  };
}

function normalizeLimit(
  value: number | undefined,
  options: {
    defaultLimit?: number;
    maximumLimit?: number;
  } = {},
): number {
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
  const maximumLimit = options.maximumLimit ?? MAX_LIMIT;

  if (value === undefined || !Number.isFinite(value)) {
    return defaultLimit;
  }

  return Math.min(Math.max(Math.floor(value), 1), maximumLimit);
}

function requireNonEmpty(value: string | undefined, field: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new StoreMcpToolError("validation_error", `${field} is required.`);
  }

  return trimmed;
}

function optionalNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requireScope(auth: StoreMcpAuthContext, scope: StoreMcpScope): void {
  if (!auth.permissions.scopes.includes(scope)) {
    throw new StoreMcpToolError(
      "missing_scope",
      `OAuth scope ${scope} is required for this store MCP tool.`,
      {
        details: {
          grantedScopes: auth.permissions.scopes,
          requiredScope: scope,
        },
        status: 403,
      },
    );
  }
}

function requireCustomerOrdersScope(auth: StoreMcpAuthContext): string {
  requireScope(auth, "store:orders:read");
  return auth.actor.uid;
}

function storeUrlForProduct(record: PublicProductRecord): string {
  const slug = record.product.seo?.slug || record.product.id;
  const productPath =
    record.sourceChannelId === record.targetChannelId
      ? slug
      : `${slug}__ch__${record.sourceChannelId}`;
  const storeUrl = process.env.NEXT_PUBLIC_STORE_URL?.trim();

  return storeUrl
    ? `https://${storeUrl}/products/${productPath}`
    : `/products/${productPath}`;
}

function summarizePriceRow(row: Product["prices"][number]): PriceRowSummary {
  return {
    ...(row.combination
      ? {
          combination: {
            id: row.combination.id,
            name: row.combination.id,
          },
        }
      : {}),
    currency: row.currency,
    ...(row.threshold !== undefined ? { threshold: row.threshold } : {}),
    value: row.value ?? null,
    ...(row.volume
      ? {
          volume: {
            value: row.volume.value,
          },
        }
      : {}),
  };
}

function summarizeCategory(category: Category): CategorySummary {
  return {
    ...(category.description ? { description: category.description } : {}),
    id: category.id,
    name: category.name,
    ...(category.parentId !== undefined ? { parentId: category.parentId } : {}),
    ...(category.path ? { path: category.path } : {}),
    ...(category.seo?.slug ? { slug: category.seo.slug } : {}),
    ...(category.seo?.title ? { title: category.seo.title } : {}),
  };
}

function summarizeCatalogAttribute(
  attribute: Attribute,
): CatalogAttributeSummary {
  return {
    calculated: attribute.calculated ?? false,
    format: attribute.format ?? false,
    id: attribute.id,
    name: attribute.name,
    optionCount: (attribute.options ?? []).filter((option) => !option.hidden)
      .length,
    pages: attribute.pages ?? false,
    required: attribute.required ?? false,
    type: attribute.type ?? "DROPDOWN",
  };
}

function summarizeSearchProduct(
  record: PublicProductRecord,
): ProductSearchResult {
  const product = record.product;

  return {
    ...(product.category?.name ? { category: product.category.name } : {}),
    ...(product.seo?.description || product.description
      ? { description: product.seo?.description || product.description }
      : {}),
    id: product.id,
    name: product.name,
    ...(product.seo?.slug ? { slug: product.seo.slug } : {}),
    ...(product.lowPrice
      ? { startingPrice: summarizePriceRow(product.lowPrice) }
      : {}),
    unit: product.prefferedUnit,
    url: storeUrlForProduct(record),
  };
}

function rangeSummary(input: {
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
  const range = {
    ...(input.maximum !== undefined ? { maximum: input.maximum } : {}),
    ...(input.minimum !== undefined ? { minimum: input.minimum } : {}),
    ...(input.step !== undefined ? { step: input.step } : {}),
  };

  return Object.keys(range).length > 0 ? range : undefined;
}

function productCustomSize(product: Product): ProductSummary["customSize"] {
  const height = product.customSize
    ? rangeSummary({
        maximum: product.spec.maximumHeight,
        minimum: product.spec.minimumHeight,
        step: product.spec.heightStep,
      })
    : undefined;
  const width = product.customSize
    ? rangeSummary({
        maximum: product.spec.maximumWidth,
        minimum: product.spec.minimumWidth,
        step: product.spec.widthStep,
      })
    : undefined;

  return {
    enabled: product.customSize,
    ...(height ? { height } : {}),
    ...(width ? { width } : {}),
  };
}

function productQuantity(product: Product): ProductSummary["quantity"] {
  return {
    default: product.spec.defaultOrder,
    maximum: product.spec.maximumOrder,
    minimum: product.spec.minimumOrder,
    step: product.spec.step,
  };
}

function summarizeProduct(record: PublicProductRecord): ProductSummary {
  const product = record.product;

  return {
    active: product.active,
    attributes: product.attributes,
    ...(product.category
      ? {
          category: {
            id: product.category.id,
            name: product.category.name,
            ...(product.category.parentId !== undefined
              ? { parentId: product.category.parentId }
              : {}),
            ...(product.category.path ? { path: product.category.path } : {}),
          },
        }
      : {}),
    customSize: productCustomSize(product),
    ...(product.description ? { description: product.description } : {}),
    id: product.id,
    images: product.spec.images ?? [],
    name: product.name,
    ...(product.pageCount?.enabled
      ? {
          pageCount: {
            maximum: product.pageCount.maximum,
            minimum: product.pageCount.minimum,
            step: product.pageCount.step,
          },
        }
      : {}),
    priceRowCount: product.prices.length,
    priceRows: product.prices.slice(0, MAX_PRICE_ROWS).map(summarizePriceRow),
    priceType: product.priceType,
    published: product.availability.published,
    quantity: productQuantity(product),
    ...(product.seo?.slug ? { slug: product.seo.slug } : {}),
    ...(product.lowPrice
      ? { startingPrice: summarizePriceRow(product.lowPrice) }
      : {}),
    unit: product.prefferedUnit,
    url: storeUrlForProduct(record),
  };
}

function summarizeConfigurationOption(
  value: string,
  option: Option | undefined,
): ConfigurationOptionSummary {
  return {
    ...(option?.color ? { color: option.color } : {}),
    customFormat: option?.customFormat ?? false,
    ...(option?.formatHeight !== undefined
      ? { formatHeight: option.formatHeight }
      : {}),
    ...(option?.formatWidth !== undefined
      ? { formatWidth: option.formatWidth }
      : {}),
    label: option?.label ?? value,
    ...(option?.pages !== undefined ? { pages: option.pages } : {}),
    value,
  };
}

function uniqueValues(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim())));
}

function buildCategoryPath(
  category: Category,
  categoriesById: ReadonlyMap<string, Category>,
): CategoryCatalogSchema["path"] {
  if (category.path?.length) {
    const lastSegment = category.path.at(-1);

    return lastSegment?.id === category.id
      ? category.path
      : [...category.path, { id: category.id, name: category.name }];
  }

  const path: CategoryCatalogSchema["path"] = [];
  const visited = new Set<string>();
  let current: Category | undefined = category;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift({ id: current.id, name: current.name });
    current = current.parentId
      ? (categoriesById.get(current.parentId) ?? undefined)
      : undefined;
  }

  return path;
}

function categoryDescendantIds(
  categoryId: string,
  categories: readonly Category[],
): Set<string> {
  const descendants = new Set([categoryId]);
  let didAddCategory = true;

  while (didAddCategory) {
    didAddCategory = false;

    for (const category of categories) {
      if (
        category.parentId &&
        descendants.has(category.parentId) &&
        !descendants.has(category.id)
      ) {
        descendants.add(category.id);
        didAddCategory = true;
      }
    }
  }

  return descendants;
}

function productBelongsToCategoryBranch(
  product: Product,
  categoryIds: ReadonlySet<string>,
): boolean {
  const productCategoryId = product.category?.id;

  return Boolean(productCategoryId && categoryIds.has(productCategoryId));
}

function buildCategoryCatalogSchemas(input: {
  attributes: readonly Attribute[];
  categories: readonly Category[];
  products: readonly Product[];
}): CategoryCatalogSchema[] {
  const categoriesById = new Map(
    input.categories.map((category) => [category.id, category]),
  );
  const attributesById = new Map(
    input.attributes.map((attribute) => [attribute.id, attribute]),
  );

  return input.categories.map((category) => {
    const categoryIds = categoryDescendantIds(category.id, input.categories);
    const products = input.products.filter((product) =>
      productBelongsToCategoryBranch(product, categoryIds),
    );
    const attributeIds = uniqueValues(
      products.flatMap((product) => product.attributes ?? []),
    ).toSorted();
    const path = buildCategoryPath(category, categoriesById);

    return {
      attributeIds,
      attributes: attributeIds.flatMap((attributeId) => {
        const attribute = attributesById.get(attributeId);

        return attribute ? [summarizeCatalogAttribute(attribute)] : [];
      }),
      depth: Math.max(path.length - 1, 0),
      ...(category.description ? { description: category.description } : {}),
      id: category.id,
      kind: category.parentId ? "subcategory" : "category",
      name: category.name,
      ...(category.parentId !== undefined
        ? { parentId: category.parentId }
        : {}),
      path,
      productCount: products.length,
      productIds: products.map((product) => product.id).toSorted(),
      ...(category.seo?.slug ? { slug: category.seo.slug } : {}),
    };
  });
}

function summarizeConfigurationAttribute(
  product: Product,
  attribute: Attribute | undefined,
  attributeId: string,
): ConfigurationAttributeSummary {
  const optionByValue = new Map(
    (attribute?.options ?? []).map((option) => [option.value, option]),
  );
  const optionValues =
    product.attributeOptions[attributeId] ??
    (attribute?.options ?? []).map((option) => option.value);

  return {
    calculated: attribute?.calculated ?? false,
    format: attribute?.format ?? false,
    id: attributeId,
    name: attribute?.name ?? attributeId,
    options: uniqueValues(optionValues).flatMap((value) => {
      const option = optionByValue.get(value);

      return option?.hidden
        ? []
        : [summarizeConfigurationOption(value, option)];
    }),
    pages: attribute?.pages ?? false,
    required: attribute?.required ?? false,
    type: attribute?.type ?? "DROPDOWN",
  };
}

function summarizePriceCombinations(product: Product) {
  const combinations = new Map<
    string,
    {
      id: string;
      name: string;
      priceRows: number;
    }
  >();

  for (const price of product.prices) {
    const id = price.combination?.id ?? "default";
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

function buildProductConfigurationSchema(input: {
  attributes: Attribute[];
  product: Product;
}): ProductConfigurationSchema {
  const attributeById = new Map(
    input.attributes.map((attribute) => [attribute.id, attribute]),
  );

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
    customSize: productCustomSize(input.product),
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
      notes: [
        "The store MCP is read-only. Keep the selected configuration in the MCP client context.",
        "Use the returned public price rows as guidance. Submit the final customer order through the storefront flow.",
      ],
    },
    productId: input.product.id,
    productName: input.product.name,
    quantity: productQuantity(input.product),
    unit: input.product.prefferedUnit,
  };
}

function timestampToIso(value: unknown): string | undefined {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate() as unknown;
    return date instanceof Date ? date.toISOString() : undefined;
  }

  return undefined;
}

function readProductSummaryFromOrderItem(
  item: Order["items"][number],
): CustomerOrderSummary["items"][number]["product"] | undefined {
  const product = item.product;
  if (!product) {
    return undefined;
  }

  return {
    id: product.id,
    name: product.name,
  };
}

function summarizeCustomerOrder(order: Order): CustomerOrderSummary {
  return {
    currency: order.currency,
    deadline: timestampToIso(order.deadline),
    filesStatus: order.filesStatus,
    id: order.id,
    itemCount: order.items.length,
    items: order.items.slice(0, MAX_ORDER_ITEMS).map((item) => ({
      description: item.description,
      id: item.id,
      ...(readProductSummaryFromOrderItem(item)
        ? { product: readProductSummaryFromOrderItem(item) }
        : {}),
      quantity: item.quantity,
      totalPrice: item.totalPrice,
      unit: item.unit,
    })),
    number: order.number,
    paymentStatus: order.paymentStatus,
    paymentType: order.paymentType,
    shippingOption: order.shippingOption,
    status: order.status,
    totalPrice: order.totalPrice,
  };
}

async function resolveProductRecord(
  runtime: StoreMcpRuntime,
  input: {
    productId?: string;
    slug?: string;
  },
): Promise<PublicProductRecord> {
  const productId = optionalNonEmpty(input.productId);
  const slug = optionalNonEmpty(input.slug);

  if (!productId && !slug) {
    throw new StoreMcpToolError(
      "validation_error",
      "productId or slug is required.",
    );
  }

  const record = await runtime.readers.getProduct({ productId, slug });
  if (!record) {
    throw new StoreMcpToolError("not_found", "Product not found.");
  }

  return record;
}

export function getStoreContext(
  runtime: StoreMcpRuntime,
): GetStoreContextOutput {
  requireScope(runtime.auth, "store:context");

  return {
    auth: {
      customerAuthenticated: true,
      scopes: runtime.auth.permissions.scopes,
    },
    availableTools: {
      catalog: [
        "list_categories",
        "list_category_schemas",
        "search_products",
        "get_product",
        "get_product_configuration_schema",
      ],
      customer: ["list_customer_orders", "get_customer_order"],
    },
    notes: [
      "This is the customer/store MCP endpoint. It automatically uses the storefront channel configured for this deployment.",
      "Do not ask the user for a channel id. Customer order tools only return orders owned by the OAuth-authorized store customer.",
      "Admin-only automation, business records, and draft writes remain on the admin MCP endpoint.",
    ],
    store: {
      name: process.env.NEXT_PUBLIC_STORE_NAME,
      url: process.env.NEXT_PUBLIC_STORE_URL,
    },
  };
}

export async function listCategories(
  runtime: StoreMcpRuntime,
  input: {
    limit?: number;
  },
): Promise<{ categories: CategorySummary[] }> {
  requireScope(runtime.auth, "store:catalog:read");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 25,
    maximumLimit: 100,
  });
  const categories = await runtime.readers.listCategories({ limit });

  return {
    categories: categories.map(summarizeCategory),
  };
}

export async function listCategorySchemas(
  runtime: StoreMcpRuntime,
  input: {
    limit?: number;
  },
): Promise<{ categorySchemas: CategoryCatalogSchema[] }> {
  requireScope(runtime.auth, "store:catalog:read");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 25,
    maximumLimit: 100,
  });
  const [categories, productRecords] = await Promise.all([
    runtime.readers.listCategories({ limit }),
    runtime.readers.searchProducts({ limit: MAX_CATEGORY_SCHEMA_PRODUCTS }),
  ]);
  const attributeIds = uniqueValues(
    productRecords.flatMap((record) => record.product.attributes ?? []),
  );
  const attributes = await runtime.readers.listAttributes(attributeIds);

  return {
    categorySchemas: buildCategoryCatalogSchemas({
      attributes,
      categories,
      products: productRecords.map((record) => record.product),
    }),
  };
}

export async function searchProducts(
  runtime: StoreMcpRuntime,
  input: {
    limit?: number;
    query?: string;
  },
): Promise<{ products: ProductSearchResult[] }> {
  requireScope(runtime.auth, "store:catalog:read");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 25,
  });
  const records = await runtime.readers.searchProducts({
    limit,
    query: optionalNonEmpty(input.query),
  });

  return {
    products: records.map(summarizeSearchProduct),
  };
}

export async function getProduct(
  runtime: StoreMcpRuntime,
  input: {
    productId?: string;
    slug?: string;
  },
): Promise<ProductSummary> {
  requireScope(runtime.auth, "store:catalog:read");
  return summarizeProduct(await resolveProductRecord(runtime, input));
}

export async function getProductConfigurationSchema(
  runtime: StoreMcpRuntime,
  input: {
    productId?: string;
    slug?: string;
  },
): Promise<ProductConfigurationSchema> {
  requireScope(runtime.auth, "store:catalog:read");
  const record = await resolveProductRecord(runtime, input);
  const attributes = await runtime.readers.listAttributes(
    record.product.attributes,
  );

  return buildProductConfigurationSchema({
    attributes,
    product: record.product,
  });
}

export async function listCustomerOrders(
  runtime: StoreMcpRuntime,
  input: {
    limit?: number;
  },
): Promise<{ orders: CustomerOrderSummary[] }> {
  const customerId = requireCustomerOrdersScope(runtime.auth);
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 50,
  });
  const orders = await runtime.readers.listCustomerOrders({
    customerId,
    limit,
  });

  return {
    orders: orders.map(summarizeCustomerOrder),
  };
}

export async function getCustomerOrder(
  runtime: StoreMcpRuntime,
  input: {
    orderId?: string;
  },
): Promise<CustomerOrderSummary> {
  const customerId = requireCustomerOrdersScope(runtime.auth);
  const orderId = requireNonEmpty(input.orderId, "orderId");
  const order = await runtime.readers.getCustomerOrder({
    customerId,
    orderId,
  });

  if (!order) {
    throw new StoreMcpToolError("not_found", "Order not found.");
  }

  return summarizeCustomerOrder(order);
}
