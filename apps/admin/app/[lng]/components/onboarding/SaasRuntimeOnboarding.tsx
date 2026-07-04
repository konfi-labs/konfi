"use client";

import { useCatalog } from "@/context/catalog";
import { useChannels } from "@/context/channels";
import { useConfiguration } from "@/context/configuration";
import { useCustomers } from "@/context/customers";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { getSupportTaxonomySettingsRef } from "@/lib/support-taxonomy-settings.client";
import { getTaxSettingsRef } from "@/lib/tax-settings.client";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { Badge, Box, HStack, Separator, Stack, Text } from "@chakra-ui/react";
import { ButtonLink, MaterialSymbol } from "@konfi/components";
import { db, tenant } from "@konfi/firebase";
import {
  type Channel,
  ShippingOptions,
  type Product,
  type TenantContext,
  type Warehouse,
} from "@konfi/types";
import {
  ADMIN_CATALOG,
  ADMIN_CATALOG_PRODUCTS_CREATE,
  ADMIN_CATALOG_PRODUCTS_EDIT,
  ADMIN_CHANNELS,
  ADMIN_CONFIG_ATTRIBUTES,
  ADMIN_CONFIG_ORDER_WORKFLOW_STATUSES,
  ADMIN_CONFIG_PAYMENT_METHODS,
  ADMIN_CONFIG_PRODUCT_TYPES,
  ADMIN_CONFIG_SHIPPING_METHODS,
  ADMIN_CONFIG_SUPPORT_TAXONOMY,
  ADMIN_CONFIG_TAXES,
  ADMIN_CONFIG_WAREHOUSES,
  ADMIN_CUSTOMERS,
  getEnabledOrderFileStatusDefinitions,
  getEnabledOrderWorkflowStatusDefinitions,
  getEnabledPaymentMethodDefinitions,
  getEnabledShippingMethodDefinitions,
  hasShippingDestination,
} from "@konfi/utils";
import { getCountFromServer, getDoc, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWRImmutable from "swr/immutable";

type SaasRuntimeOnboardingIntent = "order" | "product";
type SetupStepStatus = "complete" | "loading" | "pending";
type DefaultBackedSetupStepId = "pickup-address" | "rma-policy" | "tax";

type SetupStep = {
  actionLabel: string;
  defaultBackedId?: DefaultBackedSetupStepId;
  description: string;
  href: string;
  icon: string;
  id: string;
  status: SetupStepStatus;
  title: string;
};

type ChannelPolicySettingsPresence = {
  hasRmaPolicySettings: boolean;
  hasTaxSettings: boolean;
};

const ACKNOWLEDGED_DEFAULT_STEPS_STORAGE_KEY =
  "admin.saasOrderOnboarding.acknowledgedDefaultSteps.v1";

async function fetchPublishedProductCount(
  channelId: string,
  tenantContext: TenantContext,
) {
  const productQuery = db.query<Product>(
    firestore,
    `/channels/${channelId}/products`,
    1,
    undefined,
    tenant.queryConstraints(tenantContext, [
      where("active", "==", true),
      where("availability.published", "==", true),
    ]),
  );
  const snapshot = await getCountFromServer(productQuery);

  return snapshot.data().count;
}

async function fetchChannelPolicySettingsPresence(
  channelId: string,
): Promise<ChannelPolicySettingsPresence> {
  const [supportTaxonomySnapshot, taxSnapshot] = await Promise.all([
    getDoc(getSupportTaxonomySettingsRef(channelId)),
    getDoc(getTaxSettingsRef(channelId)),
  ]);
  const supportTaxonomy = supportTaxonomySnapshot.exists()
    ? supportTaxonomySnapshot.data()
    : null;

  return {
    hasRmaPolicySettings:
      Array.isArray(supportTaxonomy?.rmaReasonCategories) &&
      supportTaxonomy.rmaReasonCategories.length > 0 &&
      Array.isArray(supportTaxonomy.rmaStatuses) &&
      supportTaxonomy.rmaStatuses.length > 0,
    hasTaxSettings: taxSnapshot.exists(),
  };
}

function statusFrom(loading: boolean, complete: boolean): SetupStepStatus {
  if (complete) return "complete";
  return loading ? "loading" : "pending";
}

function getAcknowledgementScopeKey({
  channelId,
  tenantContext,
}: {
  channelId: string | null | undefined;
  tenantContext: TenantContext;
}) {
  return [
    tenantContext.deploymentMode,
    tenantContext.requireTenantId ? "tenant-required" : "tenant-optional",
    tenantContext.tenantId ?? "global",
    channelId ?? "no-channel",
  ].join(":");
}

function readAcknowledgedDefaultSteps(
  scopeKey: string,
): DefaultBackedSetupStepId[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(
      ACKNOWLEDGED_DEFAULT_STEPS_STORAGE_KEY,
    );
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const scopedSteps = parsed[scopeKey];

    return Array.isArray(scopedSteps)
      ? scopedSteps.filter(
          (step): step is DefaultBackedSetupStepId =>
            step === "pickup-address" ||
            step === "rma-policy" ||
            step === "tax",
        )
      : [];
  } catch (error) {
    console.error("Failed to read SaaS onboarding acknowledgements:", error);
    return [];
  }
}

