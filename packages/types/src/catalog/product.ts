import { Timestamp } from "firebase/firestore";
import { Base } from "../base";
import { Attribute } from "../configuration/attribute";
import { Option } from "../configuration/option";
import { NestedProductType } from "../configuration/product-type";
import { DynamicPricingConfig } from "./dynamic-pricing";
import { Locale, PriceTypeEnum, ShippingTypes, ThreeDModels } from "../enums";
import type { UnitId } from "../configuration/units-proofing";
import { Price } from "../price";
import type { TenantOwned } from "../tenant";
import type { CategoryPathSegment, NestedCategory } from "./category";
import type { ProductPriceOffsetConfig } from "./product-price-offset";
import { Volume } from "./volume";
import type { TranslatedContentMetadata } from "../translation-meta";

export interface ProductPageCountPlacement {
  /**
   * Attribute after which the page-count input should be rendered.
   * When null or undefined, render before the first attribute.
   */
  afterAttributeId?: Attribute["id"] | null;
}

export interface ProductPageCountConstraintCondition {
  attributeId: Attribute["id"];
  optionValues: Option["value"][];
}

export interface ProductPageCountConstraint {
  conditions: ProductPageCountConstraintCondition[];
  minimum?: number;
  maximum?: number;
  step?: number;
}

export type ProductPageCountPricingMode = "step" | "segmented" | "exact";

export interface ProductPageCountPricingSegment {
  minimum: number;
  maximum: number;
}

export interface ProductPageCountExactPriceSet {
  pageCount: number;
  prices: Price[];
}

export interface ProductPageCountSegmentPriceSet extends ProductPageCountPricingSegment {
  basePrices: Price[];
  stepPrices: Price[];
}

export interface ProductPageCountPricing {
  /**
   * Pricing strategy for page-count products.
   * - "step" keeps the compact surcharge-per-step model.
   * - "segmented" uses piecewise page-count ranges with a base price slice and
   *   per-step surcharge for each segment.
   * - "exact" uses full page-count-specific price tables.
   */
  mode?: ProductPageCountPricingMode;
  /**
   * Surcharge prices applied once per page-count step above the minimum.
   * This mirrors the regular product price model but stays compact.
   */
  stepPrices?: Price[];
  /**
   * Segmented page-count metadata persisted on the product document.
   * Each segment describes the inclusive inner-page range that shares one base
   * price slice and one per-step surcharge table.
   */
  segments?: ProductPageCountPricingSegment[];
  /**
   * Segment price tables loaded in forms/runtime. These are typically
   * persisted in dedicated product subcollections rather than inline.
   */
  segmentPrices?: ProductPageCountSegmentPriceSet[];
  /**
   * Exact price tables keyed by page count. These are typically edited in forms
   * and persisted in a dedicated product subcollection rather than inline.
   */
  exactPrices?: ProductPageCountExactPriceSet[];
}

export interface ProductPageCountConfig {
  enabled: boolean;
  minimum: number;
  maximum: number;
  step: number;
  coverPages: number;
  /**
   * Optional supplier-side attribute name used by imports/providers
   * (for example "pageNumber").
   */
  externalAttributeName?: string;
  placement?: ProductPageCountPlacement;
  constraints?: ProductPageCountConstraint[];
  pricing?: ProductPageCountPricing;
}

export interface AttributeDependencyRule {
  dependsOn: Attribute["id"];
  dependencyValues?: Option["value"][];
  conditionalOptions?: { [parentOptionValue: string]: Option["value"][] };
  when?: { [attributeId: Attribute["id"]]: Option["value"][] };
}

export interface Product extends Base, TenantOwned {
  prices: Price[];
  defaultPrice: Price;
  lowPrice: Price;
  highPrice: Price;
  /**
   * Optional external provider metadata for this product (e.g., FAKTUROWNIA).
   * When present, price data may be sourced from the provider instead of Firestore.
   */
  provider?: {
    type?: string;
    productId?: string;
  };
  taxCategoryId?: string;
  priceOffsets?: ProductPriceOffsetConfig;
  dynamicPricing?: DynamicPricingConfig;
  /**
   * When true, UI should not fetch prices from remote sources (Firestore).
   * Useful for external or ad-hoc products where pricing is driven by customPrice.
   */
  disablePriceFetch?: boolean;
  description: string;
  volumes: Omit<Volume, "deliveryTime">[];
  attributes: Attribute["id"][];
  attributeOptions: { [key: Attribute["id"]]: Option["value"][] };
  attributeDependencies?: {
    [key: Attribute["id"]]: AttributeDependencyRule | AttributeDependencyRule[];
  };
  pageCount?: ProductPageCountConfig;
  customSize: boolean;
  customSizes?: CustomSize[];
  allowCustomPrice: boolean;
  recommended: boolean;
  difficulty: number;
  shipping: {
    types: ShippingTypes[];
  };
  spec: {
    images: string[];
    defaultOrder: number;
    minimumOrder: number;
    maximumOrder: number;
    step: number;
    minimumWidth?: number;
    maximumWidth?: number;
    widthStep?: number;
    minimumHeight?: number;
    maximumHeight?: number;
    heightStep?: number;
    validateRatio?: boolean;
    minimumRatio?: number;
    maximumRatio?: number;
  };
  designSpec?: DesignSpec;
  category: NestedCategory;
  seo: {
    slug: string;
    title: string;
    description: string;
  };
  productType: NestedProductType | null;
  priceType: PriceTypeEnum;
  prefferedUnit: UnitId;
  availability: {
    published: boolean;
    publicationString?: string;
    publication?: Timestamp | null;
    availableForPurchase: boolean;
    expirationString?: string;
    expiration?: Timestamp | null;
  };
  keywords: string[];
  threeDModel?: ThreeDModels | null;
  averageRating?: number;
  linkedChannels?: string[];
  linkedWarehouses?: string[];
  /**
   * Runtime-only store order deadline estimate in business days.
   *
   * Order creation can set this on the product snapshot embedded in an order
   * item when linked/source channel lead times require a longer production
   * deadline than the store product's own selected price volume.
   */
  deadlineDeliveryTime?: number;
  channelId?: string;
  specialNotes?: string;
}

