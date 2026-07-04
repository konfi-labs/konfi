"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  computeInitialEnableCustomDiscount,
  computeInitialHasInitializedProduct,
  createCombinationInputBaseKey,
  computeProductChanged,
  getOrderItemConfigurationResetValues,
  resolveCombinationInputBaseProduct,
  resolveMatrixVolume,
  resolveNonMatrixVolume,
  shouldShowIncompatibleConfigurationFallback,
  shouldShowUnavailableProductFallback,
  shouldClearConfiguration,
  shouldSeedCustomerDiscount,
} from "./combination-input-utils";
import { ConfigurationCostPanel } from "./ConfigurationCostPanel";
import { download } from "@/lib/firebase/storage";
import { getFirstUsableMatrixVolume } from "@/lib/product-form-prices";
import {
  Badge,
  Alert,
  Box,
  Button,
  Code,
  Container,
  Dialog,
  DialogOpenChangeDetails,
  Editable,
  Heading,
  HStack,
  IconButton,
  Input,
  Portal,
  Show,
  Skeleton,
  Text,
  VStack,
  Wrap,
} from "@chakra-ui/react";
import {
  CloseButton,
  CombinationProps,
  fetchPricesForProduct,
  Field,
  Item,
  MaterialSymbol,
  NumberInputField,
  NumberInputRoot,
  SelectInput,
  Switch,
  toaster,
  ToggleTip,
  type DynamicPriceFetchOptions,
} from "@konfi/components";
import {
  db,
  getDoc,
  getProductById,
  getProductsByIds,
  getPromotions,
} from "@konfi/firebase";
import {
  Discount as _Discount,
  Attribute,
  Configuration,
  CurrencyEnum,
  Customer,
  Discount,
  DiscountTypeEnum,
  FormattedProduct,
  isNestedCustomer,
  NestedProduct,
  OrderItem,
  Price,
  PriceTypeEnum,
  type PrintingMethodId,
  Product,
  Promotion,
  SpecOverrides,
  Unit,
} from "@konfi/types";
import {
  calcPrice,
  DEFAULT_COMBINATION,
  filterAttributes,
  getCombination,
  getRandomId,
  getUnitOptions,
  isElectron,
  isMatrixLikePriceType,
  resolveCalculatedCombination,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isEqual, isNull, isUndefined, union } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Firestore } from "firebase/firestore";
import dynamic from "next/dynamic";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  Dispatch,
  Fragment,
  memo,
  SetStateAction,
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Controller,
  FieldErrors,
  FieldValues,
  useController,
  useFieldArray,
  UseFieldArrayInsert,
  UseFieldArrayUpdate,
  useFormContext,
  UseFormGetValues,
  UseFormSetValue,
  useWatch,
} from "react-hook-form";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";

const Combination = dynamic<CombinationProps>(
  () => import("@konfi/components").then((mod) => mod.Combination),
  {
    loading: () => <Skeleton height={"100vh"} />,
    ssr: false,
  },
);

const DescriptionPreview = dynamic<{
  source: string;
}>(() => import("@konfi/components").then((mod) => mod.Preview), {
  loading: () => <Skeleton height={"100vh"} />,
  ssr: false,
});

type OverrideWarningPayload = {
  key: keyof SpecOverrides;
  value: number;
  min?: number;
  max?: number;
  step?: number;
};

type OverrideDialogState = {
  open: boolean;
  key?: keyof SpecOverrides;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
};

function useDiscountCalculation({
  customer,
  product,
  totalPriceWithoutDiscount,
  enableCustomDiscount,
  customDiscountValue,
  prevCustomerDiscount,
}: {
  customer: Customer | null;
  product: Product | undefined;
  totalPriceWithoutDiscount: number;
  enableCustomDiscount: boolean;
  customDiscountValue: number;
  prevCustomerDiscount?: number;
}) {
  // Calculate effective discount value
  const effectiveDiscountValue = useMemo(() => {
    // Use item custom discount only when explicitly enabled
    if (enableCustomDiscount) {
      return customDiscountValue;
    }

    if (!customer || !product) {
      return 0;
    }

    // For external/price-list based products (e.g. Fakturownia), never apply customer discount
    if (
      (product as Product).provider?.type === "FAKTUROWNIA" ||
      product.id.startsWith("fk_")
    ) {
      return 0;
    }

    // If product is in customer's linked products, no discount
    if (customer.linkedProductsIds?.includes(product.id)) {
      return 0;
    }

    return customer.discount || 0;
  }, [enableCustomDiscount, customer, product, customDiscountValue]);

  // Calculate discount amount
  const discountAmount = useMemo(() => {
    return Math.max(
      0,
      Math.floor(totalPriceWithoutDiscount * (effectiveDiscountValue / 100)),
    );
  }, [totalPriceWithoutDiscount, effectiveDiscountValue]);

  // Check if discount changed due to customer change
  const isDiscountChangedFromCustomer = useMemo(() => {
    // Only react to customer-driven changes when custom discount is OFF
    if (enableCustomDiscount) {
      return false;
    }
    // Don't trigger on first render when we don't have a previous snapshot
    if (prevCustomerDiscount === undefined) return false;

    if (!customer || !product) return false;

    // Mirror the same rules as for effective discount resolution
    const isExternalPriceListProduct =
      (product as Product).provider?.type === "FAKTUROWNIA" ||
      product.id.startsWith("fk_");
    const currentCustomerDiscountForProduct = isExternalPriceListProduct
      ? 0
      : customer.linkedProductsIds?.includes(product.id)
        ? 0
        : customer.discount || 0;

    // Trigger when the effective customer discount for this product changed
    return prevCustomerDiscount !== currentCustomerDiscountForProduct;
  }, [customer, product, prevCustomerDiscount, enableCustomDiscount]);

  return {
    effectiveDiscountValue,
    discountAmount,
    isDiscountChangedFromCustomer,
  };
}

async function fetchProduct(
  productId: string,
  index?: number,
  setValue?: UseFormSetValue<FieldValues>,
) {
  try {
    if (!productId) return undefined;
    // Skip Firestore lookup for external products (e.g., Fakturownia mapped as fk_*)
    if (productId.startsWith("fk_")) {
      return undefined;
    }
    const productResult = await getProductById(firestore, productId);
    if (!setValue || typeof index !== "number") return productResult;
    setValue(`items[${index}].product`, productResult);
    return productResult;
  } catch (error) {
    console.error("Error fetching product:", error);
    return undefined;
  }
}

async function fetchPromotions(firestoreInstance: Firestore, product: Product) {
  try {
    if (!product) return undefined;
    const promotionsResult = await getPromotions(firestoreInstance, product);
    return promotionsResult;
  } catch (error) {
    console.error("Error fetching promotions:", error);
    return undefined;
  }
}

async function fetchCustomerLinkedProducts(linkedProductsIds: string[]) {
  try {
    const productsResult = await getProductsByIds(
      firestore,
      linkedProductsIds,
      false,
    );
    return productsResult;
  } catch (error) {
    console.error("Error fetching customer linked products:", error);
    return [];
  }
}

async function fetchPricesForCalculation(
  product: Product | NestedProduct,
  calculatedCombination: string | null | undefined,
  channelId: string | undefined,
  pageCount?: number | null,
  options?: DynamicPriceFetchOptions,
) {
  try {
    if (!product.id) return undefined;
    if (!channelId) return undefined;

    const combinationKey =
      calculatedCombination && calculatedCombination.trim() !== ""
        ? calculatedCombination
        : "default";

    const prices = await fetchPricesForProduct(
      firestore,
      product,
      combinationKey,
      channelId,
      pageCount,
      options,
    );

    return prices;
  } catch (error) {
    console.error("Error fetching prices for calculation:", error);
    return undefined;
  }
}

function getSavedOrderItemQuantity(item: OrderItem) {
  if (typeof item.volume === "number" && item.volume > 0) {
    return item.volume;
  }

  return item.quantity;
}

function OrderItemReadonlyFallback({
  item,
  title,
  description,
}: {
  item: OrderItem;
  title: string;
  description: string;
}) {
  const { t } = useT(["order", "orders", "translation"]);
  const savedName =
    item.name ||
    item.product?.name ||
    t("order.inlineEdit.savedItemName", {
      defaultValue: "Saved item",
    });
  const savedProductName = item.product?.name;
  const savedConfiguration = item.description?.trim();
  const savedQuantity = getSavedOrderItemQuantity(item);
  const savedUnit = t(`Unit.${item.unit}`, {
    defaultValue: item.unit,
  });

  return (
    <VStack align="stretch" gap={4} mt={4}>
      <Alert.Root status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description>{description}</Alert.Description>
        </Alert.Content>
      </Alert.Root>

      <Box borderWidth="1px" borderRadius="3xl" p={4}>
        <VStack align="stretch" gap={3}>
          <Text fontSize="sm" fontWeight="semibold" color="fg.muted">
            {t("order.inlineEdit.savedDetailsLabel", {
              defaultValue: "Saved order item details",
            })}
          </Text>

          <VStack align="stretch" gap={1}>
            <Text fontWeight="semibold">{savedName}</Text>
            {savedProductName && savedProductName !== savedName ? (
              <Text fontSize="sm" color="fg.muted">
                {savedProductName}
              </Text>
            ) : null}
          </VStack>

          <HStack gap={2} flexWrap="wrap">
            <Badge colorPalette="gray" variant="subtle">
              {t("order.inlineEdit.savedQuantity", {
                defaultValue: "Saved quantity: {{quantity}} {{unit}}",
                quantity: savedQuantity,
                unit: savedUnit,
              })}
            </Badge>
            {item.product?.id ? (
              <HStack gap={2}>
                <Text fontSize="sm" color="fg.muted">
                  {t("order.inlineEdit.savedProductIdLabel", {
                    defaultValue: "Saved product ID",
                  })}
                </Text>
                <Code>{item.product.id}</Code>
              </HStack>
            ) : null}
          </HStack>

          <VStack align="stretch" gap={1}>
            <Text fontSize="sm" fontWeight="medium" color="fg.muted">
              {t("order.inlineEdit.savedConfigurationLabel", {
                defaultValue: "Saved configuration",
              })}
            </Text>
            <Text whiteSpace="pre-wrap">
              {savedConfiguration ||
                t("order.inlineEdit.savedConfigurationMissing", {
                  defaultValue:
                    "No saved configuration details were stored for this item.",
                })}
            </Text>
          </VStack>
        </VStack>
      </Box>
    </VStack>
  );
}