function writeAcknowledgedDefaultSteps(
  scopeKey: string,
  steps: DefaultBackedSetupStepId[],
) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(
      ACKNOWLEDGED_DEFAULT_STEPS_STORAGE_KEY,
    );
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

    window.localStorage.setItem(
      ACKNOWLEDGED_DEFAULT_STEPS_STORAGE_KEY,
      JSON.stringify({
        ...parsed,
        [scopeKey]: steps,
      }),
    );
  } catch (error) {
    console.error("Failed to write SaaS onboarding acknowledgements:", error);
  }
}

function hasWarehousePickupAddress(warehouse: Warehouse | undefined): boolean {
  return (
    warehouse?.address?.active !== false &&
    hasShippingDestination(warehouse?.address)
  );
}

function getChannelWarehouses(
  channel: Channel | null,
  warehouses: Warehouse[] | null,
): Warehouse[] {
  if (!channel || !warehouses) return [];

  return (channel.warehouses ?? [])
    .map((warehouseId) =>
      warehouses.find((warehouse) => warehouse.id === warehouseId),
    )
    .filter((warehouse): warehouse is Warehouse => Boolean(warehouse));
}

function getPickupWarehouseActionHref({
  channel,
  channelWarehouses,
  warehouses,
}: {
  channel: Channel | null;
  channelWarehouses: Warehouse[];
  warehouses: Warehouse[] | null;
}) {
  if (!channel) return ADMIN_CHANNELS;

  const firstMissingAddressWarehouse = channelWarehouses.find(
    (warehouse) => !hasWarehousePickupAddress(warehouse),
  );
  if (firstMissingAddressWarehouse) {
    return `${ADMIN_CONFIG_WAREHOUSES}?edit=${firstMissingAddressWarehouse.id}`;
  }

  if (warehouses?.length) {
    return `${ADMIN_CHANNELS}?edit=${channel.id}`;
  }

  return `${ADMIN_CONFIG_WAREHOUSES}?type=create-new`;
}

function StepStatusBadge({ status }: { status: SetupStepStatus }) {
  const { t } = useT();

  if (status === "complete") {
    return (
      <Badge colorPalette="success" variant="subtle">
        {t("saasOnboarding.status.complete", { defaultValue: "Ready" })}
      </Badge>
    );
  }

  if (status === "loading") {
    return (
      <Badge colorPalette="gray" variant="subtle">
        {t("saasOnboarding.status.loading", { defaultValue: "Checking" })}
      </Badge>
    );
  }

  return (
    <Badge colorPalette="orange" variant="subtle">
      {t("saasOnboarding.status.pending", { defaultValue: "Setup needed" })}
    </Badge>
  );
}