export interface ProductTranslation
  extends Omit<Base, "name">, TranslatedContentMetadata {
  id: string;
  locale: Locale; // e.g., "en", "pl", "de"
  name: string;
  description?: string;
  seo?: {
    title?: string;
    description?: string;
    slug?: string;
  };
  specialNotes?: string;
}

export interface ProductTranslationCreate extends ProductTranslation {}

export interface ProductTranslationCreateForm extends Omit<
  ProductTranslationCreate,
  "id" | "createdAt" | "updatedAt" | "updatedBy"
> {}

export interface ProductTranslationUpdate extends Omit<
  ProductTranslation,
  "id" | "createdAt" | "createdBy"
> {}

export interface ProductTranslationUpdateForm extends Omit<
  ProductTranslationUpdate,
  "updatedAt"
> {}

export type CardProduct = {
  id: Product["id"];
  slug: Product["seo"]["slug"];
  name: Product["name"];
  images: Product["spec"]["images"];
  isNew: boolean;
  attributes?: Product["attributes"];
  attributeOptions?: Product["attributeOptions"];
  categoryName?: string;
  startingFrom?: {
    formattedPrice: string;
    unit: UnitId;
  };
  rating?: number;
  channelId?: string;
};

export type CategorizedCardProducts = {
  [categoryName: string]: (CardProduct & { channelName?: string })[];
};

export type NavigationProductsMenuProduct = CardProduct & {
  categoryId?: string | null;
  channelName?: string;
};

export type NavigationProductsMenuCategory = {
  id: string;
  name: string;
  parentId?: string | null;
  path?: CategoryPathSegment[];
  productCount: number;
  products: NavigationProductsMenuProduct[];
  children: NavigationProductsMenuCategory[];
};

export type NavigationProductsMenuPayload = {
  categories: NavigationProductsMenuCategory[];
};

export interface ProductCreate extends Product {
  toChannel?: {
    id?: string;
  };
}

export interface ProductCreateForm extends Omit<
  ProductCreate,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "updatedBy"
  | "keywords"
  | "averageRating"
  | "averageRating"
  | "linkedChannels"
  | "linkedWarehouses"
  | "deadlineDeliveryTime"
  | "availableLocales"
  | "tenantId"
> {}

export interface ProductUpdate extends Omit<
  Product,
  | "id"
  | "createdAt"
  | "createdBy"
  | "prices"
  | "averageRating"
  | "linkedChannels"
  | "linkedWarehouses"
  | "deadlineDeliveryTime"
  | "availableLocales"
  | "tenantId"
> {
  prices?: Product["prices"];
}

export interface ProductUpdateForm extends Omit<
  ProductUpdate,
  "updatedAt" | "keywords" | "tenantId"
> {}

export type NestedProduct = Omit<
  Product,
  | "availability"
  | "seo"
  | "number"
  | "customSizes"
  | "createdBy"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "availability"
  | "keywords"
  | "active"
  | "averageRating"
  | "linkedChannels"
  | "specialNotes"
  | "availableLocales"
  | "tenantId"
>;

export type FormattedProduct = {
  id: Product["id"];
  name: Product["name"];
  allowCustomPrice?: Product["allowCustomPrice"];
  channelId?: Product["channelId"];
  defaultPrice?: Product["defaultPrice"];
  disablePriceFetch?: Product["disablePriceFetch"];
  linkedWarehouses?: Product["linkedWarehouses"];
  prefferedUnit?: Product["prefferedUnit"];
  priceType?: Product["priceType"];
  provider?: Product["provider"];
  seo?: Product["seo"];
  spec: {
    images: Product["spec"]["images"];
  };
};

type DesignSpec = {
  dpi?: number;
  bleed?: number;
  includeBleed?: boolean;
};

export type CustomSize = {
  label: string;
  width: number;
  height: number;
};