export interface CombinationInputSaveOverridePayload {
  configuration: Configuration;
  expressPercent?: number;
  newItem?: boolean;
  prices: Price[];
  printingMethod?: PrintingMethodId;
  product: Product;
  totalPrice?: number;
}

interface CombinationInputProps {
  index: number;
  insertAction: UseFieldArrayInsert<FieldValues, string>;
  itemId?: string;
  allowSaveAsNew?: boolean;
  onSaveConfiguration?: (
    payload: CombinationInputSaveOverridePayload,
  ) => Promise<void> | void;
  saveAsNewLabel?: string;
  saveConfigurationIcon?: string;
  saveConfigurationLabel?: string;
  showConfigurationSaveToast?: boolean;
}

export function CombinationInput({
  index,
  insertAction,
  itemId,
  allowSaveAsNew = true,
  onSaveConfiguration,
  saveAsNewLabel,
  saveConfigurationIcon,
  saveConfigurationLabel,
  showConfigurationSaveToast = true,
}: CombinationInputProps) {
  "use memo";

  const { t } = useT(["order", "orders", "translation"]);
  const {
    getValues,
    setValue,
    formState: { errors },
    control,
  } = useFormContext();
  const { update } = useFieldArray({
    name: "items",
    control,
    keyName: "__fieldArrayId",
  });
  const [product, productId]: [
    Product | FormattedProduct | undefined,
    Product["id"],
  ] = useWatch({
    name: [`items[${index}].product`, `items[${index}].product.id`],
  });

  // Track drawer closing
  const [drawerWasClosed, setDrawerWasClosed] = useState<boolean>(false);
  const drawerWasClosedRef = useRef<boolean>(false);

  const isFullProduct = (
    p: Product | FormattedProduct | undefined,
  ): p is Product =>
    !!p && "prices" in p && Array.isArray((p as Product).prices);

  const isFormattedProduct = (
    p: Product | FormattedProduct | undefined,
  ): p is FormattedProduct => !!p && !isFullProduct(p);

  const [promotions, promotionsAction] = useActionState<
    Promotion[] | undefined
  >(
    () =>
      product && isFullProduct(product)
        ? fetchPromotions(firestore, product)
        : [],
    [],
  );

  useEffect(() => {
    if (product && isFullProduct(product)) {
      startTransition(() => {
        promotionsAction();
      });
    }
  }, [product]);

  // Prefer stable itemId for identity and cache keying
  const watchedItemId: string | undefined = useWatch({
    name: `items[${index}].id`,
  });
  const stableItemIdForSWR = watchedItemId || itemId || "no-item-id";

  const {
    data: fetchedProduct,
    isLoading: isLoadingProduct,
    isValidating: isValidatingProduct,
  } = useSWRImmutable(
    // Only fetch when we actually have a productId and the product isn't hydrated yet (or when reopening after drawer close)
    !productId ||
      (typeof productId === "string" && productId.startsWith("fk_")) ||
      (product && isFullProduct(product) && !drawerWasClosed)
      ? null
      : // Key by productId and stable itemId (not by index) to avoid cache bleed across inserts/reorders
        ["product-by-id", productId, stableItemIdForSWR],
    ([, pid]) => fetchProduct(pid as string, index, setValue),
  );

  useEffect(() => {
    if (
      drawerWasClosed &&
      productId &&
      product &&
      isFormattedProduct(product)
    ) {
      fetchProduct(productId, index, setValue).then(() => {
        setDrawerWasClosed(false);
      });
    }
  }, [drawerWasClosed, productId, product, index, setValue]);

  useEffect(() => {
    return () => {
      if (productId && product) {
        drawerWasClosedRef.current = true;
        queueMicrotask(() => {
          setDrawerWasClosed(true);
        });
      }
    };
  }, [productId, product]);

  const showLinkedProductsPanel =
    !productId || !product || isFormattedProduct(product);
  const watchCustomer = useWatch({
    disabled: !showLinkedProductsPanel,
    name: "customer",
  }) as Customer | string | undefined;
  const {
    data: customerLinkedProducts,
    isLoading: isLoadingCustomerLinkedProducts,
  } = useSWRImmutable(
    showLinkedProductsPanel &&
      watchCustomer &&
      isNestedCustomer(watchCustomer) &&
      watchCustomer.linkedProductsIds
      ? watchCustomer.linkedProductsIds
      : null,
    (linkedProductsIds) => fetchCustomerLinkedProducts(linkedProductsIds),
  );

  const resetSelectedProductConfiguration = () => {
    for (const { field, value } of getOrderItemConfigurationResetValues()) {
      setValue(`items[${index}].${field}`, value, {
        shouldDirty: true,
        shouldValidate: false,
        shouldTouch: false,
      });
    }
  };

  // Maintain a stable, last-known-good product to keep the Base mounted
  const latestProductRef = useRef<Product | undefined>(undefined);
  const latestProductIdRef = useRef<string | undefined>(undefined);
  const resolvedProductForBase = isFullProduct(product)
    ? product
    : fetchedProduct;

  useEffect(() => {
    if (resolvedProductForBase) {
      latestProductRef.current = resolvedProductForBase;
      latestProductIdRef.current = resolvedProductForBase.id;
    }
  }, [resolvedProductForBase]);

  const productForBase = resolveCombinationInputBaseProduct({
    currentProductId: productId,
    isFormattedProduct: Boolean(product && isFormattedProduct(product)),
    isLoadingProduct,
    isValidatingProduct,
    latestProduct: latestProductRef.current,
    latestProductId: latestProductIdRef.current,
    resolvedProduct: resolvedProductForBase,
  });
  const stableKey = createCombinationInputBaseKey({
    fieldArrayItemId: itemId,
    orderItemId: watchedItemId,
    productId: productForBase?.id ?? productId,
  });

  // Instead of returning early (which unmounts the Base), render the helper UI inline
  const showTopSkeleton =
    (isValidatingProduct || isLoadingProduct) &&
    !fetchedProduct &&
    !productForBase;
  const showUnavailableProductFallback = shouldShowUnavailableProductFallback({
    productId,
    resolvedProduct: productForBase,
    isLoadingProduct,
    isValidatingProduct,
  });
  const unavailableOrderItem = showUnavailableProductFallback
    ? (getValues(`items[${index}]`) as OrderItem | undefined)
    : undefined;

  return (
    <Fragment key={stableKey}>
      {showLinkedProductsPanel && (
        <Skeleton loading={isLoadingCustomerLinkedProducts} w={"100%"}>
          {!customerLinkedProducts || isEmpty(customerLinkedProducts) ? null : (
            <Wrap gap={2} mt={2} position={"relative"}>
              {customerLinkedProducts?.map((p) => (
                <Button
                  key={p.id}
                  onClick={() =>
                    startTransition(() => {
                      resetSelectedProductConfiguration();
                      setValue(`items[${index}].product`, p);
                      setValue(`items.${index}.id`, getRandomId());
                    })
                  }
                  size={"2xs"}
                  colorPalette={"primary"}
                >
                  {p.name}
                  <MaterialSymbol>add_shopping_cart</MaterialSymbol>
                </Button>
              ))}
              <ToggleTip
                content={t("admin.linkedProductsInfo", {
                  defaultValue:
                    "Products linked to customer account are displayed here",
                })}
              >
                <Button
                  size="2xs"
                  variant="ghost"
                  p={"0"}
                  position={"absolute"}
                  top={-4}
                  right={-4}
                >
                  <MaterialSymbol>info</MaterialSymbol>
                </Button>
              </ToggleTip>
            </Wrap>
          )}
        </Skeleton>
      )}

      {showTopSkeleton && <Skeleton w={"100%"} height={"200px"} />}

      {showUnavailableProductFallback && unavailableOrderItem ? (
        <OrderItemReadonlyFallback
          item={unavailableOrderItem}
          title={t("order.inlineEdit.unavailableTitle", {
            defaultValue: "Product is no longer available",
          })}
          description={t("order.inlineEdit.unavailableDescription", {
            defaultValue:
              "This order item references a product that could not be loaded. The saved item details are shown below as read-only text.",
          })}
        />
      ) : null}

      {productForBase && !showUnavailableProductFallback && (
        <CombinationInputBase
          // Remount only when the actual product changes
          key={stableKey}
          index={index}
          insertAction={insertAction}
          allowSaveAsNew={allowSaveAsNew}
          onSaveConfiguration={onSaveConfiguration}
          saveAsNewLabel={saveAsNewLabel}
          saveConfigurationIcon={saveConfigurationIcon}
          saveConfigurationLabel={saveConfigurationLabel}
          showConfigurationSaveToast={showConfigurationSaveToast}
          product={productForBase}
          fetchedProduct={fetchedProduct}
          isLoadingProduct={isLoadingProduct}
          isValidatingProduct={isValidatingProduct}
          getValues={getValues}
          setValue={setValue}
          update={update}
          errors={errors}
          promotions={promotions}
        />
      )}
    </Fragment>
  );
}

const formatOverrideValue = (value?: number) =>
  typeof value === "number" ? value : "-";

const parseCustomPriceInput = (input: string): number => {
  const cleanInput = input.replace(/\s/g, "");
  const normalizedInput = cleanInput.replace(",", ".");
  const parsedValue = parseFloat(normalizedInput);
  if (isNaN(parsedValue)) return 0;
  return Math.round(parsedValue * 100);
};

const formatCustomPriceForDisplay = (groszValue: number): string => {
  const zlotyValue = groszValue / 100;
  return zlotyValue.toFixed(2).replace(".", ",");
};

