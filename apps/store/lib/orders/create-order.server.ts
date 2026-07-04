import "server-only";

import {
  ActivityStatus,
  type Address,
  AddressTypeEnum,
  Attribute,
  ApplicationMethodTargetTypeEnum,
  Campaign,
  CommerceWebhookEventType,
  type CurrencyCode,
  type CurrencyConversionSnapshot,
  type CurrencySettings,
  Customer,
  DynamicPricingPreset,
  DesignatedPickupArea,
  Discount,
  type IDiscount,
  isNestedCustomer,
  OrderFilesStatus,
  OrderItem,
  OrderStatus,
  OrderRiskAnalysisSource,
  type PaymentMethodsSettings,
  PaymentStatus,
  PaymentType,
  Price,
  type PriceList,
  Product,
  ProductPrice,
  Promotion,
  type PromotionRuleContext,
  ProofingOptions,
  Settings,
  type ShippingMethodsSettings,
  type Stock,
  StoreOrder,
  StoreCreditTransactionType,
  type TaxSettings,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  allocateOrderNumberInTransaction,
  requireTenantContextTenantId,
  tenantFirestorePaths,
  withTenantId,
} from "@konfi/firebase";
import {
  applyPromotion,
  applyPriceListToProductPrices,
  buildDynamicPricesForSelection,
  calculateConfiguredProductPrice,
  convertCurrencyMinorAmount,
  CURRENCIES_SETTINGS_DOC_ID,
  DEFAULT_COMBINATION,
  generateKeywords,
  getEstimatedDelivery,
  getOrderItemDeliveryTime,
  isPurchasable,
  parseDynamicSelectionFromCombination,
  getPickupAreasByShippingOption,
  getShippingMethodPrice,
  getSubtotalPrice,
  isStoreCreditRedemptionAllowed,
  isAnonymousPackageShippingAllowedFor,
  isShippingFree,
  normalizeCurrencyCode,
  normalizeCurrencySettings,
  normalizeAnonymousPackageLabelAddress,
  normalizeInvoiceRecipientAddress,
  normalizePaymentMethodsSettings,
  normalizeShippingMethodsSettings,
  normalizeStoreCreditAmount,
  PAYMENT_METHODS_SETTINGS_DOC_ID,
  removeUndefined,
  resolveDynamicPricingConfig,
  SHIPPING_METHODS_SETTINGS_DOC_ID,
  StoreOrderSchema,
  buildOrderTaxSummary,
  TAX_SETTINGS_DOC_ID,
} from "@konfi/utils";
import { uniq } from "es-toolkit";
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";
import { after } from "next/server";

import {
  getCartAvailablePaymentTypes,
  getCartAvailableShippingOptions,
  getCartShippingRuleContext,
} from "../../context/cart-selections";
import { classifyStoreOrderPrintingMethods } from "./classify-printing-methods";
import { getAdminDb } from "../firebase/serverApp";
import type { StoreRuntimeConfig } from "../runtime-config";
import {
  assertSaasRuntimeModuleEnabled,
  assertSaasRuntimeQuota,
  isSaasRuntimeModuleEnabled,
  recordSaasRuntimeQuotaUsage,
} from "../saas-runtime-quotas";
import { emitCommerceWebhookEvent } from "../webhooks/outbound-webhooks.server";
import { startStoreOrderRiskAnalysis } from "../order-risk/start-workflow";
import { createCheckoutSession } from "../payments/create-checkout-session";
import {
  getPrzelewy24PaymentCredentials,
  getStripePaymentCredentials,
} from "../payments/tenant-payment-config";
import { deleteAppliedOneTimePromotions } from "../newsletter/newsletter-promotion.server";
import { moveCartFilesToOrder } from "./move-cart-files-to-order.server";
import { sendNewOrderNotifications } from "./new-order-notifications";
import { applyOrderItemProductPriceOffsets } from "./order-price-offsets";
import { resolveChannelProductsByIdForOrder } from "./channel-products.server";

import type { CreateStoreOrderRequest, CreateStoreOrderResult } from "./types";

function createErrorResult(error: string): CreateStoreOrderResult {
  return {
    id: "",
    message: "ORDER_CREATION_FAILED",
    url: "",
    error,
  };
}

type OrderRuntimeConfig = Pick<
  StoreRuntimeConfig,
  "adminBaseUrl" | "channelId" | "paymentProviders" | "storeBaseUrl"
>;

function getStoreChannelId(runtimeConfig?: OrderRuntimeConfig) {
  const storeChannelId =
    runtimeConfig?.channelId ?? process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;

  if (!storeChannelId) {
    throw new Error("NEXT_PUBLIC_STORE_CHANNEL_ID is not defined");
  }

  return storeChannelId;
}

