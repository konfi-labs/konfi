import { Timestamp } from "firebase/firestore";
import { Base } from "../base";
import { NestedMember } from "../configuration/member";
import type { TenantOwned } from "../tenant";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

/**
 * External provider configuration
 * Stores API endpoints and configuration for third-party providers
 */
export interface ExternalProvider extends Base, TenantOwned {
  /** Provider name (e.g., "Vistaprint", "Moo", "Custom") */
  name: string;
  /** Optional base URL used for automatic endpoint discovery */
  baseUrl?: string;
  /** API endpoint to fetch all products */
  allProductsEndpoint?: string;
  /** API endpoint template for specific product (use {productId} placeholder) */
  productEndpoint?: string;
  /** Optional: API endpoint for disabled/unavailable attributes */
  attributeAvailabilityEndpoint?: string;
  /** Optional sample product ID for endpoint exploration */
  sampleProductId?: string;
  /** API authentication configuration */
  auth?: {
    type: "none" | "bearer" | "api-key" | "custom";
    headerName?: string;
    tokenValue?: string;
  };
  /** Request headers to include */
  headers?: Record<string, string>;
  /** Provider logo URL */
  logoUrl?: string;
  /** Provider description */
  description?: string;
  /** AI-generated schema for all products endpoint response */
  allProductsSchema?: ApiResponseSchema;
  /** AI-generated schema for product endpoint response */
  productSchema?: ApiResponseSchema;
  /** AI-generated schema for attribute availability endpoint response */
  attributeAvailabilitySchema?: ApiResponseSchema;
  /** Additional endpoints to explore and generate schemas for */
  endpoints?: ExternalProviderEndpoint[];
  /** Cached price extraction schemas per endpoint ID */
  priceSchemas?: Record<string, PriceExtractionSchema>;
}

/**
 * Custom endpoint configuration for external providers
 */
export interface ExternalProviderEndpoint {
  /** Unique endpoint identifier */
  id: string;
  /** Human-friendly name for the endpoint */
  name: string;
  /** Endpoint URL (may include placeholders like {productId}) */
  url: string;
  /** Optional example URL to use for schema exploration */
  sampleUrl?: string;
  /** Optional description for the endpoint */
  description?: string;
  /** AI-generated schema for this endpoint response */
  schema?: ApiResponseSchema;
}

/**
 * AI-generated schema for API response
 * Describes the structure of API responses for type-safe UI integration
 */
export interface ApiResponseSchema {
  /** Schema description */
  description: string;
  /** Root type (object, array, etc.) */
  rootType: "object" | "array" | "string" | "number" | "boolean";
  /** Properties if root is object */
  properties?: {
    [key: string]: SchemaProperty;
  };
  /** Items schema if root is array */
  items?: SchemaProperty;
  /** Example response */
  example?: JsonValue;
  /** Generated at timestamp */
  generatedAt: Timestamp;
}

/**
 * Schema property definition
 */
export interface SchemaProperty {
  /** Property type */
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  /** Description of the property */
  description?: string;
  /** Whether this is required */
  required?: boolean;
  /** Nested properties if type is object */
  properties?: {
    [key: string]: SchemaProperty;
  };
  /** Items schema if type is array */
  items?: SchemaProperty;
  /** Example value */
  example?: JsonValue;
}

/**
 * External product source information
 * Represents where the product data was fetched from
 */
export interface ExternalProductSource {
  /** URL or endpoint of the external product */
  url: string;
  /** Type of source (website, API, etc.) */
  type: "website" | "api" | "manual";
  /** Platform/website name (e.g., "vistaprint", "moo", "custom") */
  platform?: string;
  /** Provider ID if using configured provider */
  providerId?: string;
  /** Last time data was fetched from this source */
  lastFetchedAt?: Timestamp;
  /** Whether this source is still accessible */
  accessible?: boolean;
  /** Error message if fetch failed */
  lastError?: string;
}

/**
 * Attribute option with both API value and display label
 */