function StepIcon({ status, icon }: { icon: string; status: SetupStepStatus }) {
  const resolvedIcon =
    status === "complete"
      ? "task_alt"
      : status === "loading"
        ? "progress_activity"
        : icon;
  const colorPalette =
    status === "complete"
      ? "success"
      : status === "loading"
        ? "gray"
        : "orange";

  return (
    <Box
      alignItems="center"
      bg={`${colorPalette}.subtle`}
      borderRadius="full"
      color={`${colorPalette}.fg`}
      display="flex"
      flexShrink={0}
      h={9}
      justifyContent="center"
      w={9}
    >
      <MaterialSymbol>{resolvedIcon}</MaterialSymbol>
    </Box>
  );
}

function SetupStepRow({
  onAcknowledgeDefaultStep,
  step,
}: {
  onAcknowledgeDefaultStep: (stepId: DefaultBackedSetupStepId) => void;
  step: SetupStep;
}) {
  const { i18n } = useT();
  const isActionDisabled = step.status === "loading";
  const handleActionClick = useCallback(() => {
    if (step.defaultBackedId) {
      onAcknowledgeDefaultStep(step.defaultBackedId);
    }
  }, [onAcknowledgeDefaultStep, step.defaultBackedId]);

  return (
    <Stack
      align={{ base: "stretch", md: "center" }}
      direction={{ base: "column", md: "row" }}
      gap={3}
      py={3}
    >
      <HStack align="flex-start" flex="1" gap={3} minW={0}>
        <StepIcon icon={step.icon} status={step.status} />
        <Box flex="1" minW={0}>
          <HStack align="center" gap={2} mb={1} wrap="wrap">
            <Text fontWeight="semibold">{step.title}</Text>
            <StepStatusBadge status={step.status} />
          </HStack>
          <Text color="fg.muted" fontSize="sm">
            {step.description}
          </Text>
        </Box>
      </HStack>
      {step.status !== "complete" && (
        <ButtonLink
          alignSelf={{ base: "stretch", md: "center" }}
          ariaLabel={step.actionLabel}
          disabled={isActionDisabled}
          href={step.href}
          lng={i18n.resolvedLanguage}
          onClick={handleActionClick}
          size="sm"
          variant="outline"
        >
          <MaterialSymbol>arrow_forward</MaterialSymbol>
          {step.actionLabel}
        </ButtonLink>
      )}
    </Stack>
  );
}