function shouldScopeByTenant(tenantContext: TenantContext) {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

function applyTenantFilter<T>(
  query: Query<T>,
  tenantContext: TenantContext,
  operationName: string,
) {
  if (!shouldScopeByTenant(tenantContext)) {
    return query;
  }

  return query.where(
    "tenantId",
    "==",
    requireTenantContextTenantId(tenantContext, operationName),
  );
}

function withTenantOwned<T extends object>(
  data: T & { tenantId?: string },
  tenantContext: TenantContext,
  operationName: string,
): T & { tenantId?: string } {
  return shouldScopeByTenant(tenantContext)
    ? withTenantId(data, tenantContext, operationName)
    : data;
}

function isExternalCheckoutPaymentType(paymentType: string) {
  return (
    paymentType === PaymentType.STRIPE || paymentType === PaymentType.PRZELEWY24
  );
}

function tenantPaymentWebhookUrl({
  pathname,
  runtimeConfig,
  tenantContext,
}: {
  pathname: string;
  runtimeConfig?: OrderRuntimeConfig;
  tenantContext: TenantContext;
}) {
  if (!shouldScopeByTenant(tenantContext)) {
    return;
  }

  const tenantId = requireTenantContextTenantId(
    tenantContext,
    "tenant payment webhook URL",
  );

  if (!runtimeConfig?.adminBaseUrl) {
    throw new Error("Tenant payment webhook URL requires adminBaseUrl.");
  }

  return new URL(
    `${pathname}/${tenantId}`,
    runtimeConfig.adminBaseUrl,
  ).toString();
}

async function getCheckoutProviderOverrides({
  paymentType,
  runtimeConfig,
  tenantContext,
}: {
  paymentType: PaymentType | string;
  runtimeConfig?: OrderRuntimeConfig;
  tenantContext: TenantContext;
}) {
  if (paymentType === PaymentType.STRIPE) {
    return {
      adminBaseUrl: runtimeConfig?.adminBaseUrl,
      storeBaseUrl: runtimeConfig?.storeBaseUrl,
      stripeCredentials: await getStripePaymentCredentials(tenantContext),
    };
  }

  if (paymentType === PaymentType.PRZELEWY24) {
    return {
      adminBaseUrl: runtimeConfig?.adminBaseUrl,
      przelewy24Credentials:
        await getPrzelewy24PaymentCredentials(tenantContext),
      przelewy24NotificationUrl: tenantPaymentWebhookUrl({
        pathname: "/api/payments/przelewy24/webhook",
        runtimeConfig,
        tenantContext,
      }),
      storeBaseUrl: runtimeConfig?.storeBaseUrl,
    };
  }

  return {
    adminBaseUrl: runtimeConfig?.adminBaseUrl,
    storeBaseUrl: runtimeConfig?.storeBaseUrl,
  };
}

async function notifyAdminFulfillmentOrderCreated(
  channelId: string,
  orderId: string,
  runtimeConfig?: OrderRuntimeConfig,
) {
  const adminUrl =
    runtimeConfig?.adminBaseUrl ||
    process.env.ADMIN_URL ||
    process.env.NEXT_PUBLIC_ADMIN_URL;
  const revalidateSecret = process.env.REVALIDATE_SECRET;

  if (!adminUrl || !revalidateSecret) {
    console.warn(
      "Skipping fulfillment order-created sync because ADMIN_URL/NEXT_PUBLIC_ADMIN_URL or REVALIDATE_SECRET is missing.",
    );
    return;
  }

  try {
    const url = new URL("/api/fulfillment/order-created", adminUrl);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${revalidateSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId,
        orderId,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Admin fulfillment sync failed with status ${response.status}`;

      try {
        const payload = (await response.json()) as { error?: string };
        errorMessage = payload.error ?? errorMessage;
      } catch {
        // Keep the fallback message if the response body is not JSON.
      }

      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error("Failed to trigger admin fulfillment order sync", error);
  }
}

export async function parseCreateStoreOrderRequest(
  payload: unknown,
): Promise<CreateStoreOrderRequest> {
  if (!payload || typeof payload !== "object") {
    throw new Error("INVALID_ARGUMENT");
  }

  const candidate = payload as Record<string, unknown>;
  const validatedForm = await StoreOrderSchema.validate(candidate, {
    abortEarly: false,
    stripUnknown: true,
  });

  const paymentType = candidate.paymentType;
  const shippingOption = candidate.shippingOption;

  if (typeof paymentType !== "string" || paymentType.length === 0) {
    throw new Error("INVALID_PAYMENT_TYPE");
  }

  if (typeof shippingOption !== "string" || shippingOption.length === 0) {
    throw new Error("INVALID_SHIPPING_OPTION");
  }

  const currency = normalizeCurrencyCode(candidate.currency);
  const currencySnapshot = parseCurrencyConversionSnapshot(
    candidate.currencySnapshot,
  );

  return {
    ...(validatedForm as Omit<
      CreateStoreOrderRequest,
      "paymentType" | "shippingOption" | "currency" | "currencySnapshot"
    >),
    ...(currency ? { currency } : {}),
    ...(currencySnapshot ? { currencySnapshot } : {}),
    paymentType,
    shippingOption,
  };
}

function parseCurrencyConversionSnapshot(
  value: unknown,
): CurrencyConversionSnapshot | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const fromCurrencyCode = normalizeCurrencyCode(candidate.fromCurrencyCode);
  const toCurrencyCode = normalizeCurrencyCode(candidate.toCurrencyCode);
  const amountMinor = parseSnapshotMinorAmount(candidate.amountMinor);
  const convertedAmountMinor = parseSnapshotMinorAmount(
    candidate.convertedAmountMinor,
  );
  const rate = parsePositiveFiniteNumber(candidate.rate);

  if (
    !fromCurrencyCode ||
    !toCurrencyCode ||
    amountMinor === undefined ||
    convertedAmountMinor === undefined ||
    rate === undefined
  ) {
    return undefined;
  }

  const percentOffset = parseFiniteNumber(candidate.percentOffset);
  const fixedOffsetMinorUnits = parseFiniteNumber(
    candidate.fixedOffsetMinorUnits,
  );

  return {
    fromCurrencyCode,
    toCurrencyCode,
    amountMinor,
    convertedAmountMinor,
    rate,
    ...(candidate.rateSource === "manual" ||
    candidate.rateSource === "automatic" ||
    candidate.rateSource === "default"
      ? { rateSource: candidate.rateSource }
      : {}),
    ...(percentOffset !== undefined ? { percentOffset } : {}),
    ...(fixedOffsetMinorUnits !== undefined ? { fixedOffsetMinorUnits } : {}),
    ...(typeof candidate.rateFetchedAt === "string"
      ? { rateFetchedAt: candidate.rateFetchedAt }
      : {}),
    ...(typeof candidate.settingsUpdatedAt === "string"
      ? { settingsUpdatedAt: candidate.settingsUpdatedAt }
      : {}),
    ...(typeof candidate.settingsVersion === "string" ||
    typeof candidate.settingsVersion === "number"
      ? { settingsVersion: candidate.settingsVersion }
      : {}),
    ...(typeof candidate.capturedAt === "string"
      ? { capturedAt: candidate.capturedAt }
      : {}),
  };
}

function parseSnapshotMinorAmount(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value)
    ? value
    : undefined;
}

function parsePositiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function parseFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

async function fetchPricesFromSubcollection(
  tenantContext: TenantContext,
  channelId: string,
  productId: string,
  calculatedCombination: string,
): Promise<Price[] | undefined> {
  const adminDb = getAdminDb();

  try {
    const specificDoc = await adminDb
      .collection(
        `${tenantFirestorePaths.productDoc(
          tenantContext,
          channelId,
          productId,
        )}/prices`,
      )
      .doc(calculatedCombination)
      .get();

    if (specificDoc.exists) {
      return (specificDoc.data() as ProductPrice).prices;
    }

    const defaultDoc = await adminDb
      .collection(
        `${tenantFirestorePaths.productDoc(
          tenantContext,
          channelId,
          productId,
        )}/prices`,
      )
      .doc(DEFAULT_COMBINATION)
      .get();

    if (defaultDoc.exists) {
      return (defaultDoc.data() as ProductPrice).prices;
    }

    return undefined;
  } catch (error) {
    console.error("Error fetching prices from subcollection:", error);
    return undefined;
  }
}

async function fetchDynamicPricingConfig(
  tenantContext: TenantContext,
  channelId: string,
  productId: string,
) {
  const adminDb = getAdminDb();

  try {
    const configDoc = await adminDb
      .collection(
        `${tenantFirestorePaths.productDoc(
          tenantContext,
          channelId,
          productId,
        )}/dynamicPricing`,
      )
      .doc("config")
      .get();

    return configDoc.exists
      ? (configDoc.data() as Product["dynamicPricing"])
      : undefined;
  } catch (error) {
    console.error("Error fetching dynamic pricing config:", error);
    return undefined;
  }
}

async function fetchDynamicPricingPresets(
  tenantContext: TenantContext,
  channelId: string,
  presetIds: string[],
): Promise<DynamicPricingPreset[]> {
  const adminDb = getAdminDb();
  const uniqueIds = Array.from(new Set(presetIds));

  if (uniqueIds.length === 0) {
    return [];
  }

  try {
    const presetSnapshots = await Promise.all(
      uniqueIds.map((presetId) =>
        adminDb
          .collection(
            tenantFirestorePaths.channelCollection(
              tenantContext,
              channelId,
              "dynamicPricingPresets",
            ),
          )
          .doc(presetId)
          .get(),
      ),
    );

    return presetSnapshots.flatMap((snapshot) =>
      snapshot.exists ? [snapshot.data() as DynamicPricingPreset] : [],
    );
  } catch (error) {
    console.error("Error fetching dynamic pricing presets:", error);
    return [];
  }
}

async function fetchDynamicPricingAttributes(
  tenantContext: TenantContext,
  attributeIds: Product["attributes"],
): Promise<
  Pick<
    Attribute,
    "calculateStockFromSheet" | "format" | "id" | "options" | "trackStock"
  >[]
> {
  const adminDb = getAdminDb();
  const uniqueIds = Array.from(new Set(attributeIds));

  if (uniqueIds.length === 0) {
    return [];
  }

  try {
    const attributeSnapshots = await Promise.all(
      uniqueIds.map((attributeId) =>
        adminDb.collection("attributes").doc(attributeId).get(),
      ),
    );

    return attributeSnapshots.flatMap((snapshot) =>
      snapshot.exists &&
      (!shouldScopeByTenant(tenantContext) ||
        snapshot.data()?.tenantId ===
          requireTenantContextTenantId(
            tenantContext,
            "dynamic pricing attributes",
          ))
        ? [
            snapshot.data() as Pick<
              Attribute,
              | "calculateStockFromSheet"
              | "format"
              | "id"
              | "options"
              | "trackStock"
            >,
          ]
        : [],
    );
  } catch (error) {
    console.error("Error fetching dynamic pricing attributes:", error);
    return [];
  }
}

async function fetchActivePriceLists(
  tenantContext: TenantContext,
): Promise<PriceList[]> {
  const adminDb = getAdminDb();

  try {
    const snapshot = await applyTenantFilter(
      adminDb.collection("priceLists").where("active", "==", true),
      tenantContext,
      "store order price lists",
    ).get();

    return snapshot.docs.map((doc) => doc.data() as PriceList);
  } catch (error) {
    console.error("Error fetching active price lists:", error);
    return [];
  }
}

function applyPriceListForOrderItem({
  channelId,
  customer,
  fallbackCurrency,
  priceLists,
  prices,
  product,
}: {
  channelId: string;
  customer: Customer;
  fallbackCurrency: CurrencyCode;
  priceLists: readonly PriceList[];
  prices: readonly Price[];
  product: Product;
}) {
  if (priceLists.length === 0) {
    return { prices: prices.map((price) => ({ ...price })) };
  }

  return applyPriceListToProductPrices({
    context: {
      channelId,
      currency:
        prices.find((price) => price.currency)?.currency ?? fallbackCurrency,
      customerGroupIds: customer.customerGroupIds,
      customerId: customer.id,
    },
    fallbackCurrency,
    priceLists,
    prices,
    product,
  });
}

async function fetchLinkedChannelDeadlineProducts({
  channelId,
  productIds,
  tenantContext,
}: {
  channelId: string;
  productIds: readonly string[];
  tenantContext: TenantContext;
}): Promise<Map<string, Product[]>> {
  const productIdSet = new Set(productIds.filter(Boolean));
  const productsById = new Map<string, Product[]>();

  if (productIdSet.size === 0) {
    return productsById;
  }

  try {
    const adminDb = getAdminDb();
    const snapshot = await adminDb
      .collectionGroup("products")
      .where("linkedChannels", "array-contains", channelId)
      .get();
    const scopedTenantId = shouldScopeByTenant(tenantContext)
      ? requireTenantContextTenantId(
          tenantContext,
          "linked channel deadline products",
        )
      : undefined;

    for (const docSnapshot of snapshot.docs) {
      const product = docSnapshot.data() as Product;
      const sourceChannelId =
        product.channelId ?? docSnapshot.ref.parent.parent?.id;

      if (
        !sourceChannelId ||
        sourceChannelId === channelId ||
        !productIdSet.has(product.id) ||
        (scopedTenantId && product.tenantId !== scopedTenantId)
      ) {
        continue;
      }

      const products = productsById.get(product.id) ?? [];
      products.push({
        ...product,
        channelId: sourceChannelId,
      });
      productsById.set(product.id, products);
    }
  } catch (error) {
    console.error("Error fetching linked channel deadline products:", error);
  }

  return productsById;
}

function buildOrderItemWithProductPrices({
  deadlineDeliveryTime,
  item,
  prices,
  product,
}: {
  deadlineDeliveryTime?: number;
  item: OrderItem;
  prices: readonly Price[];
  product: Product;
}): OrderItem {
  return {
    ...item,
    product: {
      ...product,
      ...(deadlineDeliveryTime !== undefined ? { deadlineDeliveryTime } : {}),
      prices: prices.map((price) => ({ ...price })),
    },
  };
}

async function resolveLinkedChannelDeadlineDeliveryTime({
  item,
  sourceProducts,
  storeDeliveryTime,
  tenantContext,
}: {
  item: OrderItem;
  sourceProducts: readonly Product[] | undefined;
  storeDeliveryTime: number | undefined;
  tenantContext: TenantContext;
}): Promise<number | undefined> {
  if (!sourceProducts || sourceProducts.length === 0) {
    return undefined;
  }

  let deadlineDeliveryTime: number | undefined;

  for (const sourceProduct of sourceProducts) {
    if (!sourceProduct.channelId) {
      continue;
    }

    let sourcePrices = sourceProduct.prices;
    const subcollectionPrices = await resolveProductPricesForItem(
      tenantContext,
      sourceProduct.channelId,
      sourceProduct,
      item,
    );

    if (subcollectionPrices && subcollectionPrices.length > 0) {
      sourcePrices = subcollectionPrices;
    }

    const sourceDeliveryTime = getOrderItemDeliveryTime(
      buildOrderItemWithProductPrices({
        item,
        prices: sourcePrices,
        product: sourceProduct,
      }),
    );

    if (sourceDeliveryTime === undefined) {
      continue;
    }

    const adjustedDeliveryTime =
      storeDeliveryTime === undefined
        ? sourceDeliveryTime
        : Math.max(1, sourceDeliveryTime - storeDeliveryTime);
    deadlineDeliveryTime = Math.max(
      deadlineDeliveryTime ?? 0,
      adjustedDeliveryTime,
    );
  }

  return deadlineDeliveryTime;
}

async function resolveProductPricesForItem(
  tenantContext: TenantContext,
  channelId: string,
  product: Product,
  item: OrderItem,
): Promise<Price[] | undefined> {
  if (product.priceType === "DYNAMIC") {
    const config =
      product.dynamicPricing ??
      (await fetchDynamicPricingConfig(tenantContext, channelId, product.id));

    if (!config?.enabled) {
      return undefined;
    }

    const dynamicPricingPresets = await fetchDynamicPricingPresets(
      tenantContext,
      channelId,
      config.linkedPresetIds ?? [],
    );
    const effectiveConfig = resolveDynamicPricingConfig(
      config,
      dynamicPricingPresets,
    );
    const dynamicPricingAttributes = await fetchDynamicPricingAttributes(
      tenantContext,
      product.attributes,
    );

    const selectedAttributeOptions = parseDynamicSelectionFromCombination(
      product,
      item.combination,
    );

    return applyOrderItemProductPriceOffsets({
      item,
      prices: buildDynamicPricesForSelection({
        calculatedCombination:
          item.calculatedCombination ?? DEFAULT_COMBINATION,
        config: effectiveConfig,
        context: {
          attributes: dynamicPricingAttributes,
          customFormat: item.customFormat,
          height: item.height,
          pageCount: item.pageCount,
          quantity: item.quantity,
          volume: item.volume ?? undefined,
          width: item.width,
        },
        currency: product.defaultPrice?.currency,
        product,
        selectedAttributeOptions,
      }),
      product,
      selectedAttributeOptions,
    });
  }

  const prices = await fetchPricesFromSubcollection(
    tenantContext,
    channelId,
    product.id,
    item.calculatedCombination ?? DEFAULT_COMBINATION,
  );

  if (!prices?.length) {
    return undefined;
  }

  return applyOrderItemProductPriceOffsets({
    item,
    prices,
    product,
  });
}

function validateProducts(
  items: OrderItem[],
  productsById: ReadonlyMap<string, Product>,
) {
  return items.every((item) => {
    const productId = item.product?.id;
    const product = productId ? productsById.get(productId) : undefined;
    if (!product) {
      return false;
    }
    return isPurchasable(product);
  });
}

function validatePrices(
  itemsWithOptionalDiscount: OrderItem[],
  productsById: ReadonlyMap<string, Product>,
  shippingPriceWithOptionalDiscount: number,
  shippingIsFree: boolean,
  totalPriceWithOptionalDiscount: number,
  totalPriceDiscount?: Discount,
  customerDiscount?: number,
  linkedProductsIds?: string[],
) {
  let totalPrice = 0;

  for (const item of itemsWithOptionalDiscount) {
    const itemProduct = item.product;
    if (!itemProduct) {
      return false;
    }

    const product = productsById.get(itemProduct.id);
    if (!product) {
      return false;
    }

    const prices = itemProduct.prices;
    if (!prices || prices.length === 0) {
      return false;
    }

    const hasPromotionDiscount = Boolean(item.discount.discountValue);
    const shouldApplyCustomerDiscount =
      !hasPromotionDiscount &&
      !linkedProductsIds?.includes(product.id) &&
      customerDiscount;

    const { result, error } = calculateConfiguredProductPrice({
      quantity: item.quantity,
      prices,
      priceType: product.priceType,
      discount: item.discount.discountValue ?? 0,
      calculatedCombination: item.calculatedCombination ?? undefined,
      volume: item.volume,
      customFormat: item.customFormat,
      width: item.width,
      height: item.height,
      minimumOrder: product.spec.minimumOrder,
      customPrice: null,
      bleed: product.designSpec?.includeBleed
        ? product.designSpec.bleed
        : undefined,
      customerDiscount: shouldApplyCustomerDiscount ? customerDiscount : 0,
      customSizes: item.customSizes,
      expressPercent: item.expressPercent,
      pageCount: item.pageCount,
      pageCountConfig: itemProduct.pageCount ?? product.pageCount,
    });

    if (error || result !== item.totalPrice) {
      return false;
    }

    totalPrice += result;
  }

  const calculatedTotalPrice = Math.floor(
    totalPrice +
      (shippingIsFree ? 0 : shippingPriceWithOptionalDiscount) -
      (totalPriceDiscount?.discountedAmount ?? 0),
  );

  return calculatedTotalPrice === totalPriceWithOptionalDiscount;
}

async function assignPickupAreaAutomatically(
  tenantContext: TenantContext,
  shippingOption: string,
): Promise<string | null> {
  const adminDb = getAdminDb();

  try {
    const pickupAreasSnapshot = await applyTenantFilter(
      adminDb.collection("designatedPickupAreas").where("active", "==", true),
      tenantContext,
      "designated pickup areas",
    ).get();

    const allPickupAreas: DesignatedPickupArea[] = pickupAreasSnapshot.docs.map(
      (doc) => doc.data() as DesignatedPickupArea,
    );

    if (allPickupAreas.length === 0) {
      return null;
    }

    const compatibleAreas = getPickupAreasByShippingOption(
      allPickupAreas,
      shippingOption,
    );

    return compatibleAreas[0]?.id ?? null;
  } catch (error) {
    console.error("Error assigning pickup area automatically:", error);
    return null;
  }
}

async function getPromotionsFromCodes(
  tenantContext: TenantContext,
  codes: string[],
) {
  if (codes.length === 0) {
    return [] as Promotion[];
  }

  const adminDb = getAdminDb();
  const querySnapshot = await applyTenantFilter(
    adminDb
      .collection("promotions")
      .where("code", "in", codes)
      .where("active", "==", true),
    tenantContext,
    "promotions by code",
  ).get();

  if (querySnapshot.empty) {
    return [] as Promotion[];
  }

  return await Promise.all(
    querySnapshot.docs.map(async (doc) => {
      const promotion = doc.data() as Promotion;
      if (!promotion.campaignId) {
        return promotion;
      }

      const campaignSnapshot = await adminDb
        .collection("campaigns")
        .doc(promotion.campaignId)
        .get();
      const campaignData = campaignSnapshot.data() as Campaign | undefined;
      const campaign =
        campaignData &&
        (!shouldScopeByTenant(tenantContext) ||
          campaignData.tenantId ===
            requireTenantContextTenantId(tenantContext, "promotion campaign"))
          ? campaignData
          : undefined;

      return {
        ...promotion,
        campaign,
      } satisfies Promotion;
    }),
  );
}

type StoreCheckoutStockPolicy = NonNullable<
  Settings["checkout"]
>["stockPolicy"];

type StoreCheckoutStockReservation = {
  productId: string;
  quantity: number;
  ref: DocumentReference;
};

function normalizeStoreCheckoutStockPolicy(
  checkoutSettings: Settings["checkout"] | undefined,
): StoreCheckoutStockPolicy {
  return checkoutSettings?.stockPolicy === "block" ? "block" : "allow";
}

function buildStoreCheckoutStockReservations({
  cartItems,
  channelId,
  tenantContext,
  warehouseId,
}: {
  cartItems: readonly OrderItem[];
  channelId: string;
  tenantContext: TenantContext;
  warehouseId: string;
}): StoreCheckoutStockReservation[] {
  const quantitiesByProductId = new Map<string, number>();

  for (const item of cartItems) {
    const productId = item.product?.id;
    if (!productId) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    quantitiesByProductId.set(
      productId,
      (quantitiesByProductId.get(productId) ?? 0) + item.quantity,
    );
  }

  const adminDb = getAdminDb();
  return [...quantitiesByProductId].map(([productId, quantity]) => ({
    productId,
    quantity,
    ref: adminDb.doc(
      `${tenantFirestorePaths.channelDocument(
        tenantContext,
        channelId,
        "warehouses",
        warehouseId,
      )}/stock/${productId}`,
    ),
  }));
}

async function reserveStoreCheckoutStockInTransaction(
  transaction: Transaction,
  reservations: readonly StoreCheckoutStockReservation[],
) {
  let stockSnapshots: DocumentSnapshot[];

  try {
    stockSnapshots = await Promise.all(
      reservations.map((reservation) => transaction.get(reservation.ref)),
    );
  } catch (error) {
    console.error("Stock validation failed", error);
    throw new Error("STOCK_CHECK_FAILED", { cause: error });
  }

  for (let index = 0; index < reservations.length; index++) {
    const reservation = reservations[index];
    const stockSnapshot = stockSnapshots[index];

    if (!stockSnapshot.exists) {
      throw new Error("STOCK_NOT_FOUND");
    }

    const stock = stockSnapshot.data() as Partial<Stock> | undefined;
    const total = typeof stock?.total === "number" ? stock.total : 0;
    const allocated =
      typeof stock?.allocated === "number" ? stock.allocated : 0;

    if (total - allocated < reservation.quantity) {
      throw new Error("INSUFFICIENT_STOCK");
    }
  }

  for (const reservation of reservations) {
    transaction.update(reservation.ref, {
      allocated: FieldValue.increment(reservation.quantity),
      updatedAt: Timestamp.now(),
      updatedBy: {
        id: "system",
        name: "System",
      },
    });
  }
}

async function warnStoreCheckoutStockAvailability(
  reservations: readonly StoreCheckoutStockReservation[],
) {
  if (reservations.length === 0) {
    return;
  }

  try {
    const stockSnapshots = await getAdminDb().getAll(
      ...reservations.map((reservation) => reservation.ref),
    );

    for (let index = 0; index < reservations.length; index++) {
      const reservation = reservations[index];
      const stockSnapshot = stockSnapshots[index];

      if (!stockSnapshot.exists) {
        console.warn(
          "Store checkout stock document is missing; allowing order",
          {
            productId: reservation.productId,
          },
        );
        continue;
      }

      const stock = stockSnapshot.data() as Partial<Stock> | undefined;
      const total = typeof stock?.total === "number" ? stock.total : 0;
      const allocated =
        typeof stock?.allocated === "number" ? stock.allocated : 0;
      const available = total - allocated;

      if (available < reservation.quantity) {
        console.warn("Store checkout stock is insufficient; allowing order", {
          available,
          productId: reservation.productId,
          requested: reservation.quantity,
        });
      }
    }
  } catch (error) {
    console.warn("Store checkout stock check failed; allowing order", error);
  }
}

async function getMainWarehouseId(
  tenantContext: TenantContext,
  channelId: string,
) {
  const channelDoc = await getAdminDb()
    .doc(tenantFirestorePaths.channelDoc(tenantContext, channelId))
    .get();

  if (!channelDoc.exists) {
    throw new Error(`Channel ${channelId} not found`);
  }

  const channelData = channelDoc.data() as
    | { warehouses?: string[] }
    | undefined;
  const warehouseId = channelData?.warehouses?.[0];

  if (!warehouseId) {
    throw new Error(`No warehouses found for channel ${channelId}`);
  }

  return warehouseId;
}

async function getChannelOrderCurrency(
  tenantContext: TenantContext,
  channelId: string,
) {
  const channelDoc = await getAdminDb()
    .doc(tenantFirestorePaths.channelDoc(tenantContext, channelId))
    .get();

  const channelData = channelDoc.data() as { currency?: string } | undefined;
  return normalizeCurrencyCode(channelData?.currency) ?? "PLN";
}

async function getChannelCurrencySettings(
  tenantContext: TenantContext,
  channelId: string,
): Promise<CurrencySettings> {
  const settingsPath = shouldScopeByTenant(tenantContext)
    ? tenantFirestorePaths.settingsDoc(
        tenantContext,
        channelId,
        CURRENCIES_SETTINGS_DOC_ID,
      )
    : `channels/${channelId}/settings/${CURRENCIES_SETTINGS_DOC_ID}`;
  const settingsDoc = await getAdminDb().doc(settingsPath).get();
  const settingsData = settingsDoc.data() as CurrencySettings | undefined;

  return normalizeCurrencySettings(settingsData);
}

async function getChannelSettingsDocument<TSettings>(
  tenantContext: TenantContext,
  channelId: string,
  docId: string,
): Promise<TSettings | undefined> {
  const settingsPath = shouldScopeByTenant(tenantContext)
    ? tenantFirestorePaths.settingsDoc(tenantContext, channelId, docId)
    : `channels/${channelId}/settings/${docId}`;

  const settingsDoc = await getAdminDb().doc(settingsPath).get();
  return settingsDoc.data() as TSettings | undefined;
}

async function getChannelTaxSettings(
  tenantContext: TenantContext,
  channelId: string,
): Promise<TaxSettings | undefined> {
  try {
    return await getChannelSettingsDocument<TaxSettings>(
      tenantContext,
      channelId,
      TAX_SETTINGS_DOC_ID,
    );
  } catch (error) {
    console.error("Failed to load tax settings:", error);
    return undefined;
  }
}

async function createOrderCurrencySnapshot({
  amountMinor,
  channelId,
  fallbackCurrency,
  requestedCurrency,
  tenantContext,
}: {
  amountMinor: number;
  channelId: string;
  fallbackCurrency: CurrencyCode;
  requestedCurrency?: CurrencyCode;
  tenantContext: TenantContext;
}): Promise<{
  currency: CurrencyCode;
  snapshot: CurrencyConversionSnapshot;
}> {
  const settings = await getChannelCurrencySettings(tenantContext, channelId);
  const targetCurrency = requestedCurrency ?? settings.defaultCurrencyCode;
  const conversion = convertCurrencyMinorAmount({
    amountMinor,
    baseCurrency: fallbackCurrency,
    settings,
    targetCurrency,
  });

  if (conversion.ok) {
    return {
      currency: conversion.snapshot.toCurrencyCode,
      snapshot: {
        ...conversion.snapshot,
        capturedAt: Timestamp.now(),
      },
    };
  }

  return {
    currency: fallbackCurrency,
    snapshot: {
      fromCurrencyCode: fallbackCurrency,
      toCurrencyCode: fallbackCurrency,
      amountMinor,
      convertedAmountMinor: amountMinor,
      rate: 1,
      rateSource: "default",
      capturedAt: Timestamp.now(),
    },
  };
}

function scaleMinorAmount(
  amountMinor: number,
  sourceTotalMinor: number,
  targetTotalMinor: number,
): number {
  if (
    amountMinor <= 0 ||
    sourceTotalMinor <= 0 ||
    targetTotalMinor <= 0 ||
    !Number.isFinite(amountMinor) ||
    !Number.isFinite(sourceTotalMinor) ||
    !Number.isFinite(targetTotalMinor)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round((amountMinor / sourceTotalMinor) * targetTotalMinor),
  );
}

function scaleDiscountToSelectedCurrency(
  discount: IDiscount | null | undefined,
  sourceTotalMinor: number,
  targetTotalMinor: number,
): IDiscount | null {
  if (!discount) {
    return null;
  }

  const discountedAmount = scaleMinorAmount(
    discount.discountedAmount,
    sourceTotalMinor,
    targetTotalMinor,
  );
  const discountValue =
    discount.type === "FIXED"
      ? scaleMinorAmount(
          discount.discountValue,
          sourceTotalMinor,
          targetTotalMinor,
        )
      : discount.discountValue;

  return {
    ...discount,
    discountedAmount,
    discountValue,
  };
}

function distributeMinorAmountByWeight<T>(
  items: readonly T[],
  totalMinor: number,
  getWeight: (item: T) => number,
): number[] {
  if (items.length === 0) {
    return [];
  }

  const normalizedTotal = Math.max(0, Math.round(totalMinor));
  const weights = items.map((item) => Math.max(0, Math.round(getWeight(item))));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  if (weightTotal <= 0) {
    const baseAmount = Math.floor(normalizedTotal / items.length);
    const remainder = normalizedTotal - baseAmount * items.length;

    return items.map((_, index) => baseAmount + (index < remainder ? 1 : 0));
  }

  const distributed = weights.map((weight) =>
    Math.floor((normalizedTotal * weight) / weightTotal),
  );
  let remainder =
    normalizedTotal - distributed.reduce((sum, amount) => sum + amount, 0);
  let index = 0;

  while (remainder > 0) {
    distributed[index % distributed.length] += 1;
    remainder -= 1;
    index += 1;
  }

  return distributed;
}

function convertOrderItemsToSelectedCurrency(
  items: readonly OrderItem[],
  selectedSubtotalMinor: number,
): OrderItem[] {
  const selectedItemTotals = distributeMinorAmountByWeight(
    items,
    selectedSubtotalMinor,
    (item) => item.totalPrice,
  );

  return items.map((item, index) => {
    const selectedTotalPrice = selectedItemTotals[index] ?? 0;
    const selectedDiscount = scaleDiscountToSelectedCurrency(
      item.discount,
      item.totalPrice + (item.discount?.discountedAmount ?? 0),
      selectedTotalPrice +
        scaleMinorAmount(
          item.discount?.discountedAmount ?? 0,
          item.totalPrice,
          selectedTotalPrice,
        ),
    );

    return {
      ...item,
      totalPrice: selectedTotalPrice,
      discount: selectedDiscount ?? item.discount,
    };
  });
}

export async function createStoreOrder({
  request,
  authUid,
  isAdmin,
  tenantContext,
  runtimeConfig,
}: {
  request: CreateStoreOrderRequest;
  authUid: string;
  isAdmin: boolean;
  tenantContext: TenantContext;
  runtimeConfig?: OrderRuntimeConfig;
}): Promise<CreateStoreOrderResult> {
  const adminDb = getAdminDb();
  const channelId = getStoreChannelId(runtimeConfig);

  const cartSnapshot = await adminDb
    .collection(
      tenantFirestorePaths.cartItemsCollection(tenantContext, authUid),
    )
    .get();
  if (cartSnapshot.empty) {
    return createErrorResult("CART_EMPTY");
  }

  const cartItems = cartSnapshot.docs.map((doc) => doc.data() as OrderItem);
  const buyingSnapshot = await adminDb
    .doc(tenantFirestorePaths.settingsDoc(tenantContext, channelId, "buying"))
    .get();
  const buyingEnabled = Boolean(
    (buyingSnapshot.data() as { enabled?: boolean } | undefined)?.enabled,
  );

  if (!buyingEnabled) {
    return createErrorResult("BUYING_DISABLED");
  }

  await assertSaasRuntimeModuleEnabled({
    context: tenantContext,
    firestore: adminDb,
    module: "storefront",
    operation: "store.order.create",
  });

  if (request.proofing !== ProofingOptions.RUN_AS_IS) {
    await assertSaasRuntimeModuleEnabled({
      context: tenantContext,
      firestore: adminDb,
      module: "fileProofing",
      operation: "store.order.file-proofing",
    });
  }

  let customer = (
    await adminDb
      .doc(tenantFirestorePaths.customerDoc(tenantContext, authUid))
      .get()
  ).data() as Customer | undefined;

  if (!customer) {
    await assertSaasRuntimeQuota({
      context: tenantContext,
      firestore: adminDb,
      operation: "store.customer.create",
      resource: "customers",
    });

    const createdCustomer: Customer = {
      id: authUid,
      name: request.contact.name,
      addresses: [],
      allowedBankPayments: false,
      allowedOnPickupPayments: false,
      allowedDefferedPayments: false,
      createdBy: {
        id: "system",
        name: "System",
      },
      createdAt: Timestamp.now(),
      updatedBy: {
        id: "system",
        name: "System",
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(request.contact.name),
      specialNotes: "",
      storeCreditBalance: 0,
      active: true,
    };

    await adminDb
      .doc(tenantFirestorePaths.customerDoc(tenantContext, authUid))
      .set(withTenantOwned(createdCustomer, tenantContext, "store customer"));
    await recordSaasRuntimeQuotaUsage({
      context: tenantContext,
      firestore: adminDb,
      operation: "store.customer.create",
      resource: "customers",
    });
    customer = createdCustomer;
  }

  const productIds = uniq(
    cartItems.flatMap((item) => {
      const productId = item.product?.id;
      return productId ? [productId] : [];
    }),
  );

  const [
    rawShippingMethodsSettings,
    rawPaymentMethodsSettings,
    products,
    shippingOptionsPricesSnap,
    freeShippingSnap,
    checkoutSnap,
  ] = await Promise.all([
    getChannelSettingsDocument<ShippingMethodsSettings>(
      tenantContext,
      channelId,
      SHIPPING_METHODS_SETTINGS_DOC_ID,
    ),
    getChannelSettingsDocument<PaymentMethodsSettings>(
      tenantContext,
      channelId,
      PAYMENT_METHODS_SETTINGS_DOC_ID,
    ),
    resolveChannelProductsByIdForOrder({
      channelId,
      productIds,
      tenantContext,
    }),
    adminDb
      .doc(
        tenantFirestorePaths.settingsDoc(
          tenantContext,
          channelId,
          "shippingOptionsPrices",
        ),
      )
      .get(),
    adminDb
      .doc(
        tenantFirestorePaths.settingsDoc(
          tenantContext,
          channelId,
          "freeShipping",
        ),
      )
      .get(),
    adminDb
      .doc(
        tenantFirestorePaths.settingsDoc(tenantContext, channelId, "checkout"),
      )
      .get(),
  ]);

  const shippingMethodsSettings = normalizeShippingMethodsSettings(
    rawShippingMethodsSettings,
  );
  const paymentMethodsSettings = normalizePaymentMethodsSettings(
    rawPaymentMethodsSettings,
  );
  const initialShippingRuleContext = getCartShippingRuleContext(cartItems, {
    channelId,
    country: request.shipping?.country,
    postalCode: request.shipping?.zip,
    subtotal: getSubtotalPrice(cartItems),
  });
  const availableShippingOptions = getCartAvailableShippingOptions(
    cartItems,
    shippingMethodsSettings,
    initialShippingRuleContext,
  );
  if (availableShippingOptions.length === 0) {
    return createErrorResult("NO_AVAILABLE_SHIPPING_OPTIONS");
  }

  if (!availableShippingOptions.includes(request.shippingOption)) {
    return createErrorResult("INVALID_SHIPPING_OPTION");
  }

  const availablePaymentTypes = getCartAvailablePaymentTypes(
    request.shippingOption,
    customer,
    request.anonymousPackageShipping,
    request.currency,
    paymentMethodsSettings,
    runtimeConfig?.paymentProviders,
  );
  if (!availablePaymentTypes.includes(request.paymentType)) {
    return createErrorResult("INVALID_PAYMENT_TYPE");
  }

  if (
    request.anonymousPackageShipping &&
    (!request.shipping ||
      !isAnonymousPackageShippingAllowedFor(request.shipping.country))
  ) {
    return createErrorResult("ANONYMOUS_SHIPPING_DOMESTIC_ONLY");
  }

  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );

  const shippingOptionsPrices = shippingOptionsPricesSnap.data() as
    | Settings["shippingOptionsPrices"]
    | undefined;

  const freeShipping = freeShippingSnap.data() as
    | Settings["freeShipping"]
    | undefined;

  const checkoutSettings = checkoutSnap.data() as
    | Settings["checkout"]
    | undefined;

  if (!shippingOptionsPrices) {
    throw new Error("shippingOptionsPrices is not defined");
  }

  if (!freeShipping) {
    throw new Error("freeShipping is not defined");
  }

  if (checkoutSettings?.invoiceEnabled === false && request.invoice) {
    return createErrorResult("INVOICE_UNAVAILABLE");
  }

  const itemsWithProducts: OrderItem[] = [];
  const [activePriceLists, channelOrderCurrency] = await Promise.all([
    fetchActivePriceLists(tenantContext),
    getChannelOrderCurrency(tenantContext, channelId),
  ]);
  const linkedDeadlineProductsById = await fetchLinkedChannelDeadlineProducts({
    channelId,
    productIds,
    tenantContext,
  });

  for (const item of cartItems) {
    const productId = item.product?.id;
    const product = productId ? productsById.get(productId) : undefined;
    if (!product) {
      return createErrorResult("PRODUCT_NOT_FOUND");
    }

    let prices = applyOrderItemProductPriceOffsets({
      item,
      prices: product.prices,
      product,
    });
    const productChannelId = product.channelId ?? channelId;
    const subcollectionPrices = await resolveProductPricesForItem(
      tenantContext,
      productChannelId,
      product,
      item,
    );

    if (subcollectionPrices && subcollectionPrices.length > 0) {
      prices = subcollectionPrices;
    }

    const priceListResult = applyPriceListForOrderItem({
      channelId: productChannelId,
      customer,
      fallbackCurrency:
        normalizeCurrencyCode(product.defaultPrice?.currency) ??
        channelOrderCurrency,
      priceLists: activePriceLists,
      prices,
      product,
    });
    prices = priceListResult.prices;

    const storeDeliveryTime = getOrderItemDeliveryTime(
      buildOrderItemWithProductPrices({
        item,
        prices,
        product,
      }),
    );
    const linkedDeadlineDeliveryTime =
      await resolveLinkedChannelDeadlineDeliveryTime({
        item,
        sourceProducts: linkedDeadlineProductsById.get(product.id),
        storeDeliveryTime,
        tenantContext,
      });
    const deadlineDeliveryTime =
      linkedDeadlineDeliveryTime !== undefined
        ? Math.max(storeDeliveryTime ?? 0, linkedDeadlineDeliveryTime)
        : undefined;

    itemsWithProducts.push({
      ...item,
      ...(priceListResult.application
        ? { priceListApplication: priceListResult.application }
        : {}),
      product: {
        ...product,
        ...(deadlineDeliveryTime !== undefined ? { deadlineDeliveryTime } : {}),
        prices,
      },
    });
  }

  const estimatedDelivery = getEstimatedDelivery(itemsWithProducts);

  if (!estimatedDelivery) {
    return createErrorResult("ESTIMATED_DELIVERY_UNAVAILABLE");
  }

  const orderCurrency =
    normalizeCurrencyCode(
      itemsWithProducts[0]?.product?.defaultPrice?.currency,
    ) ?? channelOrderCurrency;

  let itemsWithOptionalDiscount: OrderItem[] | undefined;
  let shippingPriceDiscount: Discount | undefined;
  let totalPriceDiscount: Discount | undefined;

  if (request.appliedPromotionCodes.length > 0) {
    const promotions = await getPromotionsFromCodes(
      tenantContext,
      uniq(request.appliedPromotionCodes),
    );
    const promotionSubtotal = getSubtotalPrice(itemsWithProducts);
    const promotionShippingRuleContext = getCartShippingRuleContext(
      itemsWithProducts,
      {
        channelId,
        country: request.shipping?.country,
        postalCode: request.shipping?.zip,
        subtotal: promotionSubtotal,
      },
    );
    const promotionShippingPrice = getShippingMethodPrice(
      request.shippingOption,
      shippingOptionsPrices[request.shippingOption],
      shippingMethodsSettings,
      promotionShippingRuleContext,
    );
    const promotionRuleContext: PromotionRuleContext = {
      channelId,
      customerGroupIds: customer.customerGroupIds,
      isFirstOrder: !customer.orders?.length,
    };

    for (const promotion of promotions) {
      if (
        promotion.applicationMethod?.targetType ===
        ApplicationMethodTargetTypeEnum.ITEMS
      ) {
        const result = applyPromotion(
          promotion,
          itemsWithProducts,
          undefined,
          undefined,
          promotion.campaign,
          undefined,
          authUid,
          promotionSubtotal,
          orderCurrency,
          promotionRuleContext,
        );

        if (!result.itemsWithDiscount) {
          return createErrorResult("PROMOTION_APPLICATION_FAILED");
        }

        itemsWithOptionalDiscount = result.itemsWithDiscount;
        continue;
      }

      if (
        promotion.applicationMethod?.targetType ===
        ApplicationMethodTargetTypeEnum.SHIPPING_METHODS
      ) {
        const result = applyPromotion(
          promotion,
          undefined,
          promotionShippingPrice,
          undefined,
          promotion.campaign,
          undefined,
          authUid,
          promotionSubtotal,
          orderCurrency,
          promotionRuleContext,
        );

        if (!result.discount) {
          return createErrorResult("PROMOTION_APPLICATION_FAILED");
        }

        shippingPriceDiscount = result.discount;
        continue;
      }

      if (
        promotion.applicationMethod?.targetType ===
        ApplicationMethodTargetTypeEnum.ORDER
      ) {
        const baseShippingPrice = Math.max(
          0,
          promotionShippingPrice -
            (shippingPriceDiscount?.discountedAmount ?? 0),
        );
        const result = applyPromotion(
          promotion,
          undefined,
          undefined,
          promotionSubtotal + baseShippingPrice,
          promotion.campaign,
          undefined,
          authUid,
          promotionSubtotal,
          orderCurrency,
          promotionRuleContext,
        );

        if (!result.discount) {
          return createErrorResult("PROMOTION_APPLICATION_FAILED");
        }

        totalPriceDiscount = result.discount;
      }
    }
  }

  const itemsForOrder = itemsWithOptionalDiscount ?? itemsWithProducts;
  const subtotal = getSubtotalPrice(itemsForOrder);
  const shippingRuleContext = getCartShippingRuleContext(itemsForOrder, {
    channelId,
    country: request.shipping?.country,
    postalCode: request.shipping?.zip,
    subtotal,
  });
  const ruleShippingPrice = getShippingMethodPrice(
    request.shippingOption,
    shippingOptionsPrices[request.shippingOption],
    shippingMethodsSettings,
    shippingRuleContext,
  );
  const shippingIsFree = isShippingFree(
    subtotal,
    freeShipping.enabled,
    freeShipping.min,
  );
  const shippingBasePrice = Math.max(
    0,
    ruleShippingPrice - (shippingPriceDiscount?.discountedAmount ?? 0),
  );
  const resolvedShippingPrice = shippingIsFree ? 0 : shippingBasePrice;
  const resolvedTotalPrice = Math.floor(
    subtotal +
      resolvedShippingPrice -
      (totalPriceDiscount?.discountedAmount ?? 0),
  );
  const requestedStoreCreditAmount = normalizeStoreCreditAmount(
    request.storeCreditAmount,
  );

  if (
    requestedStoreCreditAmount > 0 &&
    request.currency &&
    request.currency !== orderCurrency
  ) {
    return createErrorResult("INVALID_STORE_CREDIT_CURRENCY");
  }

  if (
    !isStoreCreditRedemptionAllowed({
      balance: customer.storeCreditBalance,
      orderTotal: resolvedTotalPrice,
      requestedAmount: requestedStoreCreditAmount,
    })
  ) {
    return createErrorResult("STORE_CREDIT_EXCEEDS_BALANCE");
  }

  const storeCreditAmount = requestedStoreCreditAmount;
  const resolvedTotalPriceAfterStoreCredit = Math.max(
    0,
    resolvedTotalPrice - storeCreditAmount,
  );
  const selectedOrderCurrency = await createOrderCurrencySnapshot({
    amountMinor: resolvedTotalPriceAfterStoreCredit,
    channelId,
    fallbackCurrency: orderCurrency,
    requestedCurrency: request.currency,
    tenantContext,
  });
  if (
    storeCreditAmount > 0 &&
    selectedOrderCurrency.currency !== orderCurrency
  ) {
    return createErrorResult("INVALID_STORE_CREDIT_CURRENCY");
  }
  if (
    request.paymentType === PaymentType.PRZELEWY24 &&
    selectedOrderCurrency.currency !== "PLN"
  ) {
    return createErrorResult("INVALID_PAYMENT_TYPE");
  }

  const selectedShippingCurrency = await createOrderCurrencySnapshot({
    amountMinor: resolvedShippingPrice,
    channelId,
    fallbackCurrency: orderCurrency,
    requestedCurrency: selectedOrderCurrency.currency,
    tenantContext,
  });
  const selectedTotalPrice =
    selectedOrderCurrency.snapshot.convertedAmountMinor;
  const selectedTotalPriceBeforeStoreCredit =
    storeCreditAmount > 0
      ? selectedTotalPrice + storeCreditAmount
      : selectedTotalPrice;
  const selectedShippingPrice =
    selectedShippingCurrency.snapshot.convertedAmountMinor;
  const selectedDiscountScalingTotal =
    storeCreditAmount > 0 ? resolvedTotalPrice : selectedTotalPrice;
  const selectedTotalPriceDiscount = scaleDiscountToSelectedCurrency(
    totalPriceDiscount?.object,
    resolvedTotalPrice,
    selectedDiscountScalingTotal,
  );
  const selectedShippingPriceDiscount = scaleDiscountToSelectedCurrency(
    shippingPriceDiscount?.object,
    shippingBasePrice,
    selectedShippingPrice,
  );
  const selectedItemsSubtotal = Math.max(
    0,
    selectedTotalPriceBeforeStoreCredit -
      selectedShippingPrice +
      (selectedTotalPriceDiscount?.discountedAmount ?? 0),
  );
  const selectedItemsForOrder = convertOrderItemsToSelectedCurrency(
    itemsForOrder,
    selectedItemsSubtotal,
  );

  if (
    !validatePrices(
      itemsForOrder,
      productsById,
      shippingBasePrice,
      shippingIsFree,
      resolvedTotalPrice,
      totalPriceDiscount,
      customer.discount,
      isNestedCustomer(customer) ? customer.linkedProductsIds : undefined,
    )
  ) {
    return createErrorResult("INVALID_PRICES");
  }

  if (!validateProducts(cartItems, productsById)) {
    return createErrorResult("INVALID_PRODUCTS");
  }

  const stockPolicy = normalizeStoreCheckoutStockPolicy(checkoutSettings);
  let stockReservations: StoreCheckoutStockReservation[] = [];

  if (!isAdmin) {
    try {
      const warehouseId = await getMainWarehouseId(tenantContext, channelId);
      stockReservations = buildStoreCheckoutStockReservations({
        cartItems,
        channelId,
        tenantContext,
        warehouseId,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
        return createErrorResult("PRODUCT_NOT_FOUND");
      }

      if (stockPolicy === "block") {
        console.error("Stock validation failed", error);
        return createErrorResult("STOCK_CHECK_FAILED");
      }

      console.warn("Store checkout stock setup failed; allowing order", error);
    }
  }

  if (!isAdmin && stockPolicy === "allow") {
    await warnStoreCheckoutStockAvailability(stockReservations);
  }

  const ordersCollectionRef = adminDb.collection(
    tenantFirestorePaths.channelCollection(tenantContext, channelId, "orders"),
  );
  const orderRef = ordersCollectionRef.doc();

  await assertSaasRuntimeQuota({
    context: tenantContext,
    firestore: adminDb,
    operation: "store.order.create",
    resource: "ordersPerMonth",
  });

  const sanitizedItems = selectedItemsForOrder.map((item) => ({
    ...item,
    product: {
      id: item.product?.id ?? "",
      name: item.product?.name ?? "",
      channelId: item.product?.channelId ?? "",
      spec: {
        images: item.product?.spec?.images ?? [],
      },
    },
  }));
  const taxSettings = await getChannelTaxSettings(tenantContext, channelId);
  const taxSummary = buildOrderTaxSummary({
    country: request.billing?.country ?? request.shipping?.country,
    currency: selectedOrderCurrency.currency,
    items: selectedItemsForOrder,
    productsById,
    settings: taxSettings,
    shippingGrossAmount: selectedShippingPrice,
  });

  const shippingLineItem = resolvedShippingPrice
    ? {
        price_data: {
          currency: selectedOrderCurrency.currency.toLowerCase(),
          product_data: {
            name: "Dostawa",
          },
          unit_amount: selectedShippingPrice,
        },
        quantity: 1,
      }
    : undefined;

  const deadlineString = estimatedDelivery.toISOString().split("T")[0];
  const orderCustomer: StoreOrder["customer"] = {
    id: customer.id ?? authUid,
    name: customer.name ?? request.contact.name,
    specialNotes: customer.specialNotes ?? "",
    addresses: customer.addresses ?? [],
    allowedBankPayments: customer.allowedBankPayments ?? false,
    allowedOnPickupPayments: customer.allowedOnPickupPayments ?? false,
    allowedDefferedPayments: customer.allowedDefferedPayments ?? false,
  };

  if (isNestedCustomer(customer) && customer.b2b) {
    orderCustomer.b2b = customer.b2b;
    orderCustomer.linkedProductsIds = customer.linkedProductsIds;
  }

  const difficulty = Math.floor(
    Math.round(
      (cartItems.reduce((sum, item) => {
        const productId = item.product?.id;
        if (!productId) {
          return sum;
        }

        const product = productsById.get(productId);
        return sum + (product?.difficulty ?? 1);
      }, 0) /
        cartItems.length) *
        10,
    ),
  );

  let printingMethods: StoreOrder["printingMethods"] = [];
  const printingMethodsEnabled = await isSaasRuntimeModuleEnabled({
    context: tenantContext,
    firestore: adminDb,
    module: "printingMethods",
  });

  if (printingMethodsEnabled) {
    try {
      printingMethods = await classifyStoreOrderPrintingMethods({
        items: itemsForOrder,
        currentPrintingMethods: [],
        channelId,
      });
    } catch (error) {
      // Classification is best-effort back-office metadata and must never block
      // checkout — admin re-classifies on order save.
      console.error("Printing method classification failed", error);
      printingMethods = [];
    }
  }

  let designatedPickupAreaId = request.designatedPickupAreaId;
  if (!designatedPickupAreaId) {
    designatedPickupAreaId =
      (await assignPickupAreaAutomatically(
        tenantContext,
        request.shippingOption,
      )) ?? undefined;
  }

  const isTestOrder = process.env.NODE_ENV === "development" || isAdmin;
  const initialPaymentStatus =
    storeCreditAmount > 0 && selectedTotalPrice === 0
      ? PaymentStatus.COMPLETED
      : PaymentStatus.NEW;
  const checkoutOrder: Omit<StoreOrder, "number"> & {
    shippingLineItem?: {
      price_data: {
        currency: string;
        product_data: {
          name: string;
        };
        unit_amount: number;
      };
      quantity: number;
    };
  } = withTenantOwned(
    removeUndefined({
      id: orderRef.id,
      name: "",
      customer: orderCustomer,
      totalPrice: selectedTotalPrice,
      totalPriceDiscount: selectedTotalPriceDiscount,
      storeCreditRedemption:
        storeCreditAmount > 0
          ? {
              amount: storeCreditAmount,
              balanceAfter: Math.max(
                0,
                (customer.storeCreditBalance ?? 0) - storeCreditAmount,
              ),
              balanceBefore: customer.storeCreditBalance ?? 0,
              currency: orderCurrency,
            }
          : null,
      currency: selectedOrderCurrency.currency,
      currencySnapshot: selectedOrderCurrency.snapshot,
      difficulty,
      priority: 2,
      deadlineString,
      deadline: Timestamp.fromDate(new Date(deadlineString)),
      status: OrderStatus.NEW,
      paymentStatus: initialPaymentStatus,
      filesStatus:
        request.proofing === ProofingOptions.RUN_AS_IS
          ? OrderFilesStatus.FOR_PREPARATION
          : OrderFilesStatus.FOR_VERIFICATION,
      activities: [
        {
          type: ActivityStatus.ORDER_STATUS_UPDATE,
          value: OrderStatus.NEW,
          timestamp: Timestamp.now(),
        },
        {
          type: ActivityStatus.PAYMENT_STATUS_UPDATE,
          value: initialPaymentStatus,
          timestamp: Timestamp.now(),
        },
      ],
      messages: [],
      keywords: customer ? generateKeywords(customer.name) : [],
      paymentType: request.paymentType,
      shippingOption: request.shippingOption,
      anonymousPackageShipping: request.anonymousPackageShipping,
      anonymousPackageLabelAddress: request.anonymousPackageShipping
        ? normalizeAnonymousPackageLabelAddress(
            request.anonymousPackageLabelAddress,
          )
        : null,
      shipping: request.shipping,
      shippingPrice: selectedShippingPrice,
      shippingPriceDiscount: selectedShippingPriceDiscount,
      saveShippingAddress: request.saveShippingAddress,
      invoice: request.invoice,
      billing: request.billing
        ? normalizeInvoiceRecipientAddress(request.billing)
        : request.billing,
      saveBillingAddress: request.saveBillingAddress,
      specialNotes: request.specialNotes,
      invoiceNotes: request.invoiceNotes,
      contact: request.contact,
      userId: authUid,
      items: sanitizedItems,
      isTest: isTestOrder,
      channelId,
      createdBy: {
        id: "system",
        name: "System",
      },
      updatedBy: {
        id: "system",
        name: "System",
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      isFromStore: true,
      active: true,
      proofing: request.proofing,
      sendStatusChangeEmail: true,
      appliedPromotionCodes: request.appliedPromotionCodes,
      carriedOutBy: [],
      path: orderRef.path,
      designatedPickupAreaId,
      printingMethods,
      taxSummary,
      shippingLineItem,
    }),
    tenantContext,
    "store order",
  );

  if (isTestOrder) {
    if (
      selectedTotalPrice > 0 &&
      isExternalCheckoutPaymentType(request.paymentType)
    ) {
      const testSessionId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const testCheckoutSession = await createCheckoutSession(
        {
          ...checkoutOrder,
          // The real order number is allocated transactionally at persist time;
          // it is not used to build the checkout session.
          number: 0,
          id: testSessionId,
          path: testSessionId,
        },
        await getCheckoutProviderOverrides({
          paymentType: request.paymentType,
          runtimeConfig,
          tenantContext,
        }),
      );

      return {
        id: "test_order_id",
        message: "ORDER_CREATED_SUCCESFULLY",
        url: testCheckoutSession.url,
        error: undefined,
      };
    }

    return {
      id: "test_order_id",
      message: "ORDER_CREATED_SUCCESFULLY",
      url: "",
      error: undefined,
    };
  }

  let checkoutSession:
    | {
        id: string;
        url: string;
        paymentIntent: string | null;
      }
    | undefined;

  if (
    selectedTotalPrice > 0 &&
    isExternalCheckoutPaymentType(request.paymentType)
  ) {
    try {
      checkoutSession = await createCheckoutSession(
        // The real order number is allocated transactionally at persist time;
        // it is not used to build the checkout session.
        { ...checkoutOrder, number: 0 },
        await getCheckoutProviderOverrides({
          paymentType: request.paymentType,
          runtimeConfig,
          tenantContext,
        }),
      );
    } catch (error) {
      console.error("Failed to create checkout session", error);
      return createErrorResult("CHECKOUT_SESSION_CREATION_FAILED");
    }
  }

  const orderToPersist: Omit<StoreOrder, "number"> = removeUndefined({
    ...checkoutOrder,
    checkoutSession: checkoutSession
      ? {
          id: checkoutSession.id,
          url: checkoutSession.url,
          paymentIntent: checkoutSession.paymentIntent ?? "",
        }
      : undefined,
  });

  const customerUpdate: Record<string, unknown> = {
    orders: FieldValue.arrayUnion(orderRef.id),
    loyaltyPoints: FieldValue.increment(Math.round(resolvedTotalPrice / 100)),
  };
  if (storeCreditAmount > 0) {
    customerUpdate.storeCreditBalance =
      FieldValue.increment(-storeCreditAmount);
  }
  const addressUpdates: Address[] = [];

  if (request.saveShippingAddress) {
    addressUpdates.push({
      name: request.shipping?.name ?? "",
      type: AddressTypeEnum.SHIPPING,
      street: request.shipping?.street,
      zip: request.shipping?.zip,
      city: request.shipping?.city,
      country: request.shipping?.country,
      active: true,
    });
  }

  if (request.saveBillingAddress && request.billing) {
    addressUpdates.push(
      normalizeInvoiceRecipientAddress({
        ...request.billing,
        name: request.billing.name ?? "",
        type: AddressTypeEnum.BILLING,
        active: true,
      }),
    );
  }

  if (addressUpdates.length > 0) {
    customerUpdate.addresses = FieldValue.arrayUnion(...addressUpdates);
  }

  const tenantScopedCustomerUpdate = withTenantOwned(
    customerUpdate,
    tenantContext,
    "store customer update",
  );

  const customerRef = adminDb.doc(
    tenantFirestorePaths.customerDoc(tenantContext, customer.id),
  );
  const storeCreditTransactionRef =
    storeCreditAmount > 0
      ? customerRef.collection("storeCreditTransactions").doc()
      : undefined;

  // Captured inside the transaction so post-commit consumers (notifications)
  // see the number the order was actually persisted with.
  let allocatedOrderNumber = 0;

  try {
    await adminDb.runTransaction(async (transaction) => {
      const latestCustomerSnapshot = await transaction.get(customerRef);
      const latestCustomer = latestCustomerSnapshot.data() as
        | Customer
        | undefined;

      // Allocate the order number transactionally against a per-channel counter
      // (read phase). The counter and order writes happen below, after all reads.
      const { counterRef, nextNumber, orderNumber } =
        await allocateOrderNumberInTransaction(
          transaction,
          ordersCollectionRef,
        );
      allocatedOrderNumber = orderNumber;

      if (stockPolicy === "block" && stockReservations.length > 0) {
        await reserveStoreCheckoutStockInTransaction(
          transaction,
          stockReservations,
        );
      }

      const latestStoreCreditBalance = normalizeStoreCreditAmount(
        latestCustomer?.storeCreditBalance,
      );
      const storeCreditRedemption =
        storeCreditAmount > 0 && storeCreditTransactionRef
          ? {
              amount: storeCreditAmount,
              balanceAfter: latestStoreCreditBalance - storeCreditAmount,
              balanceBefore: latestStoreCreditBalance,
              currency: orderCurrency,
              transactionId: storeCreditTransactionRef.id,
            }
          : null;

      if (
        storeCreditAmount > 0 &&
        storeCreditAmount > latestStoreCreditBalance
      ) {
        throw new Error("STORE_CREDIT_EXCEEDS_BALANCE");
      }

      // `counterRef` is the admin SDK DocumentReference produced from
      // `ordersCollectionRef`; the helper returns it via its structural type, so
      // narrow it back to the transaction's expected reference type here.
      transaction.set(
        counterRef as unknown as Parameters<typeof transaction.set>[0],
        withTenantOwned({ nextNumber }, tenantContext, "order number counter"),
        { merge: true },
      );

      transaction.set(orderRef, {
        ...orderToPersist,
        number: orderNumber,
        storeCreditRedemption,
      });

      if (storeCreditRedemption && storeCreditTransactionRef) {
        transaction.set(
          storeCreditTransactionRef,
          withTenantOwned(
            {
              id: storeCreditTransactionRef.id,
              active: true,
              amount: -storeCreditAmount,
              balanceAfter: storeCreditRedemption.balanceAfter,
              createdAt: Timestamp.now(),
              createdBy: {
                id: "system",
                name: "System",
              },
              currency: orderCurrency,
              customerId: customer.id,
              name: `Order ${orderRef.id}`,
              orderId: orderRef.id,
              reason: "Store checkout redemption",
              type: StoreCreditTransactionType.REDEMPTION,
              updatedAt: Timestamp.now(),
              updatedBy: {
                id: "system",
                name: "System",
              },
            },
            tenantContext,
            "store credit transaction",
          ),
        );
      }

      transaction.set(customerRef, tenantScopedCustomerUpdate, {
        merge: true,
      });

      for (const cartItemDoc of cartSnapshot.docs) {
        transaction.delete(cartItemDoc.ref);
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STORE_CREDIT_EXCEEDS_BALANCE"
    ) {
      return createErrorResult("STORE_CREDIT_EXCEEDS_BALANCE");
    }

    if (
      error instanceof Error &&
      (error.message === "STOCK_NOT_FOUND" ||
        error.message === "INSUFFICIENT_STOCK" ||
        error.message === "STOCK_CHECK_FAILED")
    ) {
      return createErrorResult(error.message);
    }

    throw error;
  }
  await recordSaasRuntimeQuotaUsage({
    context: tenantContext,
    firestore: adminDb,
    operation: "store.order.create",
    resource: "ordersPerMonth",
  });

  after(async () => {
    try {
      await moveCartFilesToOrder({
        cartCustomerId: authUid,
        channelId,
        orderCustomerId: orderCustomer.id,
        orderId: orderRef.id,
        items: orderToPersist.items,
        tenantContext,
      });
    } catch (error) {
      console.error("Failed to move cart files to order", error);
    }
  });

  after(async () => {
    try {
      await deleteAppliedOneTimePromotions({
        appliedPromotionCodes: orderToPersist.appliedPromotionCodes,
        tenantContext,
      });
    } catch (error) {
      console.error("Failed to delete one-time promotions", error);
    }
  });

  await sendNewOrderNotifications(
    { ...orderToPersist, number: allocatedOrderNumber },
    { tenantContext },
  );
  await notifyAdminFulfillmentOrderCreated(
    channelId,
    orderRef.id,
    runtimeConfig,
  );
  after(async () => {
    const webhookPayload = {
      order: {
        id: orderRef.id,
        channelId,
        customerId: orderCustomer.id,
        currency: selectedOrderCurrency.currency,
        paymentStatus: initialPaymentStatus,
        paymentType: request.paymentType,
        shippingOption: request.shippingOption,
        storeCreditAmount,
        totalPrice: resolvedTotalPriceAfterStoreCredit,
      },
    };

    try {
      await emitCommerceWebhookEvent({
        channelId,
        eventType: CommerceWebhookEventType.ORDER_CREATED,
        payload: webhookPayload,
        subjectId: orderRef.id,
        tenantContext,
      });

      if (initialPaymentStatus === PaymentStatus.COMPLETED) {
        await emitCommerceWebhookEvent({
          channelId,
          eventType: CommerceWebhookEventType.PAYMENT_COMPLETED,
          payload: webhookPayload,
          subjectId: orderRef.id,
          tenantContext,
        });
      }
    } catch (error) {
      console.error("Failed to emit commerce webhook event", error);
    }
  });
  after(async () => {
    try {
      await startStoreOrderRiskAnalysis({
        channelId,
        orderId: orderRef.id,
        source: OrderRiskAnalysisSource.AUTO,
        tenantContext,
      });
    } catch (error) {
      console.error("Failed to start order risk analysis workflow:", error);
    }
  });

  return {
    id: orderRef.id,
    message: "ORDER_CREATED_SUCCESFULLY",
    url: checkoutSession?.url ?? "",
  };
}