export interface ExternalAttributeOption {
  /** API value (used in requests/queries) */
  value: string;
  /** Display label (human-readable text, often localized) */
  label?: string;
}

/**
 * Raw attribute data from external source
 * Before mapping to internal attributes
 */
export interface ExternalAttribute {
  /** Attribute id/key from the source API (e.g., "color", "paperFormat") */
  id?: string;
  /** Original attribute name from source */
  name: string;
  /** Original attribute values/options from source (API values, not labels) */
  values: string[];
  /** Detailed options with both API values and display labels */
  options?: ExternalAttributeOption[];
  /** Category/type hint (e.g., "paper", "size", "finish") */
  category?: string;
  /** Whether this attribute affects pricing */
  affectsPricing?: boolean;
  /** Optional numeric input metadata derived from the provider payload */
  numberConfig?: {
    minimum?: number;
    maximum?: number;
    step?: number;
  };
}

/**
 * Mapped attribute information
 * Links external attributes to internal system attributes
 */
export interface AttributeMapping {
  /** External attribute identifier */
  externalAttributeName: string;
  /** Mapped internal attribute ID */
  internalAttributeId?: string;
  /** Whether this attribute should be ignored during product creation/import */
  ignored?: boolean;
  /** Whether this attribute should only influence provider-side pricing fetches */
  providerOnlyPricing?: boolean;
  /** Whether this provider attribute maps to a dedicated product field */
  specialRole?: "pageCount";
  /** Canonical external value used when providerOnlyPricing is enabled */
  fixedExternalValue?: string;
  /** Mapping confidence score (0-1) from AI */
  confidence?: number;
  /** Whether mapping was verified by user */
  verified?: boolean;
  /** Option value mappings */
  optionMappings?: {
    [externalValue: string]: string; // Maps external value to internal option value
  };
}

/**
 * Exclusion rule for external pricing combinations.
 * When all trigger attributes match, the listed supplier attributes are omitted
 * from the generated pricing request configurations.
 */
export interface ExternalProductPricingExclusionRule {
  /** Supplier attribute values that trigger this exclusion rule */
  when: Record<string, string[]>;
  /** Supplier attributes that should be omitted from generated configurations */
  omitAttributes?: string[];
  /** Specific supplier attribute values that should be excluded from generated configurations */
  excludeValues?: Record<string, string[]>;
  /** Origin of the rule: "manual" (user-created) or "ai" (inferred during price fetch) */
  source?: "manual" | "ai";
}

/**
 * External product data structure
 * Stores fetched product information before conversion
 */
export interface ExternalProduct extends Base, TenantOwned {
  /** Source information */
  source: ExternalProductSource;

  /** Original product name from source */
  originalName: string;

  /** Original product description */
  originalDescription?: string;

  /** Product images from source */
  images?: string[];

  /** Raw attributes from source */
  attributes: ExternalAttribute[];

  /** Mapped attributes to internal system */
  attributeMappings?: AttributeMapping[];

  /** Manual exclusion rules that prune impossible supplier pricing combinations */
  pricingExclusionRules?: ExternalProductPricingExclusionRule[];

  /** Original price information (as text/structured) */
  priceInfo?: {
    currency?: string;
    priceText?: string;
    priceRanges?: {
      quantity?: number;
      price?: number;
      deliveryTime?: number;
      taxIncluded?: boolean;
      unit?: string;
    }[];
  };

  /** Optional price info per configuration (e.g. per attribute combination) */
  priceConfigurations?: ExternalPriceConfiguration[];

  /** Count of applied price configurations (stored in subcollection chunks) */
  priceConfigurationsCount?: number;

  /**
   * Newly fetched prices awaiting manual review before replacing live prices.
   * When present, admin UI should allow compare/apply flow.
   */
  pendingPriceConfigurations?: ExternalPriceConfiguration[];

  /** Count of pending price configurations (stored in subcollection chunks) */
  pendingPriceConfigurationsCount?: number;

  /** Status of external price refresh workflow */
  priceRefreshStatus?: "idle" | "pending-review" | "applied" | "failed";