// Optional: reduce needless re-renders of heavy Base component
const CombinationInputBase = memo(function CombinationInputBase({
  index,
  insertAction,
  allowSaveAsNew,
  onSaveConfiguration,
  saveAsNewLabel,
  saveConfigurationIcon,
  saveConfigurationLabel,
  showConfigurationSaveToast,
  product,
  fetchedProduct,
  isLoadingProduct,
  isValidatingProduct,
  getValues,
  setValue,
  update,
  errors,
  promotions,
}: {
  index: number;
  insertAction: UseFieldArrayInsert<FieldValues, string>;
  allowSaveAsNew: boolean;
  onSaveConfiguration?: (
    payload: CombinationInputSaveOverridePayload,
  ) => Promise<void> | void;
  saveAsNewLabel?: string;
  saveConfigurationIcon?: string;
  saveConfigurationLabel?: string;
  showConfigurationSaveToast: boolean;
  product: Product;
  fetchedProduct: Product | undefined;
  isLoadingProduct: boolean;
  isValidatingProduct: boolean;
  getValues: UseFormGetValues<FieldValues>;
  setValue: UseFormSetValue<FieldValues>;
  update: UseFieldArrayUpdate<FieldValues>;
  errors: FieldErrors<FieldValues>;
  promotions?: Promotion[];
}) {
  "use memo";

  const { t, i18n } = useT(["order", "orders", "translation"]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  // Track live configuration changes from Combination component
  const [liveConfiguration, setLiveConfiguration] = useState<
    Configuration | undefined
  >(undefined);

  const overrideWarningShownRef = useRef<
    Partial<Record<keyof SpecOverrides, boolean>>
  >({});
  const overrideContextKeyRef = useRef<string | null>(null);
  const overrideDialogResolveRef = useRef<(() => void) | null>(null);
  // Flag to suppress save dialog briefly after override confirmation
  const overrideInProgressRef = useRef(false);
  const [overrideDialog, setOverrideDialog] = useState<OverrideDialogState>({
    open: false,
  });
  const overrideFieldLabels = useMemo<Record<keyof SpecOverrides, string>>(
    () => ({
      minimumOrder: t("admin.specOverrides.minimumOrder", {
        defaultValue: "Minimum Order",
      }),
      maximumOrder: t("admin.specOverrides.maximumOrder", {
        defaultValue: "Maximum Order",
      }),
      step: t("admin.specOverrides.step", { defaultValue: "Order Step" }),
      minimumWidth: t("admin.specOverrides.minimumWidth", {
        defaultValue: "Minimum Width",
      }),
      maximumWidth: t("admin.specOverrides.maximumWidth", {
        defaultValue: "Maximum Width",
      }),
      widthStep: t("admin.specOverrides.widthStep", {
        defaultValue: "Width Step",
      }),
      minimumHeight: t("admin.specOverrides.minimumHeight", {
        defaultValue: "Minimum Height",
      }),
      maximumHeight: t("admin.specOverrides.maximumHeight", {
        defaultValue: "Maximum Height",
      }),
      heightStep: t("admin.specOverrides.heightStep", {
        defaultValue: "Height Step",
      }),
      minimumRatio: t("admin.specOverrides.minimumRatio", {
        defaultValue: "Minimum Ratio",
      }),
      maximumRatio: t("admin.specOverrides.maximumRatio", {
        defaultValue: "Maximum Ratio",
      }),
    }),
    [t],
  );

  const requestOverrideWarning = useCallback(
    (payload: OverrideWarningPayload) => {
      if (overrideWarningShownRef.current[payload.key]) {
        return Promise.resolve();
      }
      if (overrideDialog.open) {
        return Promise.resolve();
      }

      overrideInProgressRef.current = true;
      return new Promise<void>((resolve) => {
        overrideDialogResolveRef.current = () => {
          overrideWarningShownRef.current[payload.key] = true;
          resolve();
        };
        setOverrideDialog({ open: true, ...payload });
      });
    },
    [overrideDialog.open],
  );

  const handleOverrideDialogConfirm = useCallback(() => {
    if (overrideDialogResolveRef.current) {
      overrideDialogResolveRef.current();
      overrideDialogResolveRef.current = null;
    }
    setOverrideDialog({ open: false });
    // Keep the flag active briefly to let configuration updates settle
    // Then clear it after a short delay
    setTimeout(() => {
      overrideInProgressRef.current = false;
    }, 500);
  }, []);

  const cloneConfiguration = useCallback(
    (cfg: Configuration | undefined): Configuration | undefined => {
      if (!cfg) return cfg;
      return {
        ...cfg,
        // Ensure nested containers get new references too (some callers might mutate in place)
        selectedAttributeOptions: cfg.selectedAttributeOptions
          ? { ...cfg.selectedAttributeOptions }
          : cfg.selectedAttributeOptions,
        customSizes: cfg.customSizes ? [...cfg.customSizes] : cfg.customSizes,
      } as Configuration;
    },
    [],
  );

  const [
    orderItemId,
    volume,
    combination,
    customPrice,
    customFormat,
    calculatedCombination,
    description,
    width,
    height,
    quantity,
    discount,
    unit,
    generated,
    customSizes,
    expressPercent,
    pageCount,
    orderItemTotalPrice,
    advancedAttributeSelections,
    orderItemName,
  ]: [
    OrderItem["id"],
    OrderItem["volume"],
    OrderItem["combination"],
    OrderItem["customPrice"],
    OrderItem["customFormat"],
    OrderItem["calculatedCombination"],
    OrderItem["description"],
    OrderItem["width"],
    OrderItem["height"],
    OrderItem["quantity"],
    OrderItem["discount"],
    OrderItem["unit"],
    boolean,
    OrderItem["customSizes"],
    OrderItem["expressPercent"],
    OrderItem["pageCount"],
    OrderItem["totalPrice"],
    OrderItem["advancedAttributeSelections"],
    OrderItem["name"],
  ] = useWatch({
    name: [
      `items[${index}].id`,
      `items[${index}].volume`,
      `items[${index}].combination`,
      `items[${index}].customPrice`,
      `items[${index}].customFormat`,
      `items[${index}].calculatedCombination`,
      `items[${index}].description`,
      `items[${index}].width`,
      `items[${index}].height`,
      `items[${index}].quantity`,
      `items[${index}].discount`,
      `items[${index}].unit`,
      `items[${index}].generated`,
      `items[${index}].customSizes`,
      `items[${index}].expressPercent`,
      `items[${index}].pageCount`,
      `items[${index}].totalPrice`,
      `items[${index}].advancedAttributeSelections`,
      `items[${index}].name`,
    ],
  });
  const orderItem = getValues(`items[${index}]`) as OrderItem;
  const [productId, productPriceType, productAllowCustomPrice]: [
    Product["id"],
    Product["priceType"],
    Product["allowCustomPrice"],
  ] = useWatch({
    name: [
      `items[${index}].product.id`,
      `items[${index}].product.priceType`,
      `items[${index}].product.allowCustomPrice`,
    ],
  });
  const productUsesAttributeCombination =
    isMatrixLikePriceType(productPriceType);
  const [prevProductId, setPrevProductId] = useState<string | undefined>(
    productId,
  );
  const [hasInitializedProduct, setHasInitializedProduct] = useState<boolean>(
    computeInitialHasInitializedProduct(productId),
  );
  const filteredAttributesRef = useRef<Attribute[]>([]);
  const { channel } = useChannels();
  const { attributes, storeSettings } = useConfiguration();

  useEffect(() => {
    if (!productId) {
      setHasInitializedProduct(false);
      setPrevProductId(undefined);
      return;
    }

    if (!hasInitializedProduct) {
      setHasInitializedProduct(true);
      setPrevProductId(productId);
    }
  }, [productId, hasInitializedProduct]);

  // Determine current product (either original product or fetched one)
  const currentProduct = useMemo(() => {
    return fetchedProduct ?? product;
  }, [product, fetchedProduct]);
  const resolvedPricingChannelId = currentProduct?.channelId ?? channel?.id;

  // Conditionally fetch prices - allow disabling for external products
  const shouldFetchPrices = useMemo(
    () =>
      Boolean(
        resolvedPricingChannelId &&
        currentProduct &&
        !(currentProduct as Product).disablePriceFetch,
      ),
    [resolvedPricingChannelId, currentProduct],
  );
  const dynamicPriceFetchOptions = useMemo<
    DynamicPriceFetchOptions | undefined
  >(() => {
    if (currentProduct?.priceType !== PriceTypeEnum.DYNAMIC) {
      return undefined;
    }

    return {
      combination: combination ?? null,
      customFormat,
      height,
      quantity,
      volume,
      width,
    };
  }, [
    combination,
    currentProduct?.priceType,
    customFormat,
    height,
    quantity,
    volume,
    width,
  ]);
  const dynamicPriceFetchKey = useMemo(() => {
    if (currentProduct?.priceType !== PriceTypeEnum.DYNAMIC) {
      return "static-pricing";
    }

    return JSON.stringify({
      combination: dynamicPriceFetchOptions?.combination ?? null,
      customFormat: dynamicPriceFetchOptions?.customFormat ?? false,
      dynamicPricing: currentProduct.dynamicPricing ?? null,
      height: dynamicPriceFetchOptions?.height ?? null,
      pageCount: pageCount ?? null,
      quantity: dynamicPriceFetchOptions?.quantity ?? null,
      volume: dynamicPriceFetchOptions?.volume ?? null,
      width: dynamicPriceFetchOptions?.width ?? null,
    });
  }, [currentProduct, dynamicPriceFetchOptions, pageCount]);
  const {
    data: fetchedPrices,
    isLoading: isLoadingPrices,
    error: pricesError,
  } = useSWR(
    shouldFetchPrices
      ? [
          currentProduct,
          calculatedCombination && calculatedCombination.trim() !== ""
            ? calculatedCombination
            : "default",
          resolvedPricingChannelId,
          pageCount ?? null,
          "prices",
          dynamicPriceFetchKey,
        ]
      : null,
    ([priceProduct, priceCombination, priceChannelId, pricePageCount]) =>
      fetchPricesForCalculation(
        priceProduct,
        priceCombination,
        priceChannelId,
        typeof pricePageCount === "number" ? pricePageCount : null,
        dynamicPriceFetchOptions,
      ),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // Only use fetched prices - never use embedded prices
  const pricesForCalculation = useMemo(() => {
    return shouldFetchPrices ? fetchedPrices || [] : [];
  }, [shouldFetchPrices, fetchedPrices]);

  // Fallback prices for SINGLE price type with customPrice/defaultPrice when fetching is disabled
  const effectivePricesForCalc = useMemo(() => {
    if (!isEmpty(pricesForCalculation)) return pricesForCalculation;
    // If fetching is disabled or returned nothing, but we have a customPrice for SINGLE, synthesize a price point
    if ((currentProduct as Product)?.priceType === PriceTypeEnum.SINGLE) {
      if (typeof customPrice === "number" && customPrice > 0) {
        return [{ value: customPrice, currency: CurrencyEnum.PLN } as Price];
      }
      const dp = (currentProduct as Product)?.defaultPrice as
        | { currency?: CurrencyEnum; minorUnits?: number }
        | undefined;
      const minor = dp?.minorUnits;
      if (typeof minor === "number" && minor > 0) {
        return [
          { value: minor, currency: dp?.currency ?? CurrencyEnum.PLN } as Price,
        ];
      }
    }
    return pricesForCalculation;
  }, [pricesForCalculation, currentProduct, customPrice]);

  // Check if we need to wait for prices - but only for existing combinations, not during initialization
  const waitingForPrices = useMemo(() => {
    // Don't wait for prices during initialization (when calculatedCombination is null)
    if (!calculatedCombination) return false;
    // Don't wait if we don't have the required context
    if (!resolvedPricingChannelId || !currentProduct) return false;
    // Don't wait if price fetch is disabled
    if ((currentProduct as Product).disablePriceFetch) return false;
    // Only wait if we're actively loading and don't have prices or error yet
    return isLoadingPrices && !fetchedPrices && !pricesError;
  }, [
    calculatedCombination,
    resolvedPricingChannelId,
    currentProduct,
    isLoadingPrices,
    fetchedPrices,
    pricesError,
  ]);

  const [openCombinationDialog, setOpenCombinationDialog] =
    useState<boolean>(false);
  const [openSaveDialog, setOpenSaveDialog] = useState<boolean>(false);
  const saveDialogFocusRef = useRef<HTMLButtonElement>(null);
  const [changedConfiguration, setChangedConfiguration] = useState<
    Configuration | undefined
  >(undefined);
  const [init, setInit] = useState<boolean>(true);
  const [selectedAttributeOptions, setSelectedAttributeOptions] = useState<
    { [key: string]: string | number } | undefined | null
  >(undefined);
  const [onOpenConfiguration, setOnOpenConfiguration] = useState<
    Configuration | undefined
  >(undefined);

  useEffect(() => {
    setLiveConfiguration(undefined);
    setChangedConfiguration(undefined);
    setOnOpenConfiguration(undefined);
    setSelectedAttributeOptions(undefined);
    setOpenCombinationDialog(false);
    setOpenSaveDialog(false);
    setInit(true);
    filteredAttributesRef.current = [];
  }, [productId]);

  const overrideContextKey = useMemo(() => {
    const baseConfig = onOpenConfiguration ?? {
      productId,
      combination,
      calculatedCombination,
      volume,
      quantity,
      customFormat,
      width,
      height,
      customSizes,
    };

    return JSON.stringify({
      productId: baseConfig.productId ?? productId,
      combination: baseConfig.combination ?? combination,
      calculatedCombination:
        baseConfig.calculatedCombination ?? calculatedCombination,
      volume: baseConfig.volume ?? volume,
      quantity: baseConfig.quantity ?? quantity,
      customFormat: baseConfig.customFormat ?? customFormat,
      width: baseConfig.width ?? width,
      height: baseConfig.height ?? height,
      customSizes: baseConfig.customSizes ?? customSizes,
      orderItemId,
    });
  }, [
    onOpenConfiguration,
    productId,
    combination,
    calculatedCombination,
    volume,
    quantity,
    customFormat,
    width,
    height,
    customSizes,
    orderItemId,
  ]);

  useEffect(() => {
    if (overrideContextKeyRef.current !== overrideContextKey) {
      overrideContextKeyRef.current = overrideContextKey;
      overrideWarningShownRef.current = {};
    }
  }, [overrideContextKey]);

  // Adapter: keep both live and "changed" in sync for admin-only usage
  const handleSetConfiguration: Dispatch<
    SetStateAction<Configuration | undefined>
  > = useCallback(
    (next) => {
      if (typeof next === "function") {
        const updater = next as (
          p: Configuration | undefined,
        ) => Configuration | undefined;
        setLiveConfiguration((prev) => cloneConfiguration(updater(prev)));
        setChangedConfiguration((prev) => cloneConfiguration(updater(prev)));
      } else {
        const cloned = cloneConfiguration(next);
        setLiveConfiguration(cloned);
        setChangedConfiguration(cloned);
      }
    },
    [cloneConfiguration],
  );

  const isContextReady = useMemo(
    () =>
      !isNull(channel) &&
      !isUndefined(channel) &&
      !isUndefined(product) &&
      !isNull(product) &&
      !!productId &&
      !!orderItemId &&
      !!currentProduct,
    [channel, product, productId, orderItemId, currentProduct],
  );

  const isPricePending = useMemo(
    () => Boolean(calculatedCombination && waitingForPrices),
    [calculatedCombination, waitingForPrices],
  );

  const loading = useMemo(
    () => !isContextReady || isPricePending,
    [isContextReady, isPricePending],
  );

  const watchCustomer: Customer | string = useWatch({ name: "customer" });
  const watchOrderPrintingMethods = useWatch({ name: "printingMethods" });
  const customer = useMemo(() => {
    if (typeof watchCustomer === "string") return null;
    return watchCustomer;
  }, [watchCustomer]);

  // Helper: resolve customer discount that applies to this product
  const getCustomerDiscountForProduct = (
    cust: Customer | null,
    prodId?: string,
    prod?: Product,
  ) => {
    if (!cust || !prodId) return 0;

    // For external/price-list based products (e.g. Fakturownia), never apply customer discount
    if (
      (prod as Product | undefined)?.provider?.type === "FAKTUROWNIA" ||
      prodId.startsWith("fk_")
    ) {
      return 0;
    }

    // Products explicitly linked to customer do not receive the global customer discount
    if (cust.linkedProductsIds?.includes(prodId)) return 0;

    return cust.discount || 0;
  };

  // Treat only actually configured values as persisted. A brand-new field-array
  // row may already have a generated item id, but it should still inherit the
  // customer discount until some real configuration is present.
  const hasPersistedConfiguration = useMemo(() => {
    return (
      Boolean(description) ||
      Boolean(combination) ||
      Boolean(calculatedCombination) ||
      (orderItemTotalPrice ?? 0) > 0 ||
      (volume ?? 0) > 0 ||
      (width ?? 0) > 0 ||
      (height ?? 0) > 0 ||
      (customPrice ?? 0) > 0 ||
      (expressPercent ?? 0) > 0 ||
      quantity > 1 ||
      (customSizes?.length ?? 0) > 0
    );
  }, [
    calculatedCombination,
    combination,
    customPrice,
    customSizes,
    description,
    expressPercent,
    orderItemTotalPrice,
    quantity,
    volume,
    width,
    height,
  ]);

  // Initialize custom discount toggle based on existing item discount vs customer discount
  const initialEnableCustomDiscount = useMemo(() => {
    const custDisc = getCustomerDiscountForProduct(
      customer,
      product?.id,
      product,
    );
    return computeInitialEnableCustomDiscount({
      discount,
      customerDiscount: custDisc,
      hasPersistedConfiguration,
    });
  }, [discount, customer, hasPersistedConfiguration, product]);

  const [enableCustomDiscountState, setEnableCustomDiscountState] =
    useState<boolean>(initialEnableCustomDiscount);
  const hasTouchedCustomDiscountRef = useRef(false);
  const enableCustomDiscount = hasTouchedCustomDiscountRef.current
    ? enableCustomDiscountState
    : initialEnableCustomDiscount;
  const setEnableCustomDiscount = useCallback<
    Dispatch<SetStateAction<boolean>>
  >(
    (value) => {
      hasTouchedCustomDiscountRef.current = true;
      setEnableCustomDiscountState((_previousValue) =>
        typeof value === "function" ? value(enableCustomDiscount) : value,
      );
    },
    [enableCustomDiscount],
  );
  const [customerChanged, setCustomerChanged] = useState<boolean>(false);

  // Calculate effective express percentage: use item's custom value, never default from settings
  const effectiveExpressPercent = useMemo(() => {
    // Only use express percent if explicitly set on the item and greater than 0
    if (expressPercent !== undefined && expressPercent > 0) {
      return expressPercent;
    }
    // Don't use store settings default - express must be explicitly set
    return undefined;
  }, [expressPercent]);

  const totalPriceWithoutDiscount = useMemo(() => {
    if (!product) return 0;
    if (isNull(calculatedCombination) || isUndefined(calculatedCombination))
      return 0;
    if (waitingForPrices || isEmpty(effectivePricesForCalc)) return 0;
    try {
      return (
        calcPrice(
          quantity,
          effectivePricesForCalc,
          product.priceType,
          0,
          calculatedCombination,
          volume,
          customFormat,
          width,
          height,
          product.spec.minimumOrder,
          customPrice,
          product.designSpec?.includeBleed
            ? product.designSpec.bleed
            : undefined,
          undefined,
          customSizes,
          undefined,
          effectiveExpressPercent,
        ).result || 0
      );
    } catch (error) {
      console.error(error);
      return 0;
    }
  }, [
    calculatedCombination,
    customFormat,
    customPrice,
    height,
    product,
    quantity,
    volume,
    width,
    customSizes,
    effectivePricesForCalc,
    waitingForPrices,
    effectiveExpressPercent,
  ]);

  const matrixFallbackVolume = useMemo(() => {
    if (!currentProduct) return 1;

    return (
      currentProduct.spec.defaultOrder ??
      currentProduct.volumes?.[0]?.value ??
      currentProduct.spec.minimumOrder ??
      1
    );
  }, [currentProduct]);

  // Track previous effective customer discount for this product to detect changes accurately
  const prevCustomerDiscountRef = useRef<number | undefined>(undefined);

  const {
    effectiveDiscountValue,
    discountAmount,
    isDiscountChangedFromCustomer,
  } = useDiscountCalculation({
    customer,
    product,
    totalPriceWithoutDiscount,
    enableCustomDiscount,
    customDiscountValue: discount?.discountValue || 0,
    prevCustomerDiscount: prevCustomerDiscountRef.current,
  });

  const totalPrice = useMemo(() => {
    if (!product) return 0;
    if (isNull(calculatedCombination) || isUndefined(calculatedCombination))
      return 0;
    if (waitingForPrices || !effectivePricesForCalc.length) return 0;
    try {
      return (
        calcPrice(
          quantity,
          effectivePricesForCalc,
          product.priceType,
          effectiveDiscountValue,
          calculatedCombination,
          volume,
          customFormat,
          width,
          height,
          product.spec.minimumOrder,
          customPrice,
          product.designSpec?.includeBleed
            ? product.designSpec.bleed
            : undefined,
          undefined,
          customSizes,
          undefined,
          effectiveExpressPercent,
        ).result || 0
      );
    } catch (error) {
      console.error(error);
      return 0;
    }
  }, [
    calculatedCombination,
    customFormat,
    customPrice,
    effectiveDiscountValue,
    height,
    product,
    quantity,
    volume,
    width,
    customSizes,
    effectivePricesForCalc,
    waitingForPrices,
    effectiveExpressPercent,
  ]);

  // The cost panel must pro-rate material cost by the number of pieces actually
  // produced. For print products that count is the print run (`volume`), not the
  // order-line `quantity` — mirrors getSavedOrderItemQuantity (volume wins when
  // set, else fall back to quantity). Without this, e.g. 5000 stickers cost as 1.
  const costPanelQuantity = useMemo(() => {
    const liveVolume = liveConfiguration?.volume ?? volume;
    if (typeof liveVolume === "number" && liveVolume > 0) {
      return liveVolume;
    }
    return typeof quantity === "number" && quantity > 0 ? quantity : 1;
  }, [liveConfiguration?.volume, volume, quantity]);

  useEffect(() => {
    if (isDiscountChangedFromCustomer) {
      startTransition(() => {
        setValue(
          `items[${index}].discount`,
          new Discount(
            undefined,
            DiscountTypeEnum.PERCENTAGE,
            effectiveDiscountValue,
            discountAmount,
            null,
          ).object,
        );
        setValue(`items[${index}].totalPrice`, totalPrice);
      });
    }
  }, [
    isDiscountChangedFromCustomer,
    effectiveDiscountValue,
    discountAmount,
    totalPrice,
    index,
    setValue,
  ]);

  // After reacting to changes, update previous customer discount snapshot for this product
  useEffect(() => {
    const currentForProduct = getCustomerDiscountForProduct(
      customer,
      product?.id,
      product,
    );
    prevCustomerDiscountRef.current = currentForProduct;
  }, [customer, product]);

  // Clear configuration on product change
  useEffect(() => {
    if (
      !shouldClearConfiguration({
        productId,
        generated,
        hasInitializedProduct,
        prevProductId,
      })
    )
      return;

    // Clear configuration when product actually changes
    {
      // Detect external (Fakturownia) mapped products so we can preserve their seeded custom price.
      const isExternal =
        typeof productId === "string" && productId.startsWith("fk_");

      // Clear filtered attributes when product changes
      filteredAttributesRef.current = [];

      startTransition(() => {
        setValue(`items[${index}].customFormat`, false);
        // For external products keep the custom price that was pre-seeded during selection.
        if (!isExternal) {
          setValue(`items[${index}].customPrice`, 0);
        } else {
          // Safety: if external product somehow has no customPrice yet but defaultPrice.minorUnits exists, seed it.
          const currentCustomPrice = getValues(`items[${index}].customPrice`);
          const defaultMinor = getValues(
            `items[${index}].product.defaultPrice.minorUnits`,
          );
          if (
            (!currentCustomPrice || currentCustomPrice <= 0) &&
            typeof defaultMinor === "number" &&
            defaultMinor > 0
          ) {
            setValue(`items[${index}].customPrice`, defaultMinor);
          }
        }
        setValue(`items[${index}].combination`, null);
        setValue(`items[${index}].calculatedCombination`, null);
        setValue(`items[${index}].description`, "");
        setValue(`items[${index}].volume`, undefined);
        setValue(`items[${index}].pageCount`, undefined);
        setValue(`items[${index}].width`, 0);
        setValue(`items[${index}].height`, 0);
        setValue(`items[${index}].quantity`, 1);
        setValue(`items[${index}].totalPrice`, 0);
        setSelectedAttributeOptions(null);
      });
    }
  }, [
    generated,
    hasInitializedProduct,
    index,
    getValues,
    prevProductId,
    productId,
    setValue,
  ]);

  // Initialize configuration
  useEffect(() => {
    if (!isContextReady) return;
    if (isUndefined(productId)) return;
    if (!currentProduct) return;
    if (!hasInitializedProduct) {
      setPrevProductId(productId);
      setHasInitializedProduct(true);
      return;
    }

    let initialTotalPrice: number = 0;
    let effectiveDiscount = 0;

    // Calculate initial discount based on resolved customer discount rules
    // - Never apply customer discount to external/price-list products (e.g. Fakturownia)
    // - Respect linkedProductsIds exclusions
    // - Only seed when item has no discount yet and custom discount is not enabled
    const initialCustomerDiscount = getCustomerDiscountForProduct(
      customer,
      currentProduct.id,
      currentProduct,
    );
    if (
      shouldSeedCustomerDiscount({
        discount,
        enableCustomDiscount,
        customerDiscount: initialCustomerDiscount,
        hasPersistedConfiguration,
      })
    ) {
      effectiveDiscount = initialCustomerDiscount;
    }

    // Clear filtered attributes if product type is not attribute-combination based.
    if (!productUsesAttributeCombination) {
      filteredAttributesRef.current = [];
    }

    const productChanged = computeProductChanged({
      prevProductId,
      productId,
      hasInitializedProduct,
      generated,
    });
    const nextPageCount = currentProduct.pageCount?.enabled
      ? typeof pageCount === "number" &&
        Number.isFinite(pageCount) &&
        pageCount > 0
        ? pageCount
        : currentProduct.pageCount.minimum
      : undefined;

    if (productUsesAttributeCombination) {
      const filteredAttributes = filterAttributes(attributes, currentProduct);
      if (!filteredAttributes) return;
      filteredAttributesRef.current = filteredAttributes;
      try {
        const [
          _combination,
          _calculatedCombination,
          _descriptionCombination,
          _attributeOptions,
        ] = getCombination(
          filteredAttributes,
          combination ? (!productChanged ? combination.split("-") : []) : [],
          searchParams,
          currentProduct.attributeDependencies,
          true,
        );
        const resolvedCalculatedCombination = resolveCalculatedCombination({
          combination: _combination,
          calculatedCombination: _calculatedCombination,
          priceType: currentProduct.priceType,
        });
        const nextCalculatedCombination = calculatedCombination
          ? !productChanged
            ? calculatedCombination
            : resolvedCalculatedCombination
          : resolvedCalculatedCombination;
        const nextMatrixVolume = resolveMatrixVolume({
          volume,
          productChanged,
          getFirstUsableMatrixVolume: () =>
            getFirstUsableMatrixVolume({
              calculatedCombination:
                nextCalculatedCombination &&
                nextCalculatedCombination.trim() !== ""
                  ? nextCalculatedCombination
                  : DEFAULT_COMBINATION,
              fallbackVolume:
                volume && !productChanged ? volume : matrixFallbackVolume,
              prices: effectivePricesForCalc,
              volumes: currentProduct.volumes,
            }),
        });

        _attributeOptions["volume"] = nextMatrixVolume;
        startTransition(() => {
          setSelectedAttributeOptions(_attributeOptions);
          setValue(
            `items[${index}].combination`,
            combination
              ? !productChanged
                ? combination
                : _combination
              : _combination,
          );
          setValue(
            `items[${index}].calculatedCombination`,
            nextCalculatedCombination,
          );
          setValue(
            `items[${index}].description`,
            description
              ? !productChanged
                ? description
                : _descriptionCombination
              : _descriptionCombination,
          );
          setValue(`items[${index}].volume`, nextMatrixVolume);
          setValue(`items[${index}].pageCount`, nextPageCount);
        });
        // Only calculate price if we have prices available or don't need to wait
        if (effectivePricesForCalc.length > 0 || !waitingForPrices) {
          initialTotalPrice =
            calcPrice(
              quantity,
              effectivePricesForCalc,
              currentProduct.priceType,
              effectiveDiscount || discount?.discountValue || 0,
              nextCalculatedCombination,
              nextMatrixVolume,
              customFormat,
              width,
              height,
              currentProduct.spec.minimumOrder,
              productChanged ? null : customPrice,
              currentProduct.designSpec?.includeBleed
                ? currentProduct.designSpec.bleed
                : undefined,
              undefined,
              customSizes,
              i18n.resolvedLanguage,
              productChanged ? undefined : effectiveExpressPercent,
            ).result || 0;
        }
      } catch (error) {
        console.error("Error getting combination:", error);
      }
    } else if (
      productPriceType === PriceTypeEnum.SINGLE ||
      productPriceType === PriceTypeEnum.THRESHOLD
    ) {
      const nextNonMatrixVolume = resolveNonMatrixVolume({
        volume,
        quantity,
        minimumOrder: currentProduct.spec.minimumOrder,
        productChanged,
      });
      startTransition(() => {
        setValue(`items[${index}].combination`, "");
        setValue(`items[${index}].calculatedCombination`, "");
        setValue(`items[${index}].description`, "");
        setValue(`items[${index}].volume`, nextNonMatrixVolume);
        setValue(`items[${index}].pageCount`, nextPageCount);
      });

      // Only calculate price if we have prices available or don't need to wait
      if (effectivePricesForCalc.length > 0 || !waitingForPrices) {
        initialTotalPrice =
          calcPrice(
            quantity,
            effectivePricesForCalc,
            currentProduct.priceType,
            effectiveDiscount || discount?.discountValue || 0,
            "",
            nextNonMatrixVolume,
            customFormat,
            width,
            height,
            currentProduct.spec.minimumOrder,
            productChanged ? null : customPrice,
            currentProduct.designSpec?.includeBleed
              ? currentProduct.designSpec.bleed
              : undefined,
            undefined,
            customSizes,
            i18n.resolvedLanguage,
            productChanged ? undefined : effectiveExpressPercent,
          ).result || 0;
      }
    }

    startTransition(() => {
      // Set initial discount only if item has no discount yet and custom discount is not enabled
      if (
        shouldSeedCustomerDiscount({
          discount,
          enableCustomDiscount,
          customerDiscount: effectiveDiscount,
          hasPersistedConfiguration,
        })
      ) {
        setValue(
          `items[${index}].discount`,
          new Discount(
            undefined,
            DiscountTypeEnum.PERCENTAGE,
            effectiveDiscount,
            Math.max(
              0,
              Math.floor(totalPriceWithoutDiscount * (effectiveDiscount / 100)),
            ),
            null,
          ).object,
        );
      }

      // If customer changed, update discount only when custom discount is not enabled
      if (customerChanged && customer && !enableCustomDiscount) {
        const nextCustomerDiscount = getCustomerDiscountForProduct(
          customer,
          currentProduct.id,
          currentProduct,
        );
        if (
          nextCustomerDiscount &&
          nextCustomerDiscount !== (discount?.discountValue ?? 0)
        ) {
          setValue(
            `items[${index}].discount`,
            new Discount(
              undefined,
              DiscountTypeEnum.PERCENTAGE,
              nextCustomerDiscount,
              Math.max(
                0,
                Math.floor(
                  totalPriceWithoutDiscount * (nextCustomerDiscount / 100),
                ),
              ),
              null,
            ).object,
          );
        }
      }
      setCustomerChanged(false);
      setValue(`items[${index}].totalPrice`, initialTotalPrice);
      setPrevProductId(productId);
      setInit(false);

      // Set the full product data if it was initially a FormattedProduct
      if (fetchedProduct && currentProduct === fetchedProduct) {
        setValue(`items[${index}].product`, fetchedProduct);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    index,
    productId,
    orderItemId,
    customerChanged,
    fetchedProduct,
    productPriceType,
    productUsesAttributeCombination,
    effectivePricesForCalc,
    waitingForPrices,
    isContextReady,
    matrixFallbackVolume,
    pageCount,
    hasPersistedConfiguration,
    prevProductId,
    hasInitializedProduct,
  ]);

  function handleOnOpenChange(details: DialogOpenChangeDetails) {
    // Don't process close events while override dialog is open or was just confirmed
    if ((overrideDialog.open || overrideInProgressRef.current) && !details.open)
      return;
    if (!details.open) {
      if (!isEqual(changedConfiguration, onOpenConfiguration)) {
        // Ensure the combination dialog closes so the confirm dialog/backdrop isn't hidden under it or a parent drawer
        setOpenCombinationDialog(false);
        setOpenSaveDialog(true);
        return;
      }
      setOpenCombinationDialog(false);
    } else {
      setOpenCombinationDialog(true);
      setOnOpenConfiguration({
        productId,
        combination,
        calculatedCombination,
        descriptionCombination: description,
        selectedAttributeOptions,
        advancedAttributeSelections,
        quantity,
        volume,
        customFormat,
        width,
        height,
        customSizes: customSizes || [],
      } as Configuration);
    }
  }

  function handleWithoutSave() {
    setOpenSaveDialog(false);
    setOpenCombinationDialog(false);
  }

  function handleWithSave() {
    setOpenSaveDialog(false);
    setOpenCombinationDialog(true);
  }

  function saveConfiguration(
    configuration: Configuration,
    _totalPrice?: number,
    printingMethod?: PrintingMethodId,
    newItem?: boolean,
    _prices?: Price[],
    _savedExpressPercent?: number,
  ) {
    if (!product) return;

    // Set the configuration BEFORE the transition to prevent dialog closure
    setOnOpenConfiguration(configuration);
    setChangedConfiguration(configuration);

    const targetIndex = newItem ? index + 1 : index;

    // Calculate the effective discount for the saved configuration
    const customerDiscount = getCustomerDiscountForProduct(
      customer,
      product.id,
      product,
    );
    let savedEffectiveDiscountValue = discount?.discountValue ?? 0;
    if (!enableCustomDiscount) {
      savedEffectiveDiscountValue = customerDiscount;
    }
    const pricesForSavedConfiguration = _prices ?? effectivePricesForCalc;

    // Calculate new total price WITH discount
    const { result: newTotalPrice = 0 } = calcPrice(
      configuration.quantity,
      pricesForSavedConfiguration,
      product.priceType,
      savedEffectiveDiscountValue,
      configuration.calculatedCombination || "",
      configuration.volume,
      configuration.customFormat,
      configuration.width,
      configuration.height,
      product.spec.minimumOrder,
      customPrice,
      product.designSpec?.includeBleed ? product.designSpec.bleed : undefined,
      undefined,
      configuration.customSizes,
      i18n.resolvedLanguage,
      _savedExpressPercent,
    );
    // Calculate BASE (undiscounted) price for accurate discount amount
    const { result: basePrice = 0 } = calcPrice(
      configuration.quantity,
      pricesForSavedConfiguration,
      product.priceType,
      undefined,
      configuration.calculatedCombination || "",
      configuration.volume,
      configuration.customFormat,
      configuration.width,
      configuration.height,
      product.spec.minimumOrder,
      customPrice,
      product.designSpec?.includeBleed ? product.designSpec.bleed : undefined,
      undefined,
      configuration.customSizes,
      i18n.resolvedLanguage,
      _savedExpressPercent,
    );

    const savedDiscountAmount = Math.max(
      0,
      Math.floor(basePrice * (savedEffectiveDiscountValue / 100)),
    );

    if (onSaveConfiguration) {
      onSaveConfiguration({
        configuration,
        expressPercent: _savedExpressPercent,
        newItem,
        prices: pricesForSavedConfiguration,
        printingMethod,
        product: {
          ...product,
          prices: pricesForSavedConfiguration,
        },
        totalPrice: newTotalPrice,
      });

      setSelectedAttributeOptions(configuration.selectedAttributeOptions);

      if (showConfigurationSaveToast) {
        toaster.create({
          type: "success",
          title: t("admin.savedConfiguration", {
            defaultValue: "Configuration saved",
          }),
          duration: 2000,
        });
      }

      return;
    }

    const current = getValues(`items.${index}`) as OrderItem;
    const updatedItem: OrderItem = {
      ...current,
      product: {
        ...product,
        prices: pricesForSavedConfiguration,
      },
      combination: configuration.combination,
      calculatedCombination: configuration.calculatedCombination,
      description: configuration.descriptionCombination ?? "",
      volume: configuration.volume,
      customFormat: configuration.customFormat,
      width: configuration.width,
      height: configuration.height,
      quantity: configuration.quantity,
      totalPrice: newTotalPrice,
      advancedAttributeSelections: configuration.advancedAttributeSelections,
      discount: new Discount(
        undefined,
        DiscountTypeEnum.PERCENTAGE,
        savedEffectiveDiscountValue,
        savedDiscountAmount,
        null,
      ).object,
      customSizes: configuration.customSizes ?? [],
      expressPercent: _savedExpressPercent,
    };

    if (newItem) {
      if (!insertAction) {
        console.error("Insert function is not defined");
        return;
      }
      insertAction(targetIndex, { ...updatedItem, id: getRandomId() });
      // Re-open the dialog on the newly added item in a microtask to avoid tearing
      queueMicrotask(() => setOpenCombinationDialog(true));
    } else {
      update(targetIndex, updatedItem);
    }

    setSelectedAttributeOptions(configuration.selectedAttributeOptions);

    if (printingMethod && watchOrderPrintingMethods) {
      setValue(
        "printingMethods",
        union(watchOrderPrintingMethods, [printingMethod]),
        {
          shouldDirty: true,
          shouldTouch: false,
          shouldValidate: false,
        },
      );
    }

    if (showConfigurationSaveToast) {
      toaster.create({
        type: "success",
        title: t("admin.savedConfiguration", {
          defaultValue: "Configuration saved",
        }),
        duration: 2000,
      });
    }
  }

  // Check if product has matrix-like price type and needs attributes.
  const needsAttributes = useMemo(
    () => isMatrixLikePriceType(product.priceType),
    [product.priceType],
  );

  const hasCustomPrice = !!productAllowCustomPrice;
  const isMatrixLikeProduct = isMatrixLikePriceType(currentProduct?.priceType);
  const isInitialConfigurationPending =
    isMatrixLikeProduct && selectedAttributeOptions === undefined;
  const showIncompatibleConfigurationFallback =
    shouldShowIncompatibleConfigurationFallback({
      currentProduct,
      init,
      isMatrixProduct: isMatrixLikeProduct,
      selectedAttributeOptions,
    });
  const resolvedMatrixVolume = useMemo(() => {
    if (!currentProduct || !isMatrixLikePriceType(currentProduct.priceType)) {
      return typeof volume === "number" && volume > 0
        ? volume
        : matrixFallbackVolume;
    }

    const preferredVolume =
      typeof volume === "number" && volume > 0 ? volume : matrixFallbackVolume;
    const combinationId =
      calculatedCombination && calculatedCombination.trim() !== ""
        ? calculatedCombination
        : DEFAULT_COMBINATION;

    return resolveMatrixVolume({
      volume,
      productChanged: false,
      getFirstUsableMatrixVolume: () =>
        getFirstUsableMatrixVolume({
          calculatedCombination: combinationId,
          fallbackVolume: preferredVolume,
          prices: effectivePricesForCalc,
          volumes: currentProduct.volumes,
        }),
    });
  }, [
    calculatedCombination,
    currentProduct,
    effectivePricesForCalc,
    matrixFallbackVolume,
    volume,
  ]);

  const combinationInitConfiguration = useMemo<Configuration | null>(() => {
    if (!currentProduct) return null;
    if (isMatrixLikeProduct && selectedAttributeOptions === undefined) {
      return null;
    }

    const resolvedNonMatrixVolume = resolveNonMatrixVolume({
      volume,
      quantity,
      minimumOrder: currentProduct.spec.minimumOrder,
      productChanged: false,
    });
    const resolvedPageCount = currentProduct.pageCount?.enabled
      ? typeof pageCount === "number" &&
        Number.isFinite(pageCount) &&
        pageCount > 0
        ? pageCount
        : currentProduct.pageCount.minimum
      : undefined;

    return {
      productId: product.id,
      selectedAttributeOptions:
        isMatrixLikeProduct && selectedAttributeOptions
          ? {
              ...selectedAttributeOptions,
              volume: resolvedMatrixVolume,
            }
          : (selectedAttributeOptions ?? null),
      advancedAttributeSelections,
      descriptionCombination: description ?? null,
      combination: combination ?? null,
      calculatedCombination: calculatedCombination ?? null,
      volume: isMatrixLikeProduct
        ? resolvedMatrixVolume
        : resolvedNonMatrixVolume,
      customFormat,
      width: width ?? 0,
      height: height ?? 0,
      pageCount: resolvedPageCount,
      quantity,
      customSizes: customSizes ?? [],
    } as Configuration;
  }, [
    currentProduct,
    isMatrixLikeProduct,
    selectedAttributeOptions,
    description,
    combination,
    calculatedCombination,
    volume,
    customFormat,
    width,
    height,
    pageCount,
    quantity,
    customSizes,
    product.id,
    resolvedMatrixVolume,
    advancedAttributeSelections,
  ]);

  const inputs = useMemo(
    () => [
      <UnitInput
        key="UnitInput"
        index={index}
        liveVolume={liveConfiguration?.volume}
        liveQuantity={liveConfiguration?.quantity}
        liveCustomFormat={liveConfiguration?.customFormat}
        liveWidth={liveConfiguration?.width}
        liveHeight={liveConfiguration?.height}
        liveDescription={liveConfiguration?.descriptionCombination ?? undefined}
      />,
      hasCustomPrice ? (
        <CustomPriceInput key="CustomPriceInput" index={index} />
      ) : (
        <></>
      ), // placeholder keeps hook positions stable
      <CustomDiscountInput
        key="CustomDiscountInput"
        index={index}
        totalPriceWithoutDiscount={totalPriceWithoutDiscount}
        enableCustomDiscount={enableCustomDiscount}
        setEnableCustomDiscount={setEnableCustomDiscount}
        effectiveDiscountValue={effectiveDiscountValue}
      />,
      storeSettings?.express?.enabled ? (
        <CustomExpressInput
          key="CustomExpressInput"
          index={index}
          defaultExpressPercent={storeSettings?.express?.percent}
        />
      ) : (
        <></>
      ), // placeholder keeps hook positions stable
      <NameInput key="NameInput" index={index} />,
    ],
    [
      index,
      hasCustomPrice,
      totalPriceWithoutDiscount,
      enableCustomDiscount,
      effectiveDiscountValue,
      setEnableCustomDiscount,
      storeSettings,
      liveConfiguration,
    ],
  );

  const previewOrderItem = useMemo<OrderItem>(
    () => ({
      ...orderItem,
      name: orderItemName ?? orderItem.name,
      description:
        liveConfiguration?.descriptionCombination ?? orderItem.description,
      pageCount: liveConfiguration?.pageCount ?? orderItem.pageCount,
      quantity: liveConfiguration?.quantity ?? quantity,
      totalPrice:
        typeof orderItemTotalPrice === "number"
          ? orderItemTotalPrice
          : orderItem.totalPrice,
      volume: liveConfiguration?.volume ?? volume,
      advancedAttributeSelections:
        liveConfiguration?.advancedAttributeSelections ??
        advancedAttributeSelections,
    }),
    [
      liveConfiguration?.advancedAttributeSelections,
      liveConfiguration?.descriptionCombination,
      liveConfiguration?.pageCount,
      liveConfiguration?.quantity,
      liveConfiguration?.volume,
      advancedAttributeSelections,
      orderItem,
      orderItemName,
      orderItemTotalPrice,
      quantity,
      volume,
    ],
  );

  useEffect(() => {
    if (openCombinationDialog) {
      return;
    }

    const currentDiscountValue = discount?.discountValue ?? 0;
    const currentDiscountedAmount = discount?.discountedAmount ?? 0;

    if (currentDiscountValue <= 0 || totalPriceWithoutDiscount <= 0) {
      return;
    }

    const expectedDiscountedAmount = Math.max(
      0,
      Math.floor(totalPriceWithoutDiscount * (currentDiscountValue / 100)),
    );

    if (expectedDiscountedAmount === currentDiscountedAmount) {
      return;
    }

    setValue(
      `items[${index}].discount`,
      new Discount(
        undefined,
        DiscountTypeEnum.PERCENTAGE,
        currentDiscountValue,
        expectedDiscountedAmount,
        null,
      ).object,
      {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      },
    );
  }, [
    discount?.discountValue,
    discount?.discountedAmount,
    index,
    openCombinationDialog,
    setValue,
    totalPriceWithoutDiscount,
  ]);

  // Only show loading skeleton when product needs attributes but doesn't have them yet
  if (
    needsAttributes &&
    !filteredAttributesRef.current.length &&
    isValidatingProduct
  ) {
    return <Skeleton w={"100%"} height={"200px"} />;
  }

  if (productAllowCustomPrice === undefined && !fetchedProduct) {
    return <Skeleton w="100%" height="200px" />;
  }

  // Handler for name changes
  const handleNameChange = (value: string) => {
    setValue(`items[${index}].name`, value);
  };

  const overrideDialogFieldLabel = overrideDialog.key
    ? overrideFieldLabels[overrideDialog.key]
    : "";

  return (
    <Skeleton loading={!!loading}>
      <Box position={"relative"} mt={8}>
        {showIncompatibleConfigurationFallback ? (
          <OrderItemReadonlyFallback
            item={previewOrderItem}
            title={t("order.inlineEdit.incompatibleConfigurationTitle", {
              defaultValue: "Saved configuration can no longer be opened",
            })}
            description={t(
              "order.inlineEdit.incompatibleConfigurationDescription",
              {
                defaultValue:
                  "This product changed enough that the saved configuration can no longer be reconstructed safely. The saved item details are shown below as read-only text.",
              },
            )}
          />
        ) : (
          <>
            {channel && orderItem && (
              <Item
                item={previewOrderItem}
                channelId={resolvedPricingChannelId ?? channel.id}
                t={t}
                i18n={i18n}
                isNameEditable={true}
                onNameChange={handleNameChange}
              />
            )}
            <Dialog.Root
              size={"full"}
              open={openCombinationDialog}
              closeOnInteractOutside={!overrideDialog.open}
              closeOnEscape={!overrideDialog.open}
              lazyMount
              unmountOnExit
              onOpenChange={(details) =>
                startTransition(() => {
                  handleOnOpenChange(details);
                })
              }
            >
              <Dialog.Trigger asChild>
                <IconButton
                  position={"absolute"}
                  right={0}
                  top={0}
                  aria-label={t("admin.configuration", {
                    defaultValue: "Configuration",
                  })}
                  colorPalette={"primary"}
                  disabled={
                    loading ||
                    init ||
                    waitingForPrices ||
                    !combinationInitConfiguration
                  }
                  loading={
                    isLoadingProduct ||
                    isValidatingProduct ||
                    waitingForPrices ||
                    isInitialConfigurationPending ||
                    !combinationInitConfiguration
                  }
                >
                  <MaterialSymbol>tune</MaterialSymbol>
                </IconButton>
              </Dialog.Trigger>
              <Portal>
                <Dialog.Backdrop />
                <Dialog.Positioner paddingTop={isElectron() ? 4 : 0}>
                  <Dialog.Content>
                    <Dialog.Body bgColor={{ base: "white", _dark: "black" }}>
                      <Container maxW={"7xl"} py={8}>
                        <Dialog.CloseTrigger asChild>
                          <CloseButton size="xs" />
                        </Dialog.CloseTrigger>
                        {combinationInitConfiguration ? (
                          <Combination
                            router={router}
                            pathname={pathname}
                            params={params}
                            searchParams={searchParams}
                            syncQueryParams={false}
                            product={currentProduct!}
                            attributes={filteredAttributesRef.current}
                            channelId={resolvedPricingChannelId}
                            firestore={firestore}
                            db={db}
                            getDoc={getDoc}
                            download={download}
                            productId={product.id}
                            saveConfiguration={saveConfiguration}
                            initConfiguration={
                              changedConfiguration ??
                              combinationInitConfiguration
                            }
                            inputs={inputs}
                            discount={discount}
                            unit={unit}
                            customPrice={customPrice}
                            descriptionPreview={
                              <DescriptionPreview
                                source={product.description}
                              />
                            }
                            customerDiscount={
                              enableCustomDiscount
                                ? undefined
                                : getCustomerDiscountForProduct(
                                    customer,
                                    product.id,
                                    product,
                                  )
                            }
                            setChangedConfiguration={handleSetConfiguration}
                            promotions={promotions}
                            expressPercent={expressPercent}
                            storeSettings={
                              storeSettings
                                ? { express: storeSettings.express }
                                : undefined
                            }
                            allowOutOfSpec={true}
                            allowSaveAsNew={allowSaveAsNew}
                            onOverrideWarning={requestOverrideWarning}
                            saveAsNewLabel={saveAsNewLabel}
                            saveConfigurationIcon={saveConfigurationIcon}
                            saveConfigurationLabel={saveConfigurationLabel}
                            t={t}
                            i18n={i18n}
                          />
                        ) : (
                          <Skeleton borderRadius={"3xl"} height={"60vh"} />
                        )}
                      </Container>
                    </Dialog.Body>
                    <ConfigurationCostPanel
                      open={openCombinationDialog}
                      productId={productId}
                      selectedAttributeOptions={
                        liveConfiguration?.selectedAttributeOptions ??
                        selectedAttributeOptions
                      }
                      attributes={filteredAttributesRef.current}
                      quantity={costPanelQuantity}
                      totalPrice={totalPrice}
                      width={liveConfiguration?.width ?? width}
                      height={liveConfiguration?.height ?? height}
                      customSizes={liveConfiguration?.customSizes ?? customSizes}
                      bleed={
                        product.designSpec?.includeBleed
                          ? product.designSpec.bleed
                          : undefined
                      }
                    />
                  </Dialog.Content>
                </Dialog.Positioner>
              </Portal>
            </Dialog.Root>
          </>
        )}
        <Dialog.Root
          open={overrideDialog.open}
          role={"alertdialog"}
          onOpenChange={() => undefined}
          placement={"center"}
        >
          <Portal>
            <Dialog.Backdrop zIndex={2405} />
            <Dialog.Positioner zIndex={2406}>
              <Dialog.Content zIndex={2407}>
                <Dialog.Header>
                  <Dialog.Title>
                    {t("admin.specOverrides.overrideDialogTitle", {
                      defaultValue: "Specification override applied",
                    })}
                  </Dialog.Title>
                </Dialog.Header>
                <Dialog.Body>
                  <p>
                    {t("admin.specOverrides.overrideDialogDescription", {
                      defaultValue:
                        "{{field}} value {{value}} is outside the product specification (min {{min}}, max {{max}}, step {{step}}). This override will be applied for this item.",
                      field: overrideDialogFieldLabel,
                      value: formatOverrideValue(overrideDialog.value),
                      min: formatOverrideValue(overrideDialog.min),
                      max: formatOverrideValue(overrideDialog.max),
                      step: formatOverrideValue(overrideDialog.step),
                    })}
                  </p>
                </Dialog.Body>
                <Dialog.Footer>
                  <Button
                    colorPalette={"primary"}
                    onClick={handleOverrideDialogConfirm}
                  >
                    {t("admin.specOverrides.overrideDialogConfirm", {
                      defaultValue: "I understand",
                    })}
                  </Button>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
        <Dialog.Root
          initialFocusEl={() => saveDialogFocusRef.current}
          open={openSaveDialog}
          role={"alertdialog"}
          placement="center"
        >
          <Portal>
            <Dialog.Backdrop zIndex={2402} />
            <Dialog.Positioner zIndex={2403}>
              <Dialog.Content zIndex={2404}>
                <Dialog.Header>
                  <Dialog.Title>
                    {t("admin.unsavedChanges", {
                      defaultValue: "Unsaved Changes!",
                    })}
                  </Dialog.Title>
                </Dialog.Header>
                <Dialog.Body>
                  <p>
                    {t("admin.changesDetected", {
                      defaultValue: "Changes detected in configuration.",
                    })}
                  </p>
                </Dialog.Body>
                <Dialog.Footer>
                  <Dialog.ActionTrigger asChild>
                    <Button
                      variant={"outline"}
                      onClick={() => handleWithoutSave()}
                    >
                      {t("admin.dontSave", { defaultValue: "Don't Save" })}
                    </Button>
                  </Dialog.ActionTrigger>
                  <Button
                    ref={saveDialogFocusRef}
                    colorPalette={"primary"}
                    onClick={() => handleWithSave()}
                  >
                    {t("admin.goBack", { defaultValue: "Go Back" })}
                  </Button>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      </Box>
      {(Array.isArray(errors.items) ? errors.items[index] : errors.items) && (
        <Alert.Root mt={2} size="sm" status="error">
          <Alert.Indicator />
          <Alert.Title>
            {t("orders.combinationInputError", {
              defaultValue:
                "This item has an invalid configuration. Try adding or configuring the product again.",
            })}
          </Alert.Title>
        </Alert.Root>
      )}
    </Skeleton>
  );
});

const NameInput = ({ index }: { index: number }) => {
  const { t } = useT(["order", "orders", "translation"]);
  const {
    control,
    formState: { errors },
  } = useFormContext();
  const inputValueRef = useRef<string>("");

  return (
    <Controller
      name={`items[${index}].name`}
      control={control}
      render={({ field }) => {
        // Sync ref with field value when not editing
        inputValueRef.current = field.value || "";

        return (
          <Field
            invalid={!!errors[field.name]}
            errorText={errors[field.name]?.message as string | undefined}
          >
            <Editable.Root
              mt={"4"}
              name={field.name}
              defaultValue={field.value}
              key={field.value} // Force re-mount when field value changes externally
              onValueChange={({ value }) => {
                // Buffer the value in ref while editing
                inputValueRef.current = value;
              }}
              onValueCommit={() => {
                // Only update form state when user commits the change
                field.onChange(inputValueRef.current);
              }}
              placeholder={t("admin.customNamePlaceholder", {
                defaultValue: "Custom name...",
              })}
            >
              <Heading size={"2xl"}>
                <Editable.Preview />
              </Heading>
              <Editable.Input />
            </Editable.Root>
          </Field>
        );
      }}
    />
  );
};

const CustomPriceInput = ({ index }: { index: number }) => {
  const { t } = useT(["order", "orders", "translation"]);
  const {
    control,
    formState: { errors },
  } = useFormContext();
  const { field } = useController({
    name: `items[${index}].customPrice`,
    control,
  });
  const [displayValue, setDisplayValue] = useState<string>(() =>
    field.value ? formatCustomPriceForDisplay(field.value) : "",
  );
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDisplayValue(value);
    const groszValue = parseCustomPriceInput(value);
    field.onChange(groszValue);
  };
  const handleBlur = () => {
    if (field.value) {
      setDisplayValue(formatCustomPriceForDisplay(field.value));
    }
    field.onBlur();
  };
  useEffect(() => {
    if (field.value && !displayValue) {
      setDisplayValue(formatCustomPriceForDisplay(field.value));
    }
  }, [field.value, displayValue]);
  return (
    <Field
      mt={4}
      label={t("products.customPrice", { defaultValue: "Custom Price" })}
      invalid={!!errors[field.name]}
      errorText={errors[field.name]?.message as string | undefined}
      helperText={t("admin.priceHelperText", {
        defaultValue: "Enter price in PLN (e.g. 50,00 zł or 50.00 zł)",
      })}
    >
      <Input
        ref={field.ref}
        type="text"
        disabled={field.disabled}
        name={field.name}
        value={displayValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder="0,00"
      />
    </Field>
  );
};

const CustomDiscountInput = ({
  index,
  totalPriceWithoutDiscount,
  enableCustomDiscount,
  setEnableCustomDiscount,
  effectiveDiscountValue,
}: {
  index: number;
  totalPriceWithoutDiscount?: number;
  enableCustomDiscount: boolean;
  setEnableCustomDiscount: Dispatch<SetStateAction<boolean>>;
  effectiveDiscountValue: number;
}) => {
  const { t } = useT(["order", "orders", "translation"]);
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext();
  const watchedDiscount: _Discount | undefined = useWatch({
    name: `items[${index}].discount`,
  });

  if (isUndefined(totalPriceWithoutDiscount)) return <Skeleton />;

  return (
    <Box w={"100%"} mt={4}>
      <Switch
        checked={enableCustomDiscount}
        onCheckedChange={(e) => {
          setEnableCustomDiscount(e.checked);
          if (e.checked) {
            // Seed default 0% discount if missing
            const hasValue =
              !!watchedDiscount?.discountValue ||
              watchedDiscount?.discountValue === 0;
            if (!hasValue) {
              setValue(
                `items[${index}].discount`,
                new _Discount(
                  undefined,
                  DiscountTypeEnum.PERCENTAGE,
                  0,
                  0,
                  null,
                ).object,
              );
            }
          }
        }}
      >
        {t("admin.customDiscount", { defaultValue: "Custom Discount" })}
      </Switch>
      <Show when={enableCustomDiscount}>
        <Controller
          name={`items[${index}].discount`}
          control={control}
          render={({ field }) => (
            <Field
              mt={4}
              label={t("admin.customDiscount", {
                defaultValue: "Custom Discount",
              })}
              invalid={!!errors[field.name]}
              errorText={errors[field.name]?.message as string | undefined}
              helperText={t("admin.customDiscountHelper", {
                defaultValue: "In percentage e.g. 10 = 10%",
              })}
            >
              <NumberInputRoot
                disabled={field.disabled}
                name={field.name}
                value={field.value?.discountValue ?? 0}
                onValueChange={({ value }) =>
                  field.onChange(
                    new _Discount(
                      undefined,
                      DiscountTypeEnum.PERCENTAGE,
                      Number(value),
                      Math.max(
                        0,
                        Math.floor(
                          totalPriceWithoutDiscount * (Number(value) / 100),
                        ),
                      ),
                      null,
                    ).object,
                  )
                }
              >
                <NumberInputField onBlur={field.onBlur} />
              </NumberInputRoot>
            </Field>
          )}
        />
      </Show>
      {!enableCustomDiscount && effectiveDiscountValue > 0 && (
        <Alert.Root
          mt={2}
          size={"sm"}
          status={"info"}
          title={"admin.activeDiscount"}
        >
          <Alert.Indicator />
          <Alert.Title>
            {t("admin.discountApplied", {
              defaultValue: "Discount {{discount}}% applied",
              discount: effectiveDiscountValue,
            })}
          </Alert.Title>
        </Alert.Root>
      )}
    </Box>
  );
};

const CustomExpressInput = ({
  index,
  defaultExpressPercent,
}: {
  index: number;
  defaultExpressPercent?: number;
}) => {
  const { t } = useT(["order", "orders", "translation"]);
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext();
  const expressPercent: number | undefined = useWatch({
    name: `items[${index}].expressPercent`,
  });
  const [enableCustomExpress, setEnableCustomExpress] = useState<boolean>(
    !!expressPercent && expressPercent > 0,
  );

  useEffect(() => {
    if (expressPercent !== undefined && expressPercent > 0) {
      setEnableCustomExpress(true);
    }
  }, [expressPercent]);

  return (
    <Box w={"100%"} mt={4}>
      <Switch
        checked={enableCustomExpress}
        onCheckedChange={(e) => {
          setEnableCustomExpress(e.checked);
          if (e.checked) {
            // Seed default express percent if missing
            if (!expressPercent || expressPercent === 0) {
              setValue(
                `items[${index}].expressPercent`,
                defaultExpressPercent || 0,
              );
            }
          } else {
            setValue(`items[${index}].expressPercent`, 0);
          }
        }}
      >
        {t("admin.customExpressPercent", {
          defaultValue: "Custom Express (%)",
        })}
      </Switch>
      <Show when={enableCustomExpress}>
        <Controller
          name={`items[${index}].expressPercent`}
          control={control}
          render={({ field }) => (
            <Field
              mt={4}
              label={t("admin.expressPercent", {
                defaultValue: "Express Percentage",
              })}
              invalid={!!errors[field.name]}
              errorText={errors[field.name]?.message as string | undefined}
              helperText={t("admin.expressPercentHelper", {
                defaultValue: "Markup percentage e.g. 20 = 20%",
              })}
            >
              <NumberInputRoot
                disabled={field.disabled}
                name={field.name}
                value={field.value ?? defaultExpressPercent ?? 20}
                onValueChange={({ value }) => field.onChange(Number(value))}
                min={0}
                max={100}
              >
                <NumberInputField onBlur={field.onBlur} />
              </NumberInputRoot>
            </Field>
          )}
        />
      </Show>
      {!enableCustomExpress &&
        defaultExpressPercent &&
        defaultExpressPercent > 0 && (
          <Alert.Root mt={2} size={"sm"} status={"info"}>
            <Alert.Indicator />
            <Alert.Title>
              {t("admin.defaultExpressApplied", {
                defaultValue:
                  "Default express markup {{value}}% will be applied if no custom markup set and express shipping selected",
                value: defaultExpressPercent,
              })}
            </Alert.Title>
          </Alert.Root>
        )}
    </Box>
  );
};

const UnitInput = (props: {
  index: number;
  liveVolume?: number;
  liveQuantity?: number;
  liveCustomFormat?: boolean;
  liveWidth?: number;
  liveHeight?: number;
  liveDescription?: string;
}) => {
  const { t } = useT(["order", "orders", "translation"]);
  const { unitsProofingSettings } = useConfiguration();
  const { index } = props;
  const unitOptions = useMemo(
    () => getUnitOptions(unitsProofingSettings, t),
    [unitsProofingSettings, t],
  );
  const value: Unit = useWatch({ name: `items[${index}].unit` });
  const prefferedUnit = useWatch({
    name: `items[${index}].product.prefferedUnit`,
  });
  const customSizes = useWatch({
    name: `items[${index}].customSizes`,
  });
  const {
    setValue,
    control,
    formState: { errors },
  } = useFormContext();

  useEffect(() => {
    if ((customSizes?.length ?? 0) > 0 && value !== Unit.M2) {
      setValue(`items[${index}].unit`, Unit.M2);
    }
  }, [customSizes, value, index, setValue]);

  // Only apply product's preferred unit if item has no unit yet
  useEffect(() => {
    if (
      (customSizes?.length ?? 0) === 0 &&
      !isUndefined(prefferedUnit) &&
      (isUndefined(value) || isNull(value))
    ) {
      setValue(`items[${index}].unit`, prefferedUnit);
    }
  }, [customSizes, prefferedUnit, value, index, setValue]);

  return (
    <Controller
      name={`items[${index}].unit`}
      control={control}
      render={({ field }) => (
        <Field
          mb={4}
          label={t("forms.labels.unit", { defaultValue: "Unit" })}
          invalid={!!errors[field.name]}
          errorText={errors[field.name]?.message as string | undefined}
        >
          <SelectInput
            field={{
              name: field.name,
              placeholder: t("admin.selectUnitPlaceholder", {
                defaultValue: "Select unit...",
              }),
            }}
            options={unitOptions}
            disabled={false}
          />
        </Field>
      )}
    />
  );
};
