import "server-only";

import {
  ActivityStatus,
  Customer,
  NestedMember,
  Order,
  type PaymentMethodId,
  PaymentStatus,
  PaymentType,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  requireTenantContextTenantId,
  tenantFirestorePaths,
} from "@konfi/firebase";
import { canChangePaymentMethod, normalizeCurrencyCode } from "@konfi/utils";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdminDb } from "../firebase/serverApp";
import { createCheckoutSession } from "../payments/create-checkout-session";
import {
  getPrzelewy24PaymentCredentials,
  getStripePaymentCredentials,
} from "../payments/tenant-payment-config";
import type { StoreRuntimeConfig } from "../runtime-config";
import { getCartAvailablePaymentTypes } from "../../context/cart-selections";

import type { ChangeStoreOrderPaymentMethodResult } from "./types";

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

function createErrorResult(
  message: string,
  error?: string,
): ChangeStoreOrderPaymentMethodResult {
  return {
    success: false,
    message,
    error,
  };
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
  if (
    !(tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId)
  ) {
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
  paymentType: PaymentMethodId;
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

async function getOrderCustomer(
  order: Order,
  tenantContext: TenantContext,
): Promise<Customer | undefined> {
  const customerId =
    typeof order.customer === "string" ? order.customer : order.customer.id;

  if (!customerId) {
    return undefined;
  }

  const customerDoc = await getAdminDb()
    .doc(tenantFirestorePaths.customerDoc(tenantContext, customerId))
    .get();

  if (!customerDoc.exists) {
    return undefined;
  }

  return customerDoc.data() as Customer | undefined;
}

export async function changeStoreOrderPaymentMethod({
  orderId,
  paymentType,
  authUid,
  actor,
  isAdmin,
  tenantContext,
  runtimeConfig,
}: {
  orderId: string;
  paymentType: PaymentMethodId;
  authUid: string;
  actor: NestedMember;
  isAdmin: boolean;
  tenantContext: TenantContext;
  runtimeConfig?: OrderRuntimeConfig;
}): Promise<ChangeStoreOrderPaymentMethodResult> {
  try {
    const adminDb = getAdminDb();
    const channelId = getStoreChannelId(runtimeConfig);

    const buyingDoc = await adminDb
      .doc(tenantFirestorePaths.settingsDoc(tenantContext, channelId, "buying"))
      .get();
    const buyingEnabled = Boolean(
      (buyingDoc.data() as { enabled?: boolean } | undefined)?.enabled,
    );

    if (!buyingEnabled) {
      return createErrorResult(
        "BUYING_DISABLED",
        "Buying is disabled for this channel",
      );
    }

    const orderRef = adminDb.doc(
      tenantFirestorePaths.orderDoc(tenantContext, channelId, orderId),
    );
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return createErrorResult("ORDER_NOT_FOUND", "Order not found");
    }

    const order = orderDoc.data() as Order;
    const isCustomerOwned =
      typeof order.customer === "string"
        ? order.customer === authUid
        : order.customer.id === authUid;

    if (!isCustomerOwned && !isAdmin) {
      return createErrorResult(
        "UNAUTHORIZED",
        "You are not authorized to change payment method for this order",
      );
    }

    if (!canChangePaymentMethod(order.paymentStatus, order.activities)) {
      return createErrorResult(
        "NOT_ELIGIBLE",
        "Payment method cannot be changed for this order.",
      );
    }

    const customer = await getOrderCustomer(order, tenantContext);
    const availablePaymentTypes = order.shippingOption
      ? getCartAvailablePaymentTypes(
          order.shippingOption,
          customer,
          order.anonymousPackageShipping,
          order.currency,
          undefined,
          runtimeConfig?.paymentProviders,
        )
      : [];
    const normalizedOrderCurrency = normalizeCurrencyCode(order.currency);
    const currencyAwarePaymentTypes =
      normalizedOrderCurrency && normalizedOrderCurrency !== "PLN"
        ? availablePaymentTypes.filter(
            (availablePaymentType) =>
              availablePaymentType !== PaymentType.PRZELEWY24,
          )
        : availablePaymentTypes;

    if (!currencyAwarePaymentTypes.includes(paymentType)) {
      return createErrorResult(
        "PAYMENT_TYPE_NOT_AVAILABLE",
        `Payment type ${paymentType} is not available for this order`,
      );
    }

    const now = Timestamp.now();
    const paymentMethodChangedActivity: Order["activities"][number] = {
      type: ActivityStatus.PAYMENT_METHOD_CHANGED,
      value: ActivityStatus.PAYMENT_METHOD_CHANGED,
      timestamp: now,
      metadata: {
        before: order.paymentType,
        after: paymentType,
      },
    };

    const updateData: FirebaseFirestore.UpdateData<Order> = {
      paymentType,
      paymentStatus: PaymentStatus.NEW,
      updatedAt: now,
      updatedBy: actor,
      activities: FieldValue.arrayUnion(paymentMethodChangedActivity),
    };
    const tenantScopedUpdateData =
      tenantContext.requireTenantId || tenantContext.deploymentMode === "saas"
        ? {
            ...updateData,
            tenantId: requireTenantContextTenantId(
              tenantContext,
              "store order payment method update",
            ),
          }
        : updateData;

    let checkoutSessionUrl: string | undefined;

    if (
      paymentType === PaymentType.STRIPE ||
      paymentType === PaymentType.PRZELEWY24
    ) {
      try {
        const checkoutSession = await createCheckoutSession(
          {
            ...order,
            paymentType,
            isTest: isAdmin || order.isTest,
          },
          {
            ...(await getCheckoutProviderOverrides({
              paymentType,
              runtimeConfig,
              tenantContext,
            })),
          },
        );

        tenantScopedUpdateData.checkoutSession = {
          id: checkoutSession.id,
          url: checkoutSession.url,
          paymentIntent: checkoutSession.paymentIntent ?? "",
        };
        checkoutSessionUrl = checkoutSession.url;
      } catch (error) {
        console.error("Failed to create checkout session:", error);
        return createErrorResult(
          "CHECKOUT_SESSION_CREATION_FAILED",
          "Failed to create checkout session for the new payment method",
        );
      }
    } else {
      tenantScopedUpdateData.checkoutSession = FieldValue.delete();
    }

    await orderRef.update(tenantScopedUpdateData);

    return {
      success: true,
      message: "PAYMENT_METHOD_CHANGED",
      checkoutSessionUrl,
    };
  } catch (error) {
    console.error("Error changing payment method:", error);
    return createErrorResult(
      "CHANGE_PAYMENT_METHOD_FAILED",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