  /** Last successful fetch timestamp for pending refresh prices */
  priceRefreshLastFetchedAt?: Timestamp;

  /** Last time pending refresh prices were applied to live prices */
  priceRefreshLastAppliedAt?: Timestamp;

  /** Last refresh error message (if refresh failed) */
  priceRefreshError?: string;

  /** Fingerprint of the last supplier fetch context used to populate the stored configurations */
  priceConfigurationReuseSignature?: string;

  /** Cached pricing selection for fetching configurations */
  pricingSelection?: ExternalProductPricingSelection;

  /** Durable workflow state for long-running price fetches */
  priceFetchWorkflow?: ExternalProductPriceFetchWorkflow;

  /** Margin percentage applied to prices during import */
  priceMarginPercent?: number;

  /** Tax percentage applied to prices during fetch */
  priceTaxPercent?: number;

  /** Discount percentage applied before tax during fetch */
  priceDiscountPercent?: number;

  /** When true, adds 1 extra day to all fetched delivery times */
  deliveryTimeExtraDay?: boolean;

  /** Cached suggested product type ID from AI */
  suggestedProductTypeId?: string;

  /** Specifications/dimensions from source */
  specifications?: {
    [key: string]: string | number | boolean;
  };

  /** Keywords/tags from source */
  keywords?: string[];

  /** Whether this has been converted to a Product */
  imported?: boolean;

  /** ID of created Product if imported */
  productId?: string;

  /** Status of import process */
  importStatus?:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "review-required";

  /** Import error message if failed */
  importError?: string;

  /** Scheduled check for changes */
  nextCheckAt?: Timestamp;

  /** Hash of content for change detection */
  contentHash?: string;

  /** Detected changes since last fetch */
  detectedChanges?: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
    detectedAt: Timestamp;
  }[];
}

/**
 * Link between internal product and external product source
 */
export interface ExternalImportConnection {
  externalProductId: string;
  externalProductName: string;
  providerId?: string;
  providerName?: string;
  sourceUrl?: string;
  importedAt: Timestamp;
  importedBy: NestedMember;
}

/**
 * Price info returned for a specific configuration/variant
 */
export interface ExternalPriceConfiguration {
  /** External attribute configuration used to fetch pricing */
  configuration: Record<string, string>;
  /** Price info extracted for this configuration */
  priceInfo: {
    currency?: string;
    priceText?: string;
    priceRanges?: {
      quantity?: number;
      price?: number;
      deliveryTime?: number;
      taxIncluded?: boolean;
      unit?: string;
    }[];
  };
  /** Optional source URL used for this configuration */
  sourceUrl?: string;
}

export type ExternalProductPriceFetchStrategy = "reuse" | "full";

/**
 * Durable workflow state for long-running external price fetches.
 */
export interface ExternalProductPriceFetchWorkflow {
  /** Workflow run id returned by Workflow DevKit */
  runId: string;
  /** Whether fetched prices should be applied immediately or staged for review */
  mode: "apply" | "stage";
  /** Current workflow execution status */
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  /** Timestamp when the workflow was started */
  startedAt?: Timestamp;
  /** Timestamp when the workflow finished */
  completedAt?: Timestamp;
  /** Timestamp when cancellation was requested for the active run */
  cancelRequestedAt?: Timestamp;
  /** Optional estimated configuration count captured at workflow start */
  estimatedConfigurationCount?: number;
  /** Number of configurations fetched by the workflow */
  fetchedConfigurationCount?: number;
  /** Whether the workflow reused matching fetched configurations or forced a full supplier refetch */
  fetchStrategy?: ExternalProductPriceFetchStrategy;
  /** Margin percentage applied during fetch */
  marginPercent?: number;
  /** Tax percentage applied during fetch */
  taxPercent?: number;
  /** Discount percentage applied during fetch */
  discountPercent?: number;
  /** Last workflow error, if any */
  error?: string;
}

/**
 * Cached pricing selection for external products
 * Stores the chosen endpoint and parameter mappings
 */
