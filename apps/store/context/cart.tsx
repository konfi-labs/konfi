"use client";

import {
  assertStoreStorageQuota,
  preflightCheck,
  recordStoreStorageUsage,
} from "@/actions";
import { useT } from "@/i18n/client";
import { firestore, storage } from "@/lib/firebase/clientApp";
import type { CartPreflightJob } from "@/lib/cart-preflight/types";
import { isStoreMaintenancePath } from "@/lib/maintenance";
import { fetchPricesForCartItems } from "@/lib/products/fetch-cart-prices";
import { toaster } from "@konfi/components";
import {
  create,
  db,
  tenant,
  tenantFirestorePaths,
  tenantStoragePaths,
} from "@konfi/firebase";
import {
  Discount,
  OrderItem,
  type PaymentMethodId,
  type PaymentMethodsSettings,
  PaymentType,
  PreflightIssue,
  Product,
  type ShippingMethodId,
  type ShippingMethodsSettings,
} from "@konfi/types";
import {
  calculateConfiguredProductPrice,
  formatOrderItemAsAnalyticsItem,
  normalizePaymentMethodsSettings,
  normalizeShippingMethodsSettings,
  PAYMENT_METHODS_SETTINGS_DOC_ID,
  SHIPPING_METHODS_SETTINGS_DOC_ID,
  getSubtotalPrice,
  getStoreCreditRedemptionLimit,
  getTotalPrice,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { logEvent } from "firebase/analytics";
import { User } from "firebase/auth";
import {
  deleteDoc,
  doc,
  onSnapshot,
  query as firestoreQuery,
} from "firebase/firestore";
import { StorageReference } from "firebase/storage";
import { usePathname } from "next/navigation";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./auth";
import {
  getCartAvailablePaymentTypes,
  getCartAvailableShippingOptions,
  getCartShippingRuleContext,
  INITIAL_CART_SHIPPING_OPTION,
  resolveCartSelection,
} from "./cart-selections";
import { useStoreCurrency } from "./currency";
import { useStoreRuntimeConfig } from "./runtime-config";
import { useTenantContext } from "./tenant";

interface Cart {
  loading: boolean;
  isEmpty: boolean;
  items: OrderItem[] | null;
  setItemsWithDiscount: (items: OrderItem[]) => void;
  total: number;
  totalBeforeStoreCredit: number;
  totalDiscount: Discount | null;
  setTotalDiscount: Dispatch<SetStateAction<Discount | null>>;
  subtotal: number;
  add: (orderItem: OrderItem, _user?: User) => Promise<string | undefined>;
  remove: (
    orderItem: OrderItem,
    listResults: StorageReference[],
  ) => Promise<void>;
  upload: (
    index: number,
    itemId: string,
    files: File[],
    width?: number,
    height?: number,
  ) => Promise<void>;
  uploaders: {
    file: File;
    id: string;
    index: number;
    itemId: string;
    progress: number;
  }[];
  shippingOption: ShippingMethodId;
  shippingMethodsSettings: ShippingMethodsSettings;
  shippingPriceDiscount: Discount | null;
  setShippingPriceDiscount: Dispatch<SetStateAction<Discount | null>>;
  setShippingOption: Dispatch<SetStateAction<ShippingMethodId>>;
  availableShippingOptions: ShippingMethodId[] | null;
  shippingPrice: number;
  setShippingPrice: Dispatch<SetStateAction<number>>;
  availablePaymentTypes: PaymentMethodId[] | null;
  paymentType: PaymentMethodId;
  paymentMethodsSettings: PaymentMethodsSettings;
  setPaymentType: Dispatch<SetStateAction<PaymentMethodId>>;
  revalidate: () => Promise<void>;
  isValid: boolean;
  validationErrors: { title: string; description: string }[];
  preflightJobs: CartPreflightJob[];
  preflightIssues: PreflightIssue[];
  appliedPromotionCodes: string[];
  setAppliedPromotionCodes: Dispatch<SetStateAction<string[]>>;
  discountAmount: number;
  storeCreditAmount: number;
  setStoreCreditAmount: Dispatch<SetStateAction<number>>;
}

const CartContext = createContext<Cart>({
  loading: true,
  isEmpty: true,
  items: null,
  setItemsWithDiscount: () => {},
  total: 0,
  totalBeforeStoreCredit: 0,
  totalDiscount: null,
  setTotalDiscount: () => {},
  subtotal: 0,
  add: () => new Promise<undefined>((resolve) => resolve(undefined)),
  remove: () => new Promise<void>((resolve) => resolve()),
  upload: () => new Promise<void>((resolve) => resolve()),
  uploaders: [],
  shippingOption: INITIAL_CART_SHIPPING_OPTION,
  shippingMethodsSettings: normalizeShippingMethodsSettings(),
  setShippingOption: () => {},
  availableShippingOptions: null,
  shippingPrice: 0,
  shippingPriceDiscount: null,
  setShippingPriceDiscount: () => {},
  setShippingPrice: () => {},
  availablePaymentTypes: null,
  paymentType: PaymentType.STRIPE,
  paymentMethodsSettings: normalizePaymentMethodsSettings(),
  setPaymentType: () => {},
  revalidate: () => new Promise<void>((resolve) => resolve()),
  isValid: false,
  validationErrors: [],
  preflightJobs: [],
  preflightIssues: [],
  appliedPromotionCodes: [],
  setAppliedPromotionCodes: () => {},
  discountAmount: 0,
  storeCreditAmount: 0,
  setStoreCreditAmount: () => {},
});

const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useT();
  const { user, customer, loading: userLoading } = useAuth();
  const { selectedCurrencyCode, toMajorAmount } = useStoreCurrency();
  const runtimeConfig = useStoreRuntimeConfig();
  const tenantContext = useTenantContext();
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(true);
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const setItemsWithDiscount = useCallback((items: OrderItem[]) => {
    setItems(items);
  }, []);
  const [totalDiscount, setTotalDiscount] = useState<Discount | null>(null);
  const [uploaders, setUploaders] = useState<
    {
      file: File;
      id: string;
      index: number;
      itemId: string;
      progress: number;
    }[]
  >([]);
  const [shippingOption, setShippingOption] = useState<ShippingMethodId>(
    INITIAL_CART_SHIPPING_OPTION,
  );
  const [shippingPrice, setShippingPrice] = useState(0);
  const [shippingPriceDiscount, setShippingPriceDiscount] =
    useState<Discount | null>(null);
  const [storeCreditAmount, setStoreCreditAmount] = useState(0);
  const [paymentType, setPaymentType] = useState<PaymentMethodId>(
    PaymentType.STRIPE,
  );
  const [isValid, setIsValid] = useState<boolean>(true);
  const [canRevalidate, setCanRevalidate] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<
    { title: string; description: string }[]
  >([]);
  const pathname = usePathname();
  const [appliedPromotionCodes, setAppliedPromotionCodes] = useState<string[]>(
    [],
  );
  const [shippingMethodsSettings, setShippingMethodsSettings] =
    useState<ShippingMethodsSettings | null>(null);
  const [paymentMethodsSettings, setPaymentMethodsSettings] =
    useState<PaymentMethodsSettings | null>(null);
  const isMaintenancePath = isStoreMaintenancePath(pathname);

  useEffect(() => {
    if (isMaintenancePath) {
      setShippingMethodsSettings(normalizeShippingMethodsSettings());
      setPaymentMethodsSettings(normalizePaymentMethodsSettings());
      return;
    }

    const shippingRef = doc(
      firestore,
      tenantFirestorePaths.settingsDoc(
        tenantContext,
        runtimeConfig.channelId,
        SHIPPING_METHODS_SETTINGS_DOC_ID,
      ),
    );
    const paymentRef = doc(
      firestore,
      tenantFirestorePaths.settingsDoc(
        tenantContext,
        runtimeConfig.channelId,
        PAYMENT_METHODS_SETTINGS_DOC_ID,
      ),
    );
    const unsubscribeShipping = onSnapshot(shippingRef, (snapshot) => {
      setShippingMethodsSettings(
        normalizeShippingMethodsSettings(
          snapshot.exists()
            ? (snapshot.data() as ShippingMethodsSettings)
            : null,
        ),
      );
    });
    const unsubscribePayment = onSnapshot(paymentRef, (snapshot) => {
      setPaymentMethodsSettings(
        normalizePaymentMethodsSettings(
          snapshot.exists()
            ? (snapshot.data() as PaymentMethodsSettings)
            : null,
        ),
      );
    });

    return () => {
      unsubscribeShipping();
      unsubscribePayment();
    };
  }, [isMaintenancePath, runtimeConfig.channelId, tenantContext]);
  const subtotal = useMemo(
    () => (isNull(items) ? 0 : getSubtotalPrice(items)),
    [items],
  );
  const shippingRuleContext = useMemo(
    () =>
      getCartShippingRuleContext(items, {
        channelId: runtimeConfig.channelId,
        subtotal,
      }),
    [items, runtimeConfig.channelId, subtotal],
  );
  const availableShippingOptions = useMemo(
    () =>
      getCartAvailableShippingOptions(
        items,
        shippingMethodsSettings,
        shippingRuleContext,
      ),
    [items, shippingMethodsSettings, shippingRuleContext],
  );
  const availablePaymentTypes = useMemo(
    () =>
      getCartAvailablePaymentTypes(
        shippingOption,
        customer,
        undefined,
        selectedCurrencyCode,
        paymentMethodsSettings,
        runtimeConfig.paymentProviders,
      ),
    [
      shippingOption,
      customer,
      selectedCurrencyCode,
      paymentMethodsSettings,
      runtimeConfig.paymentProviders,
    ],
  );
  const totalBeforeStoreCredit = useMemo(
    () =>
      isNull(items)
        ? 0
        : getTotalPrice(items, shippingPrice, totalDiscount?.discountedAmount),
    [items, shippingPrice, totalDiscount],
  );
  const total = useMemo(
    () => Math.max(0, totalBeforeStoreCredit - storeCreditAmount),
    [storeCreditAmount, totalBeforeStoreCredit],
  );

  useEffect(() => {
    const redemptionLimit = getStoreCreditRedemptionLimit({
      balance: customer?.storeCreditBalance,
      orderTotal: totalBeforeStoreCredit,
    });

    setStoreCreditAmount((currentAmount) =>
      currentAmount > redemptionLimit ? redemptionLimit : currentAmount,
    );
  }, [customer?.storeCreditBalance, totalBeforeStoreCredit]);

  const revalidate = useCallback(async () => {
    if (!canRevalidate) return;
    if (!items) return;
    setIsValid(false);
    try {
      const where = (await import("firebase/firestore")).where;
      const get = (await import("@konfi/firebase")).get;
      const result = await get<Product>(
        db.collectionGroup<Product>(firestore, `products`, 999, [
          ...tenant.queryConstraints(tenantContext, [
            where("active", "==", true),
            where("availability.published", "==", true),
            where(
              "id",
              "in",
              items?.map((item) => item.product?.id),
            ),
          ]),
        ]),
      );

      // If there is no results either products are not published or not available anymore
      if (!result) {
        setIsValid(false);
        setLoading(false);
        return;
      }

      const [products] = result;
      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );
      const priceEntries = items.flatMap((item) => {
        const productId = item.product?.id;
        const product = productId ? productsById.get(productId) : undefined;

        return product ? [{ item, product }] : [];
      });
      const pricesByCartItemId = await fetchPricesForCartItems(
        firestore,
        priceEntries,
      );

      // Check if prices are valid
      let valid = true;
      const _validationErrors: { title: string; description: string }[] = [];
      for (const [index, item] of items.entries()) {
        const productId = item.product?.id;
        const product = productId ? productsById.get(productId) : undefined;
        if (!product || !item.product || !item.calculatedCombination) {
          _validationErrors.push({
            title: t("cart.productUnavailable", {
              defaultValue: "Product is no longer available",
            }),
            description: t("cart.removeProduct", {
              defaultValue: "Remove product from cart",
            }),
          });
          valid = false;
          break;
        }

        // Always fetch prices - don't use embedded product prices
        let pricesForCalculation: Product["prices"] = [];
        try {
          const fetchedPrices = pricesByCartItemId.get(
            item.id || `${item.product?.id ?? "unknown"}:${index}`,
          );
          if (fetchedPrices && fetchedPrices.length > 0) {
            pricesForCalculation = fetchedPrices;
          } else {
            console.warn(
              `No prices found for product ${product.id} with combination ${item.calculatedCombination}`,
            );
            continue; // Skip this item if no prices are available
          }
        } catch (error) {
          console.error(
            `Failed to fetch prices for product ${product.id}:`,
            error,
          );
          valid = false;
          _validationErrors.push({
            title: t("cart.priceCheckError", {
              defaultValue:
                "Error occurred while checking price of product {{productName}} - {{description}}",
              productName: item.product.name,
              description: item.description,
            }),
            description: t("common.tryAgain", {
              defaultValue: "Please try again later",
            }),
          });
          continue; // Skip this item if price fetching fails
        }

        const { result, error } = calculateConfiguredProductPrice({
          quantity: item.quantity,
          prices: pricesForCalculation,
          priceType: item.product.priceType,
          discount: item.discount.discountValue ?? undefined,
          calculatedCombination: item.calculatedCombination ?? undefined,
          volume: item.volume ?? undefined,
          customFormat: item.customFormat,
          width: item.width,
          height: item.height,
          minimumOrder: item.product?.spec.minimumOrder,
          customPrice: null,
          bleed: product?.designSpec?.includeBleed
            ? product?.designSpec?.bleed
            : undefined,
          customerDiscount: item.discount.code
            ? 0
            : customer?.linkedProductsIds?.includes(product?.id)
              ? 0
              : customer?.discount,
          customSizes: item.customSizes,
          expressPercent: item.expressPercent,
          pageCount: item.pageCount,
          pageCountConfig: item.product.pageCount ?? product.pageCount,
        });
        // Check if configuration price exists and matches total price of item in cart
        if (!result || result !== item.totalPrice) {
          _validationErrors.push({
            title: t("cart.invalidPrice", {
              defaultValue:
                "Price of product {{productName}} - {{description}} is invalid",
              productName: item.product.name,
              description: item.description,
            }),
            description: t("cart.addProductAgain", {
              defaultValue: "Add product to cart again",
            }),
          });
          valid = false;
          break;
        }
        if (error) {
          _validationErrors.push({
            title: t("cart.priceCheckError", {
              defaultValue:
                "Error occurred while checking price of product {{productName}} - {{description}}",
              productName: item.product.name,
              description: item.description,
            }),
            description: t("cart.addProductAgain", {
              defaultValue: "Add product to cart again",
            }),
          });
          valid = false;
          break;
        }
      }

      setValidationErrors(_validationErrors);
      setIsValid(valid);
      setLoading(false);
    } catch (error) {
      console.error(error);
      setValidationErrors([
        {
          title: t("cart.validationError", {
            defaultValue: "An error occurred while validating cart",
          }),
          description: t("common.tryAgain", {
            defaultValue: "Please try again later",
          }),
        },
      ]);
      setIsValid(false);
      setLoading(false);
      return;
    }
  }, [canRevalidate, items, tenantContext]); // Add dependencies here
  const [preflightIssues, setPreflightIssues] = useState<PreflightIssue[]>([]);
  const [preflightJobs, setPreflightJobs] = useState<CartPreflightJob[]>([]);
  const discountAmount = useMemo(() => {
    let _discountAmount = 0;
    if (items) {
      items.forEach((item) => {
        if (item.discount) {
          _discountAmount += item.discount.discountedAmount;
        }
      });
    }
    if (totalDiscount) {
      _discountAmount += totalDiscount.discountedAmount;
    }
    if (shippingPriceDiscount) {
      _discountAmount += shippingPriceDiscount.discountedAmount;
    }
    return _discountAmount;
  }, [items, total, shippingPrice, totalDiscount, shippingPriceDiscount]);

  function setInit() {
    setIsEmpty(true);
    setItems(null);
    setShippingPrice(0);
    setUploaders([]);
    setPreflightJobs([]);
    setAppliedPromotionCodes([]);
    setTotalDiscount(null);
    setShippingPriceDiscount(null);
    setStoreCreditAmount(0);
  }

  useEffect(() => {
    if (isNull(user) || isNull(items) || isEmpty || uploaders.length > 0)
      setCanRevalidate(false);
    return setCanRevalidate(true);
  }, [user, items, isEmpty, uploaders]);

  useEffect(() => {
    setLoading(true);
    if (!isNull(items) && items.length >= 1) {
      setIsEmpty(false);
    } else {
      setInit();
    }
    setLoading(false);
  }, [items]);

  useEffect(() => {
    if (availableShippingOptions.length <= 0) {
      return;
    }

    setShippingOption((currentShippingOption) => {
      if (availableShippingOptions.includes(currentShippingOption)) {
        return currentShippingOption;
      }

      return resolveCartSelection(
        currentShippingOption,
        availableShippingOptions,
      );
    });
  }, [availableShippingOptions]);

  useEffect(() => {
    if (isMaintenancePath) {
      return;
    }

    if (!shippingOption) {
      return;
    }

    if (availablePaymentTypes.length <= 0) {
      console.error(
        t("cart.noPaymentOptions", {
          defaultValue: "No available payment options",
        }),
      );
      return;
    }

    setPaymentType((currentPaymentType) => {
      if (availablePaymentTypes.includes(currentPaymentType)) {
        return currentPaymentType;
      }

      return resolveCartSelection(currentPaymentType, availablePaymentTypes);
    });
  }, [availablePaymentTypes, isMaintenancePath, shippingOption, t]);

  useEffect(() => {
    setLoading(true);

    if (userLoading) return;

    if (!user) {
      setLoading(false);
      setInit();
      return;
    }
    const unsubscribe = onSnapshot(
      db.collection<OrderItem>(
        firestore,
        tenantFirestorePaths.cartItemsCollection(tenantContext, user.uid),
      ),
      (querySnapshot) => {
        setLoading(true);
        if (!querySnapshot.empty) {
          const orderItems: OrderItem[] = querySnapshot.docs.map(
            (doc) => doc.data() as OrderItem,
          );
          setItems(orderItems);
          setTotalDiscount(null);
          setShippingPriceDiscount(null);
          setAppliedPromotionCodes([]);
          setIsEmpty(false);
        } else {
          setLoading(false);
          setInit();
        }
        setLoading(false);
      },
      (error) => {
        console.error(error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error!" }),
          description: `${error}`,
        });
        setLoading(false);
        setInit();
      },
    );

    return () => unsubscribe();
  }, [tenantContext, user, userLoading, toaster]);

  useEffect(() => {
    if (userLoading || !user) {
      setPreflightJobs([]);
      setPreflightIssues([]);
      return;
    }

    const preflightCollection = db.collection<CartPreflightJob>(
      firestore,
      tenantFirestorePaths.cartPreflightCollection(tenantContext, user.uid),
    );
    const preflightQuery = firestoreQuery(
      preflightCollection,
      tenant.where(tenantContext),
    );

    const unsubscribe = onSnapshot(
      preflightQuery,
      (querySnapshot) => {
        const cartItemIds = new Set((items ?? []).map((item) => item.id));
        const jobs = querySnapshot.docs.map((snapshot) => {
          const data = snapshot.data() as CartPreflightJob;

          return {
            ...data,
            id: snapshot.id,
          };
        });
        const activeJobs = jobs.filter((job) => cartItemIds.has(job.itemId));

        setPreflightJobs((currentJobs) => {
          const optimisticJobs = currentJobs.filter(
            (job) =>
              cartItemIds.has(job.itemId) &&
              !activeJobs.some((nextJob) => nextJob.id === job.id),
          );

          return [...optimisticJobs, ...activeJobs];
        });
        setPreflightIssues(
          activeJobs.flatMap((job) =>
            job.status === "completed" && job.issues ? job.issues : [],
          ),
        );
      },
      (error) => {
        console.error(error);
      },
    );

    return () => unsubscribe();
  }, [items, tenantContext, user, userLoading]);

  useEffect(() => {
    if (shippingPriceDiscount) {
      setShippingPrice(shippingPrice - shippingPriceDiscount.discountedAmount);
    } else {
      setShippingPrice(shippingPrice);
    }
  }, [shippingPriceDiscount]);

  useEffect(() => {
    let filteredAppliedPromotionCodes = appliedPromotionCodes;
    if (totalDiscount) {
      filteredAppliedPromotionCodes = appliedPromotionCodes.filter(
        (code) => code !== totalDiscount.code,
      );
    }
    if (shippingPriceDiscount) {
      filteredAppliedPromotionCodes = appliedPromotionCodes.filter(
        (code) => code !== shippingPriceDiscount.code,
      );
    }
    setAppliedPromotionCodes(filteredAppliedPromotionCodes);
    setShippingPriceDiscount(null);
    setTotalDiscount(null);
  }, [shippingOption]);

  useEffect(() => {
    if (totalDiscount) {
      toaster.create({
        title: t("common.warning", { defaultValue: "Warning!" }),
        description: t("cart.discountRemoved", {
          defaultValue: "Promotion code {{code}} has been removed",
          code: totalDiscount.code,
        }),
        type: "info",
      });
      setTotalDiscount(null);
      setAppliedPromotionCodes((prev) =>
        prev.filter((code) => code !== totalDiscount.code),
      );
    }
  }, [shippingPriceDiscount]);

  // Revalidate when path changes to cart or checkout
  useEffect(() => {
    if (!canRevalidate) return;
    if (pathname?.match(/^(\/cart|\/checkout)$/)) {
      revalidate();
    }
  }, [canRevalidate, revalidate, pathname]);

  // Revalidate every 10 minutes
  useEffect(() => {
    if (!canRevalidate) return;
    const handle = setInterval(
      async () => {
        await revalidate();
      },
      10 * 60 * 1000,
    );

    return () => clearInterval(handle);
  }, [canRevalidate, revalidate]);
  const add = async (
    orderItem: OrderItem,
    _user?: User,
  ): Promise<string | undefined> => {
    if (!isNull(items) && items.length >= 10) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: t("cart.full", {
          defaultValue: "Cart is full (max. 10 products)",
        }),
      });
      return;
    }
    try {
      if (isNull(user) && isUndefined(_user)) throw "No user provided";
      const analytics = (await import("@/lib/firebase/clientApp")).analytics;
      const uid = user?.uid || _user?.uid;
      if (!uid) throw "No user provided";
      const cartItemsRef = db.collection<OrderItem>(
        firestore,
        tenantFirestorePaths.cartItemsCollection(tenantContext, uid),
      );
      const cartItem = { ...orderItem, id: "" };
      const cartItemTenantContext = tenant.shouldScopeQueries(tenantContext)
        ? tenantContext
        : undefined;
      const createdCartItemId = await create(
        firestore,
        cartItem,
        undefined,
        cartItemsRef,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        cartItemTenantContext,
      );
      if (!createdCartItemId) {
        throw new Error("Cart item was not created.");
      }
      const createdCartItem = { ...cartItem, id: createdCartItemId };
      if (!isUndefined(analytics)) {
        logEvent(analytics, "add_to_cart", {
          currency: selectedCurrencyCode,
          value: Number(
            toMajorAmount(
              createdCartItem.totalPrice,
              createdCartItem.product?.defaultPrice?.currency,
            ).toFixed(2),
          ),
          items: [formatOrderItemAsAnalyticsItem(createdCartItem, 0)],
        });
      }
      toaster.success({
        title: t("common.success", { defaultValue: "Success!" }),
        description: t("cart.productAdded", {
          defaultValue: "Product has been added to cart",
        }),
      });
      return createdCartItemId;
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: t("cart.error.cantAddProduct", {
          defaultValue: "Cannot add product to cart",
        }),
      });
    }
  };

  const remove = async (
    orderItem: OrderItem,
    listResults: StorageReference[],
  ): Promise<void> => {
    try {
      if (isNull(user)) throw "isNull(user)";
      if (isNull(items)) throw "isNull(items)";
      const onFileDelete = (await import("@/lib/helpers")).onFileDelete;
      const analytics = (await import("@/lib/firebase/clientApp")).analytics;
      await deleteDoc(
        db.doc<OrderItem>(
          firestore,
          tenantFirestorePaths.cartItemsCollection(tenantContext, user.uid),
          orderItem.id,
        ),
      );
      if (!isUndefined(listResults) && listResults.length >= 1) {
        for (let i = 0; i < listResults.length; i++) {
          const listResult = listResults[i];
          await onFileDelete(listResult.fullPath);
        }
      }
      if (!isUndefined(analytics)) {
        logEvent(analytics, "remove_from_cart", {
          currency: selectedCurrencyCode,
          value: Number(
            toMajorAmount(
              orderItem.totalPrice,
              orderItem.product?.defaultPrice?.currency,
            ).toFixed(2),
          ),
          items: [formatOrderItemAsAnalyticsItem(orderItem, 0)],
        });
      }
      toaster.success({
        title: t("cart.itemRemoved", {
          defaultValue: "Item has been removed from cart.",
        }),
      });
      setPreflightIssues([]);
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: `${error}`,
      });
    }
  };

  const upload = async (
    index: number,
    itemId: string,
    files: File[],
    width?: number,
    height?: number,
  ) => {
    setPreflightIssues([]);
    try {
      if (isNull(user))
        throw t("auth.noAuthorization", { defaultValue: "No authorization" });
      const ref = (await import("firebase/storage")).ref;
      const uploadBytes = (await import("firebase/storage")).uploadBytes;
      const uploadBytesResumable = (await import("firebase/storage"))
        .uploadBytesResumable;
      await Promise.all(
        files.map(async (file) => {
          await assertStoreStorageQuota({
            requestedBytes: file.size,
            tenantId: tenantContext.tenantId,
          });

          return new Promise<void>((resolve, reject) => {
            const uploaderId = crypto.randomUUID();
            const buildUploader = (progress: number) => ({
              file,
              id: uploaderId,
              index,
              itemId,
              progress,
            });
            const storageRef = ref(
              storage,
              tenantStoragePaths.cartItemFile(
                tenantContext,
                user.uid,
                itemId,
                file.name,
              ),
            );
            const metadata = { contentType: file.type, size: file.size };
            const uploadTask = uploadBytesResumable(storageRef, file, metadata);
            setUploaders((currentUploaders) => [
              ...currentUploaders,
              buildUploader(0),
            ]);

            uploadTask.on(
              "state_changed",
              async (snapshot) => {
                const progress =
                  (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploaders((currentUploaders) => {
                  const nextUploader = buildUploader(progress);
                  const currentIndex = currentUploaders.findIndex(
                    (uploader) => uploader.id === uploaderId,
                  );

                  if (currentIndex === -1) {
                    return [...currentUploaders, nextUploader];
                  }

                  return currentUploaders.map((uploader) =>
                    uploader.id === uploaderId ? nextUploader : uploader,
                  );
                });
              },
              (error) => {
                setUploaders((currentUploaders) =>
                  currentUploaders.filter(
                    (uploader) => uploader.id !== uploaderId,
                  ),
                );
                console.error(error);
                toaster.error({
                  title: t("common.error", { defaultValue: "Error!" }),
                  description: `${error}`,
                });
                reject(error);
              },
              async () => {
                try {
                  await recordStoreStorageUsage({
                    requestedBytes: file.size,
                    tenantId: tenantContext.tenantId,
                  });
                  const { createCartThumbnail } =
                    await import("./cart-thumbnail");
                  const thumbnailFile = await createCartThumbnail(file);
                  if (thumbnailFile) {
                    await assertStoreStorageQuota({
                      requestedBytes: thumbnailFile.size,
                      tenantId: tenantContext.tenantId,
                    });
                    const thumbnailPath =
                      tenantStoragePaths.cartItemThumbnailFile(
                        tenantContext,
                        user.uid,
                        itemId,
                        thumbnailFile.name,
                      );
                    const thumbnailRef = ref(storage, thumbnailPath);
                    await uploadBytes(thumbnailRef, thumbnailFile, {
                      contentType: thumbnailFile.type,
                      cacheControl: "public,max-age=31536000,immutable",
                    });
                    await recordStoreStorageUsage({
                      requestedBytes: thumbnailFile.size,
                      tenantId: tenantContext.tenantId,
                    });
                  }

                  try {
                    const formData = new FormData();
                    const filePath = tenantStoragePaths.cartItemFolder(
                      tenantContext,
                      user.uid,
                      itemId,
                    );
                    const jobId = crypto.randomUUID();
                    formData.append("filename", file.name);
                    formData.append("file_path", filePath);
                    formData.append("user_id", user.uid);
                    formData.append("item_id", itemId);
                    formData.append("job_id", jobId);
                    formData.append("tenant_id", tenantContext.tenantId ?? "");
                    formData.append("width", width?.toString() || "0");
                    formData.append("height", height?.toString() || "0");
                    setPreflightJobs((currentJobs) => [
                      ...currentJobs.filter((job) => job.id !== jobId),
                      {
                        filename: file.name,
                        id: jobId,
                        itemId,
                        status: "pending",
                      },
                    ]);
                    const preflightStart = await preflightCheck(formData);

                    if ("error" in preflightStart) {
                      setPreflightJobs((currentJobs) =>
                        currentJobs.map((job) =>
                          job.id === jobId
                            ? {
                                ...job,
                                error: preflightStart.error,
                                status: "failed",
                              }
                            : job,
                        ),
                      );
                      throw new Error(preflightStart.error);
                    }

                    setPreflightJobs((currentJobs) =>
                      currentJobs.map((job) =>
                        job.id === jobId ? preflightStart.job : job,
                      ),
                    );
                  } catch (error) {
                    console.error("Preflight check failed:", error);
                  }

                  setUploaders((currentUploaders) =>
                    currentUploaders.filter(
                      (uploader) => uploader.id !== uploaderId,
                    ),
                  );
                  resolve();
                } catch (error) {
                  setUploaders((currentUploaders) =>
                    currentUploaders.filter(
                      (uploader) => uploader.id !== uploaderId,
                    ),
                  );
                  console.error(error);
                  toaster.error({
                    title: t("common.error", { defaultValue: "Error!" }),
                    description: `${error}`,
                  });
                  reject(error);
                }
              },
            );
          });
        }),
      );
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: `${error}`,
      });
    }
  };

  return (
    <CartContext.Provider
      value={{
        loading,
        isEmpty,
        items,
        setItemsWithDiscount,
        total,
        totalBeforeStoreCredit,
        totalDiscount,
        setTotalDiscount,
        subtotal,
        add,
        remove,
        upload,
        uploaders,
        shippingOption,
        shippingMethodsSettings: normalizeShippingMethodsSettings(
          shippingMethodsSettings,
        ),
        setShippingOption,
        availableShippingOptions,
        shippingPrice,
        shippingPriceDiscount,
        setShippingPriceDiscount,
        setShippingPrice,
        availablePaymentTypes,
        paymentType,
        paymentMethodsSettings: normalizePaymentMethodsSettings(
          paymentMethodsSettings,
        ),
        setPaymentType,
        revalidate,
        isValid,
        validationErrors,
        preflightJobs,
        preflightIssues,
        appliedPromotionCodes,
        setAppliedPromotionCodes,
        discountAmount,
        storeCreditAmount,
        setStoreCreditAmount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

const useCart = () => useContext(CartContext);

export { CartProvider, useCart };