export function SaasRuntimeOnboarding({
  intent,
}: {
  intent: SaasRuntimeOnboardingIntent;
}) {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const isSaasRuntime = isSharedSaasTenantRuntime(tenantContext);
  const { channel, channels, loadingChannels } = useChannels();
  const {
    loadingProducts,
    loadingCategories,
    products,
    productsCount,
    categories,
    categoriesCount,
  } = useCatalog();
  const { customers, customersCount, loadingCustomers } = useCustomers();
  const {
    attributes,
    loadingAttributes,
    loadingProductTypes,
    loadingShopSettings,
    loadingWarehouses,
    productTypes,
    productTypesCount,
    warehouses,
    shippingMethodsSettings,
    paymentMethodsSettings,
    orderWorkflowStatusesSettings,
  } = useConfiguration();
  const acknowledgementScopeKey = useMemo(
    () =>
      getAcknowledgementScopeKey({
        channelId: channel?.id,
        tenantContext,
      }),
    [channel?.id, tenantContext],
  );
  const [acknowledgedDefaultSteps, setAcknowledgedDefaultSteps] = useState<
    DefaultBackedSetupStepId[]
  >([]);

  useEffect(() => {
    setAcknowledgedDefaultSteps(
      readAcknowledgedDefaultSteps(acknowledgementScopeKey),
    );
  }, [acknowledgementScopeKey]);

  const acknowledgeDefaultStep = useCallback(
    (stepId: DefaultBackedSetupStepId) => {
      setAcknowledgedDefaultSteps((previousSteps) => {
        if (previousSteps.includes(stepId)) return previousSteps;

        const nextSteps = [...previousSteps, stepId];
        writeAcknowledgedDefaultSteps(acknowledgementScopeKey, nextSteps);

        return nextSteps;
      });
    },
    [acknowledgementScopeKey],
  );

  const localHasPublishedProduct = useMemo(
    () =>
      products?.some(
        (product) =>
          product.active !== false && product.availability?.published === true,
      ) ?? false,
    [products],
  );
  const publishedProductsKey =
    isSaasRuntime && intent === "order" && channel
      ? [
          "saas-runtime-onboarding-published-products",
          channel.id,
          tenantContext.deploymentMode,
          tenantContext.requireTenantId,
          tenantContext.tenantId ?? "",
        ]
      : null;
  const { data: publishedProductCount, isLoading: loadingPublishedProducts } =
    useSWRImmutable(publishedProductsKey, () =>
      channel ? fetchPublishedProductCount(channel.id, tenantContext) : 0,
    );
  const policySettingsKey =
    isSaasRuntime && intent === "order" && channel
      ? [
          "saas-runtime-onboarding-policy-settings",
          channel.id,
          tenantContext.deploymentMode,
          tenantContext.requireTenantId,
          tenantContext.tenantId ?? "",
        ]
      : null;
  const {
    data: policySettingsPresence,
    isLoading: loadingPolicySettingsPresence,
  } = useSWRImmutable(policySettingsKey, () =>
    channel
      ? fetchChannelPolicySettingsPresence(channel.id)
      : {
          hasRmaPolicySettings: false,
          hasTaxSettings: false,
        },
  );

  const shippingMethods = useMemo(
    () => getEnabledShippingMethodDefinitions(shippingMethodsSettings),
    [shippingMethodsSettings],
  );
  const paymentMethods = useMemo(
    () => getEnabledPaymentMethodDefinitions(paymentMethodsSettings),
    [paymentMethodsSettings],
  );
  const orderStatuses = useMemo(
    () =>
      getEnabledOrderWorkflowStatusDefinitions(orderWorkflowStatusesSettings),
    [orderWorkflowStatusesSettings],
  );
  const fileStatuses = useMemo(
    () => getEnabledOrderFileStatusDefinitions(orderWorkflowStatusesSettings),
    [orderWorkflowStatusesSettings],
  );

  const hasChannel = Boolean(channel) || Boolean(channels?.length);
  const hasCustomers = customersCount > 0 || Boolean(customers?.length);
  const hasCategories = categoriesCount > 0 || Boolean(categories?.length);
  const hasAttributes = Boolean(attributes?.length);
  const hasProductTypes =
    productTypesCount > 0 || Boolean(productTypes?.length);
  const hasPublishedProduct =
    localHasPublishedProduct || (publishedProductCount ?? 0) > 0;
  const firstExistingProduct = products?.[0];
  const hasProducts = productsCount > 0 || Boolean(products?.length);
  const hasPickupShipping = shippingMethods.some(
    (method) => method.id === ShippingOptions.PERSONAL_COLLECTION,
  );
  const channelWarehouses = useMemo(
    () => getChannelWarehouses(channel, warehouses),
    [channel, warehouses],
  );
  const hasChannelWarehouse = channelWarehouses.length > 0;
  const hasChannelPickupAddress = channelWarehouses.some(
    hasWarehousePickupAddress,
  );
  const pickupWarehouseHref = getPickupWarehouseActionHref({
    channel,
    channelWarehouses,
    warehouses,
  });
  const hasShippingMethods = shippingMethods.length > 0;
  const hasPaymentMethods = paymentMethods.length > 0;
  const hasRmaPolicySettings =
    policySettingsPresence?.hasRmaPolicySettings === true ||
    acknowledgedDefaultSteps.includes("rma-policy");
  const hasTaxSettings =
    policySettingsPresence?.hasTaxSettings === true ||
    acknowledgedDefaultSteps.includes("tax");
  const hasOrderWorkflow =
    orderStatuses.some((status) => status.isInitial) &&
    fileStatuses.some((status) => status.isInitial);
  const shouldShowCatalogSetup =
    intent === "product" || !hasPublishedProduct || loadingPublishedProducts;

  const steps = useMemo<SetupStep[]>(() => {
    const nextSteps: SetupStep[] = [
      {
        actionLabel: t("saasOnboarding.actions.openChannels", {
          defaultValue: "Open channels",
        }),
        description: t("saasOnboarding.steps.channel.description", {
          defaultValue:
            "Orders and catalog items need an active sales channel before they can be saved.",
        }),
        href: hasChannel ? ADMIN_CHANNELS : `${ADMIN_CHANNELS}?type=create-new`,
        icon: "storefront",
        id: "channel",
        status: statusFrom(loadingChannels, hasChannel),
        title: t("saasOnboarding.steps.channel.title", {
          defaultValue: "Sales channel",
        }),
      },
    ];

    if (intent === "order") {
      nextSteps.push({
        actionLabel: t("saasOnboarding.actions.createCustomer", {
          defaultValue: "Create customer",
        }),
        description: t("saasOnboarding.steps.customer.description", {
          defaultValue:
            "Create at least one customer so the order form has a real buyer, contact, and address source.",
        }),
        href: `${ADMIN_CUSTOMERS}?type=create-new`,
        icon: "person_add",
        id: "customer",
        status: statusFrom(loadingCustomers, hasCustomers),
        title: t("saasOnboarding.steps.customer.title", {
          defaultValue: "Customer",
        }),
      });
    }

    if (shouldShowCatalogSetup) {
      nextSteps.push(
        {
          actionLabel: t("saasOnboarding.actions.createCategory", {
            defaultValue: "Create category",
          }),
          description: t("saasOnboarding.steps.category.description", {
            defaultValue:
              "A category is required by the product form and keeps the storefront catalog navigable.",
          }),
          href: `${ADMIN_CATALOG}?create=category`,
          icon: "category",
          id: "category",
          status: statusFrom(loadingCategories, hasCategories),
          title: t("saasOnboarding.steps.category.title", {
            defaultValue: "Product category",
          }),
        },
        {
          actionLabel: t("saasOnboarding.actions.createAttribute", {
            defaultValue: "Create attribute",
          }),
          description: t("saasOnboarding.steps.attribute.description", {
            defaultValue:
              "Attributes define configurable options such as size, paper, color, and finishing.",
          }),
          href: `${ADMIN_CONFIG_ATTRIBUTES}?type=create-new`,
          icon: "tune",
          id: "attribute",
          status: statusFrom(loadingAttributes, hasAttributes),
          title: t("saasOnboarding.steps.attribute.title", {
            defaultValue: "Product attribute",
          }),
        },
        {
          actionLabel: t("saasOnboarding.actions.createProductType", {
            defaultValue: "Create product type",
          }),
          description: t("saasOnboarding.steps.productType.description", {
            defaultValue:
              "Product types group attributes so matrix and dynamic products can be configured without rebuilding the same setup.",
          }),
          href: `${ADMIN_CONFIG_PRODUCT_TYPES}?type=create-new`,
          icon: "schema",
          id: "product-type",
          status: statusFrom(loadingProductTypes, hasProductTypes),
          title: t("saasOnboarding.steps.productType.title", {
            defaultValue: "Product type",
          }),
        },
      );
    }

    if (intent === "order") {
      nextSteps.push(
        {
          actionLabel:
            hasProducts && firstExistingProduct
              ? t("saasOnboarding.actions.reviewProduct", {
                  defaultValue: "Review product",
                })
              : t("saasOnboarding.actions.createProduct", {
                  defaultValue: "Create product",
                }),
          description: t("saasOnboarding.steps.product.description", {
            defaultValue:
              "Create and publish at least one product so it appears in order item search.",
          }),
          href:
            hasProducts && firstExistingProduct
              ? `${ADMIN_CATALOG_PRODUCTS_EDIT}/${firstExistingProduct.id}`
              : ADMIN_CATALOG_PRODUCTS_CREATE,
          icon: "add_box",
          id: "product",
          status: statusFrom(
            loadingProducts || loadingPublishedProducts,
            hasPublishedProduct,
          ),
          title: t("saasOnboarding.steps.product.title", {
            defaultValue: "Published product",
          }),
        },
        {
          actionLabel:
            channel && warehouses?.length && !hasChannelWarehouse
              ? t("saasOnboarding.actions.editChannel", {
                  defaultValue: "Edit channel",
                })
              : t("saasOnboarding.actions.configureWarehouse", {
                  defaultValue: "Configure warehouse",
                }),
          description: t("saasOnboarding.steps.pickupAddress.description", {
            defaultValue:
              "Personal pickup needs a warehouse linked to the channel with a complete pickup address.",
          }),
          defaultBackedId: "pickup-address",
          href: pickupWarehouseHref,
          icon: "warehouse",
          id: "pickup-address",
          status: hasPickupShipping
            ? statusFrom(
                loadingChannels || loadingWarehouses,
                acknowledgedDefaultSteps.includes("pickup-address") ||
                  (hasChannelWarehouse && hasChannelPickupAddress),
              )
            : "complete",
          title: t("saasOnboarding.steps.pickupAddress.title", {
            defaultValue: "Pickup address",
          }),
        },
        {
          actionLabel: t("saasOnboarding.actions.configureShipping", {
            defaultValue: "Configure shipping",
          }),
          description: t("saasOnboarding.steps.shipping.description", {
            defaultValue:
              "At least one enabled shipping method is needed for order delivery choices.",
          }),
          href: ADMIN_CONFIG_SHIPPING_METHODS,
          icon: "local_shipping",
          id: "shipping",
          status: statusFrom(loadingShopSettings, hasShippingMethods),
          title: t("saasOnboarding.steps.shipping.title", {
            defaultValue: "Shipping methods",
          }),
        },
        {
          actionLabel: t("saasOnboarding.actions.configurePayment", {
            defaultValue: "Configure payment",
          }),
          description: t("saasOnboarding.steps.payment.description", {
            defaultValue:
              "Enabled payment methods keep the order form from falling back to unavailable payment choices.",
          }),
          href: ADMIN_CONFIG_PAYMENT_METHODS,
          icon: "payments",
          id: "payment",
          status: statusFrom(loadingShopSettings, hasPaymentMethods),
          title: t("saasOnboarding.steps.payment.title", {
            defaultValue: "Payment methods",
          }),
        },
        {
          actionLabel: t("saasOnboarding.actions.configureTax", {
            defaultValue: "Configure tax",
          }),
          description: t("saasOnboarding.steps.tax.description", {
            defaultValue:
              "Review tax regions and rates before SaaS tenants issue taxable orders or invoices.",
          }),
          defaultBackedId: "tax",
          href: ADMIN_CONFIG_TAXES,
          icon: "receipt_long",
          id: "tax",
          status: statusFrom(loadingPolicySettingsPresence, hasTaxSettings),
          title: t("saasOnboarding.steps.tax.title", {
            defaultValue: "Tax settings",
          }),
        },
        {
          actionLabel: t("saasOnboarding.actions.configureRmaPolicy", {
            defaultValue: "Configure RMA policy",
          }),
          description: t("saasOnboarding.steps.rmaPolicy.description", {
            defaultValue:
              "Confirm RMA statuses and fault categories for returns, claims, exchanges, and reprints.",
          }),
          defaultBackedId: "rma-policy",
          href: ADMIN_CONFIG_SUPPORT_TAXONOMY,
          icon: "assignment_return",
          id: "rma-policy",
          status: statusFrom(
            loadingPolicySettingsPresence,
            hasRmaPolicySettings,
          ),
          title: t("saasOnboarding.steps.rmaPolicy.title", {
            defaultValue: "RMA policy",
          }),
        },
        {
          actionLabel: t("saasOnboarding.actions.configureWorkflow", {
            defaultValue: "Configure workflow",
          }),
          description: t("saasOnboarding.steps.workflow.description", {
            defaultValue:
              "Initial order and file statuses are needed for new orders to enter a valid workflow.",
          }),
          href: ADMIN_CONFIG_ORDER_WORKFLOW_STATUSES,
          icon: "fact_check",
          id: "workflow",
          status: statusFrom(loadingShopSettings, hasOrderWorkflow),
          title: t("saasOnboarding.steps.workflow.title", {
            defaultValue: "Order workflow",
          }),
        },
      );
    }

    return nextSteps;
  }, [
    hasAttributes,
    acknowledgedDefaultSteps,
    hasCategories,
    hasChannel,
    hasCustomers,
    hasOrderWorkflow,
    hasPaymentMethods,
    hasProducts,
    hasPickupShipping,
    hasRmaPolicySettings,
    hasChannelWarehouse,
    hasChannelPickupAddress,
    hasProductTypes,
    hasPublishedProduct,
    hasShippingMethods,
    hasTaxSettings,
    channel,
    intent,
    loadingAttributes,
    loadingCategories,
    loadingChannels,
    loadingCustomers,
    loadingProductTypes,
    loadingProducts,
    loadingPublishedProducts,
    loadingPolicySettingsPresence,
    loadingShopSettings,
    loadingWarehouses,
    shouldShowCatalogSetup,
    firstExistingProduct,
    pickupWarehouseHref,
    t,
    warehouses,
  ]);

  if (!isSaasRuntime) return null;

  const outstandingSteps = steps.filter((step) => step.status !== "complete");
  if (outstandingSteps.length === 0) return null;

  return (
    <Box
      bg={{ base: "white", _dark: "gray.950" }}
      borderColor="border"
      borderRadius="3xl"
      borderWidth="1px"
      mb={6}
      p={{ base: 4, md: 5 }}
    >
      <Stack gap={4}>
        <HStack align="flex-start" justify="space-between" gap={4}>
          <HStack align="flex-start" gap={3}>
            <Box
              alignItems="center"
              bg="primary.subtle"
              borderRadius="md"
              color="primary.fg"
              display="flex"
              flexShrink={0}
              h={10}
              justifyContent="center"
              w={10}
            >
              <MaterialSymbol>checklist</MaterialSymbol>
            </Box>
            <Box>
              <Text fontSize="lg" fontWeight="semibold">
                {intent === "order"
                  ? t("saasOnboarding.order.title", {
                      defaultValue: "First order setup",
                    })
                  : t("saasOnboarding.product.title", {
                      defaultValue: "Product setup checklist",
                    })}
              </Text>
              <Text color="fg.muted" fontSize="sm">
                {intent === "order"
                  ? t("saasOnboarding.order.description", {
                      defaultValue:
                        "Finish these setup items before creating the first SaaS tenant order.",
                    })
                  : t("saasOnboarding.product.description", {
                      defaultValue:
                        "Finish these catalog items before building the first configurable product.",
                    })}
              </Text>
            </Box>
          </HStack>
          <Badge colorPalette="orange" flexShrink={0} variant="subtle">
            {t("saasOnboarding.summary.missing", {
              count: outstandingSteps.length,
              defaultValue: "{{count}} missing",
            })}
          </Badge>
        </HStack>
        <Separator />
        <Stack gap={0} separator={<Separator />}>
          {steps.map((step) => (
            <SetupStepRow
              key={step.id}
              onAcknowledgeDefaultStep={acknowledgeDefaultStep}
              step={step}
            />
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