export interface ExternalProductPricingSelection {
  endpointId?: string;
  configurationParams?: Record<string, string>;
  staticQueryParams?: Record<string, string>;
  valueMappings?: Record<string, Record<string, string>>;
}

/**
 * Schema for extracting price data from API responses.
 * Learned once by AI, then reused for fast extraction without AI.
 */
export type PriceExtractionDeliveryTimeFormat =
  | "days"
  | "hours"
  | "date-string"
  | "unix-seconds"
  | "unix-milliseconds";

export interface PriceExtractionSchema {
  /** JSON path to currency field (e.g., "data.currency") */
  currencyPath?: string;
  /** Static currency value if not in response */
  staticCurrency?: string;
  /** JSON path to the price ranges array (e.g., "data.prices") */
  priceRangesPath?: string;
  /** JSON path within each range item to get quantity */
  quantityPath?: string;
  /** JSON path within each range item to get price (total or per-unit, see priceIsPerUnit) */
  pricePath?: string;
  /**
   * When true, the value at `pricePath` is already a per-unit price.
   * When false or omitted, it is treated as a total price that will be divided by quantity.
   */
  priceIsPerUnit?: boolean;
  /** JSON path within each range item to get unit */
  unitPath?: string;
  /**
   * JSON path to the raw delivery-related field.
   * May point to a field on each price range item or to a shared top-level field.
   */
  deliveryTimePath?: string;
  /**
   * How the raw delivery field should be interpreted before converting it into
   * delivery days.
   */
  deliveryTimeFormat?: PriceExtractionDeliveryTimeFormat;
  /** If price is a single value, not an array - path to the single price */
  singlePricePath?: string;
  /** Divisor for price (e.g., 100 if price is in cents) */
  priceDivisor?: number;
}

/**
 * Request to fetch product from external source
 */
export interface FetchExternalProductRequest {
  /** Endpoint URL to fetch from (API endpoint or product URL) */
  url: string;
  /** Optional provider ID to use configured provider settings */
  providerId?: string;
  /** Whether to force re-fetch even if cached */
  forceRefresh?: boolean;
}

/**
 * Response from fetching external product
 */
export interface FetchExternalProductResponse {
  /** Success status */
  success: boolean;
  /** Fetched external product data */
  externalProduct?: ExternalProduct;
  /** Error message if failed */
  error?: string;
  /** Suggested attribute mappings from AI */
  suggestedMappings?: AttributeMapping[];
}

/**
 * Request to create or update external provider
 */
export interface SaveExternalProviderRequest {
  /** Provider data */
  provider: Omit<
    ExternalProvider,
    "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
  >;
  /** Provider ID (for updates) */
  providerId?: string;
  /** Optional pasted provider details to parse */
  providerInput?: string;
}

/**
 * Response from saving external provider
 */
export interface SaveExternalProviderResponse {
  /** Success status */
  success: boolean;
  /** Provider ID */
  providerId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Request to import external product into system
 */
export interface ImportExternalProductRequest {
  /** External product ID */
  externalProductId: string;
  /** Channel ID to import the product into */
  channelId: string;
  /** Confirmed attribute mappings */
  attributeMappings: AttributeMapping[];
  /** Optional overrides for product creation */
  overrides?: {
    name?: string;
    description?: string;
    categoryId?: string;
  };
}

/**
 * Structured import warning with translation key and interpolation params.
 */
export interface ImportWarning {
  /** i18n translation key under externalProducts.importWarnings.* */
  key: string;
  /** Interpolation params for the translation */
  params?: Record<string, string | number>;
}

/**
 * Response from importing external product
 */
export interface ImportExternalProductResponse {
  /** Success status */
  success: boolean;
  /** Created product ID */
  productId?: string;
  /** Summary of duplicate internal attribute mappings that blocked the import */
  duplicateMappingsSummary?: string;
  /** Error message if failed */
  error?: string;
  /** Warnings during import */
  warnings?: ImportWarning[];
}
