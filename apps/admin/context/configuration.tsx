"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { deactivate, init, initDoc, removeDoc, show } from "@/lib/helpers";
import { db, get, OrderBy, tenant } from "@konfi/firebase";
import {
  Attribute,
  CurrencySettings,
  OrderRulePresetsSettings,
  Member,
  OrderWorkflowStatusesSettings,
  PaymentMethodsSettings,
  PrintingMethodsSettings,
  ProductionGroupingSettings,
  ProductType,
  SelectOption,
  Settings,
  ShippingMethodsSettings,
  SupportTaxonomySettings,
  UnitsProofingSettings,
  Warehouse,
} from "@konfi/types";
import {
  CURRENCIES_SETTINGS_DOC_ID,
  normalizeCurrencySettings,
} from "@konfi/utils/currencies";
import {
  ORDER_RULE_PRESETS_SETTINGS_DOC_ID,
  normalizeOrderRulePresetsSettings,
} from "@konfi/utils/order-rule-presets";
import {
  normalizeOrderWorkflowStatusesSettings,
  ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
} from "@konfi/utils/order-workflow-statuses";
import {
  normalizePaymentMethodsSettings,
  PAYMENT_METHODS_SETTINGS_DOC_ID,
} from "@konfi/utils/payment-methods";
import {
  normalizePrintingMethodsSettings,
  PRINTING_METHODS_SETTINGS_DOC_ID,
} from "@konfi/utils/printing-methods";
import {
  normalizeProductionGroupingSettings,
  PRODUCTION_GROUPING_SETTINGS_DOC_ID,
} from "@konfi/utils/production-grouping";
import {
  normalizeShippingMethodsSettings,
  SHIPPING_METHODS_SETTINGS_DOC_ID,
} from "@konfi/utils/shipping-methods";
import {
  normalizeSupportTaxonomySettings,
  SUPPORT_TAXONOMY_SETTINGS_DOC_ID,
} from "@konfi/utils/support-taxonomy";
import {
  normalizeUnitsProofingSettings,
  UNITS_PROOFING_SETTINGS_DOC_ID,
} from "@konfi/utils/units-proofing";
import { isNull, isUndefined } from "es-toolkit";
import {
  DocumentSnapshot,
  endBefore,
  limitToLast,
  onSnapshot,
  orderBy,
  startAfter,
  Unsubscribe,
  where,
} from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth";
import { useChannels } from "./channels";
import { attributeFromSnapshot } from "@/lib/configuration-attributes";
import { useTenantContext } from "./tenant";

interface IConfiguration {
  loadingConfiguration: boolean;
  loadingAttributes: boolean;
  loadingProductTypes: boolean;
  loadingMembers: boolean;
  loadingWarehouses: boolean;
  loadingShopSettings: boolean;
  productTypesPageIndex: number;
  setProductTypesPageIndex: Dispatch<SetStateAction<number>>;
  attributes: Attribute[] | null;
  refreshAttributes: () => void;
  removeAttribute: (documentId: string) => void;
  canRemoveAttribute: (
    id: Attribute["id"],
  ) => Promise<{ result: boolean; dependencies: string[] }>;
  productTypes: ProductType[] | null;
  productTypesCount: number;
  showProductTypes: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  searchProductTypes: (searchKey: string) => Promise<ProductType[] | undefined>;
  productTypesSearchResults: ProductType[] | null;
  cleanProductTypesResults: () => void;
  refreshProductTypes: () => void;
  dirtyRefreshProductTypes: boolean;
  removeProductType: (documentId: string) => void;
  canRemoveProductType: (
    id: ProductType["id"],
  ) => Promise<{ result: boolean; dependencies: string[] }>;
  orderProductTypesBy: (orderBy: OrderBy | undefined) => void;
  members: Member[] | null;
  filteredMembers: Member[] | null;
  refreshMembers: () => void;
  removeMember: (documentId: string) => void;
  warehouses: Warehouse[] | null;
  warehousesAsOptions: SelectOption[] | null;
  refreshWarehouses: () => void;
  removeWarehouse: (documentId: string) => void;
  storeSettings: Settings | null;
  currencySettings: CurrencySettings;
  printingMethodsSettings: PrintingMethodsSettings;
  shippingMethodsSettings: ShippingMethodsSettings;
  paymentMethodsSettings: PaymentMethodsSettings;
  orderWorkflowStatusesSettings: OrderWorkflowStatusesSettings;
  orderRulePresetsSettings: OrderRulePresetsSettings;
  productionGroupingSettings: ProductionGroupingSettings;
  supportTaxonomySettings: SupportTaxonomySettings;
  unitsProofingSettings: UnitsProofingSettings;
  refreshStoreSettings: () => void;
}

interface ConfigurationActivatedDomains {
  catalog: boolean;
  members: boolean;
  shopSettings: boolean;
  warehouses: boolean;
}

interface IConfigurationActivation {
  activatedDomains: ConfigurationActivatedDomains;
  activateAll: () => void;
  activateCatalog: () => void;
  activateMembers: () => void;
  activateShopSettings: () => void;
  activateWarehouses: () => void;
}

const ConfigurationContext = createContext<IConfiguration>({
  loadingConfiguration: true,
  loadingAttributes: true,
  loadingProductTypes: true,
  loadingMembers: true,
  loadingWarehouses: true,
  loadingShopSettings: true,
  productTypesPageIndex: 0,
  setProductTypesPageIndex: () => {},
  attributes: null,
  refreshAttributes: () => {},
  removeAttribute: () => {},
  canRemoveAttribute: () =>
    Promise.resolve({ result: false, dependencies: [] }),
  productTypes: null,
  productTypesCount: 0,
  showProductTypes: () => Promise.resolve(),
  searchProductTypes: () => Promise.resolve(undefined),
  productTypesSearchResults: null,
  cleanProductTypesResults: () => {},
  refreshProductTypes: () => null,
  dirtyRefreshProductTypes: false,
  removeProductType: () => {},
  canRemoveProductType: () =>
    Promise.resolve({ result: false, dependencies: [] }),
  orderProductTypesBy: () => {},
  members: null,
  filteredMembers: null,
  refreshMembers: () => {},
  removeMember: () => {},
  warehouses: null,
  warehousesAsOptions: null,
  refreshWarehouses: () => {},
  removeWarehouse: () => {},
  storeSettings: null,
  currencySettings: normalizeCurrencySettings(),
  printingMethodsSettings: normalizePrintingMethodsSettings(),
  shippingMethodsSettings: normalizeShippingMethodsSettings(),
  paymentMethodsSettings: normalizePaymentMethodsSettings(),
  orderWorkflowStatusesSettings: normalizeOrderWorkflowStatusesSettings(),
  orderRulePresetsSettings: normalizeOrderRulePresetsSettings(),
  productionGroupingSettings: normalizeProductionGroupingSettings(),
  supportTaxonomySettings: normalizeSupportTaxonomySettings(),
  unitsProofingSettings: normalizeUnitsProofingSettings(),
  refreshStoreSettings: () => {},
});

const defaultActivatedDomains: ConfigurationActivatedDomains = {
  catalog: false,
  members: false,
  shopSettings: false,
  warehouses: false,
};

const ConfigurationActivationContext = createContext<IConfigurationActivation>({
  activatedDomains: defaultActivatedDomains,
  activateAll: () => {},
  activateCatalog: () => {},
  activateMembers: () => {},
  activateShopSettings: () => {},
  activateWarehouses: () => {},
});

const ConfigurationProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const { t } = useT();
  const [loadingConfiguration, setLoadingConfiguration] = useState(false);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [loadingProductTypes, setLoadingProductTypes] = useState(false);
  const [loadingShopSettings, setLoadingShopSettings] = useState(false);
  const [productTypesPageIndex, setProductTypesPageIndex] = useState(0);
  const [attributes, setAttributes] = useState<Attribute[] | null>(null);
  const [dirtyRefreshAttributes, setDirtyRefreshAttributes] =
    useState<boolean>(false);
  const [productTypes, setProductTypes] = useState<ProductType[] | null>(null);
  const [productTypesCount, setProductTypesCount] = useState<number>(0);
  const [latestProductType, setLatestProductType] =
    useState<DocumentSnapshot<ProductType> | null>(null);
  const [productTypesSearchResults, setProductTypesSearchResults] = useState<
    ProductType[] | null
  >(null);
  const [dirtyRefreshProductTypes, setDirtyRefreshProductTypes] =
    useState<boolean>(false);
  const [_orderProductTypesBy, setOrderProductTypesBy] = useState<
    OrderBy | undefined
  >(undefined);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [dirtyRefreshMembers, setDirtyRefreshMembers] =
    useState<boolean>(false);
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [dirtyRefreshWarehouses, setDirtyRefreshWarehouses] =
    useState<boolean>(false);
  const [buyingStoreSettings, setBuyingStoreSettings] = useState<
    Settings["buying"] | null
  >(null);
  const [freeShippingStoreSettings, setFreeShippingStoreSettings] = useState<
    Settings["freeShipping"] | null
  >(null);
  const [underConstructionStoreSettings, setUnderConstructionStoreSettings] =
    useState<Settings["underConstruction"] | null>(null);
  const [checkoutStoreSettings, setCheckoutStoreSettings] =
    useState<NonNullable<Settings["checkout"]> | null>(null);
  const [
    shippingOptionsExpressStoreSettings,
    setShippingOptionsExpressStoreSettings,
  ] = useState<Settings["express"] | null>(null);
  const [
    shippingOptionsPricesStoreSettings,
    setShippingOptionsPricesStoreSettings,
  ] = useState<Settings["shippingOptionsPrices"] | null>(null);
  const [rawCurrencySettings, setRawCurrencySettings] =
    useState<CurrencySettings | null>(null);
  const [rawPrintingMethodsSettings, setRawPrintingMethodsSettings] =
    useState<PrintingMethodsSettings | null>(null);
  const [rawProductionGroupingSettings, setRawProductionGroupingSettings] =
    useState<ProductionGroupingSettings | null>(null);
  const [rawShippingMethodsSettings, setRawShippingMethodsSettings] =
    useState<ShippingMethodsSettings | null>(null);
  const [rawPaymentMethodsSettings, setRawPaymentMethodsSettings] =
    useState<PaymentMethodsSettings | null>(null);
  const [
    rawOrderWorkflowStatusesSettings,
    setRawOrderWorkflowStatusesSettings,
  ] = useState<OrderWorkflowStatusesSettings | null>(null);
  const [rawOrderRulePresetsSettings, setRawOrderRulePresetsSettings] =
    useState<OrderRulePresetsSettings | null>(null);
  const [rawSupportTaxonomySettings, setRawSupportTaxonomySettings] =
    useState<SupportTaxonomySettings | null>(null);
  const [rawUnitsProofingSettings, setRawUnitsProofingSettings] =
    useState<UnitsProofingSettings | null>(null);
  const [dirtyRefreshShopSettings, setDirtyRefreshShopSettings] =
    useState<boolean>(false);
  const { channel } = useChannels();
  const { user } = useAuth();
  const tenantContext = useTenantContext();
  const [activatedDomains, setActivatedDomains] =
    useState<ConfigurationActivatedDomains>(defaultActivatedDomains);
  const productTypesSearchUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const pendingProductTypesSearchResolveRef = useRef<
    ((value: ProductType[]) => void) | null
  >(null);

  const clearProductTypesSearchSubscription = useCallback(() => {
    productTypesSearchUnsubscribeRef.current?.();
    productTypesSearchUnsubscribeRef.current = null;
    pendingProductTypesSearchResolveRef.current?.([]);
    pendingProductTypesSearchResolveRef.current = null;
  }, []);

  const filteredMembers = useMemo(() => {
    if (!members || !channel) return members;

    return members.filter((member) => {
      // If member has no channelIds, they are visible for all channels
      if (!member.channelIds || member.channelIds.length === 0) {
        return true;
      }
      // If member has channelIds, check if current channel is included
      return member.channelIds.includes(channel.id);
    });
  }, [members, channel]);

  const warehousesAsOptions = useMemo(
    () =>
      !isNull(warehouses) && warehouses.length > 0
        ? warehouses.map(
            (warehouse) =>
              ({ label: warehouse.name, value: warehouse.id }) as SelectOption,
          )
        : null,
    [warehouses],
  );

  function productTypeFromSnapshot(
    snapshot: DocumentSnapshot<ProductType>,
  ): ProductType {
    const productType = snapshot.data();
    if (!productType) {
      throw new Error(`Product type ${snapshot.id} has no data.`);
    }

    return {
      ...productType,
      id: productType.id || snapshot.id,
    };
  }

  const activateAll = useCallback(() => {
    setActivatedDomains((current) =>
      current.catalog &&
      current.members &&
      current.shopSettings &&
      current.warehouses
        ? current
        : {
            catalog: true,
            members: true,
            shopSettings: true,
            warehouses: true,
          },
    );
  }, []);

  const activateCatalog = useCallback(() => {
    setActivatedDomains((current) =>
      current.catalog ? current : { ...current, catalog: true },
    );
  }, []);

  const activateMembers = useCallback(() => {
    setActivatedDomains((current) =>
      current.members ? current : { ...current, members: true },
    );
  }, []);

  const activateShopSettings = useCallback(() => {
    setActivatedDomains((current) =>
      current.shopSettings ? current : { ...current, shopSettings: true },
    );
  }, []);

  const activateWarehouses = useCallback(() => {
    setActivatedDomains((current) =>
      current.warehouses ? current : { ...current, warehouses: true },
    );
  }, []);

  const activationValue = useMemo(
    () => ({
      activatedDomains,
      activateAll,
      activateCatalog,
      activateMembers,
      activateShopSettings,
      activateWarehouses,
    }),
    [
      activatedDomains,
      activateAll,
      activateCatalog,
      activateMembers,
      activateShopSettings,
      activateWarehouses,
    ],
  );

  useEffect(() => {
    setLoadingConfiguration(
      (activatedDomains.catalog &&
        (loadingAttributes || loadingProductTypes)) ||
        (activatedDomains.members && loadingMembers) ||
        (activatedDomains.shopSettings && loadingShopSettings) ||
        (activatedDomains.warehouses && loadingWarehouses),
    );
  }, [
    activatedDomains.catalog,
    activatedDomains.members,
    activatedDomains.shopSettings,
    activatedDomains.warehouses,
    loadingAttributes,
    loadingMembers,
    loadingProductTypes,
    loadingShopSettings,
    loadingWarehouses,
  ]);

  useEffect(
    () => () => {
      clearProductTypesSearchSubscription();
    },
    [clearProductTypesSearchSubscription],
  );

  useEffect(() => {
    if (!activatedDomains.catalog || isNull(channel) || !user) return;
    setLoadingAttributes(true);

    const attributesQuery = db.query<Attribute>(
      firestore,
      "/attributes",
      99,
      undefined,
      tenant.queryConstraints(tenantContext, [where("active", "==", true)]),
    );
    const unsubscribe = onSnapshot(
      attributesQuery,
      (snapshot) => {
        const nextAttributes = snapshot.docs.map(attributeFromSnapshot);
        setAttributes(nextAttributes);
        setLoadingAttributes(false);
      },
      (error) => {
        console.error("Error subscribing to attributes:", error);
        setAttributes(null);
        setLoadingAttributes(false);
      },
    );

    return () => unsubscribe();
  }, [
    activatedDomains.catalog,
    channel,
    dirtyRefreshAttributes,
    tenantContext,
    user,
  ]);

  const refreshAttributes = useCallback(
    () => setDirtyRefreshAttributes((previous) => !previous),
    [],
  );
  const removeAttribute = useCallback(
    (documentId: string) =>
      deactivate<Attribute>(
        setLoadingAttributes,
        "/attributes",
        documentId,
        refreshAttributes,
        tenantContext,
      ),
    [refreshAttributes, tenantContext],
  );
  const canRemoveAttribute = useCallback(
    async (
      id: Attribute["id"],
    ): Promise<{ result: boolean; dependencies: string[] }> => {
      if (isNull(channel) || !id) return { result: false, dependencies: [] };
      const dependencies: string[] = [];
      try {
        const productTypeResults = await get(
          db.query(
            firestore,
            "/productTypes",
            5,
            undefined,
            tenant.queryConstraints(tenantContext, [
              where("attributes", "array-contains", id),
            ]),
          ),
        );
        if (productTypeResults?.[0] && productTypeResults[0].length > 0) {
          for (let i = 0; i < productTypeResults[0].length; i++) {
            const element = productTypeResults[0][i] as ProductType;
            dependencies.push(
              element.name +
                " [" +
                t("admin.configurationProductTypes", {
                  defaultValue: "Configuration -> Product Types",
                }) +
                "]",
            );
          }
        }
        const productResults = await get(
          db.query(
            firestore,
            "/channels/" + channel.id + "/products",
            5,
            undefined,
            tenant.queryConstraints(tenantContext, [
              where("attributes", "array-contains", id),
            ]),
          ),
        );
        if (productResults?.[0] && productResults[0].length > 0) {
          for (let i = 0; i < productResults[0].length; i++) {
            const element = productResults[0][i] as ProductType;
            dependencies.push(element.name + " [Katalog -> Produkty]");
          }
        }
      } catch (error) {
        console.error(error);
        return { result: false, dependencies };
      }
      if (dependencies && dependencies.length > 0) {
        return { result: false, dependencies };
      }
      return { result: true, dependencies: [] };
    },
    [channel, t, tenantContext],
  );

  useEffect(() => {
    if (!activatedDomains.catalog || isNull(channel) || !user) return;
    init(
      setLoadingProductTypes,
      "/productTypes",
      10,
      setProductTypes,
      setLatestProductType,
      t("admin.noProductTypes", { defaultValue: "No product types" }),
      undefined,
      [where("active", "==", true)],
      setProductTypesCount,
      undefined,
      undefined,
      tenantContext,
    );
    setProductTypesPageIndex(0);
  }, [
    activatedDomains.catalog,
    dirtyRefreshProductTypes,
    channel,
    tenantContext,
    user,
  ]);

  const orderProductTypesBy = useCallback((orderBy: OrderBy | undefined) => {
    if (isUndefined(orderBy)) {
      setOrderProductTypesBy(undefined);
      return;
    }
    setOrderProductTypesBy(orderBy);
  }, []);

  const showProductTypes = useCallback(
    async (type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST", limit: number) =>
      show(
        type,
        setLoadingProductTypes,
        "/productTypes",
        limit,
        type === "NEXT" ? latestProductType : undefined,
        setLatestProductType,
        setProductTypes,
        type === "PREVIOUS"
          ? [
              where("active", "==", true),
              endBefore(productTypes?.[0].createdAt),
              limitToLast(limit),
            ]
          : type === "LAST"
            ? [
                where("active", "==", true),
                orderBy("createdAt", "desc"),
                limitToLast(productTypesCount % limit || limit),
              ]
            : type === "NEXT"
              ? [
                  where("active", "==", true),
                  startAfter(productTypes?.[productTypes.length - 1].createdAt),
                ]
              : [where("active", "==", true)],
        tenantContext,
      ),
    [latestProductType, productTypes, productTypesCount, tenantContext],
  );

  const searchProductTypes = useCallback(
    async (searchKey: string) => {
      if (!searchKey) {
        clearProductTypesSearchSubscription();
        setProductTypesSearchResults(null);
        setLoadingProductTypes(false);
        return [];
      }

      setLoadingProductTypes(true);

      return await new Promise<ProductType[]>((resolve) => {
        clearProductTypesSearchSubscription();

        let didResolve = false;
        const resolveSearch = (value: ProductType[]) => {
          if (didResolve) {
            return;
          }

          didResolve = true;
          pendingProductTypesSearchResolveRef.current = null;
          resolve(value);
        };

        pendingProductTypesSearchResolveRef.current = resolveSearch;
        productTypesSearchUnsubscribeRef.current = onSnapshot(
          db.search<ProductType>(
            firestore,
            "/productTypes",
            searchKey,
            tenant.queryConstraints(tenantContext, [
              where("active", "==", true),
            ]),
          ),
          (snapshot) => {
            const nextProductTypes = snapshot.docs.map(productTypeFromSnapshot);

            setProductTypesSearchResults(nextProductTypes);
            setLoadingProductTypes(false);
            resolveSearch(nextProductTypes);
          },
          (error) => {
            console.error(
              "Error subscribing to product type search results:",
              error,
            );
            setProductTypesSearchResults([]);
            setLoadingProductTypes(false);
            resolveSearch([]);
          },
        );
      });
    },
    [clearProductTypesSearchSubscription, tenantContext],
  );
  const cleanProductTypesResults = useCallback(
    () => setProductTypesSearchResults(null),
    [],
  );
  const refreshProductTypes = useCallback(
    () => setDirtyRefreshProductTypes((previous) => !previous),
    [],
  );
  const removeProductType = useCallback(
    (documentId: string) =>
      deactivate<ProductType>(
        setLoadingProductTypes,
        "/productTypes",
        documentId,
        refreshProductTypes,
        tenantContext,
      ),
    [refreshProductTypes, tenantContext],
  );
  const canRemoveProductType = useCallback(
    async (
      id: ProductType["id"],
    ): Promise<{ result: boolean; dependencies: string[] }> => {
      if (isNull(channel) || !id) return { result: false, dependencies: [] };
      const dependencies: string[] = [];
      try {
        const prouductResults = await get(
          db.query(
            firestore,
            "/channels/" + channel.id + "/products",
            5,
            undefined,
            tenant.queryConstraints(tenantContext, [
              where("productType.id", "==", id),
            ]),
          ),
        );
        if (prouductResults?.[0] && prouductResults[0].length > 0) {
          for (let i = 0; i < prouductResults[0].length; i++) {
            const element = prouductResults[0][i] as ProductType;
            dependencies.push(element.name + " [Katalog -> Produkty]");
          }
        }
      } catch (error) {
        console.error(error);
        return { result: false, dependencies };
      }
      if (dependencies && dependencies.length > 0) {
        return { result: false, dependencies };
      }

      return { result: true, dependencies: [] };
    },
    [channel, tenantContext],
  );

  useEffect(() => {
    if (!activatedDomains.members || !user) return;
    init(
      setLoadingMembers,
      "members",
      99,
      setMembers,
      undefined,
      t("admin.noTeamMembers", { defaultValue: "No team members" }),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
  }, [activatedDomains.members, dirtyRefreshMembers, tenantContext, user]);
  const refreshMembers = useCallback(
    () => setDirtyRefreshMembers((previous) => !previous),
    [],
  );
  const removeMember = useCallback(
    (documentId: string) =>
      removeDoc(setLoadingMembers, "members", documentId, refreshMembers),
    [refreshMembers],
  );

  useEffect(() => {
    if (!activatedDomains.warehouses || !user) return;
    init(
      setLoadingWarehouses,
      "warehouses",
      99,
      setWarehouses,
      undefined,
      t("admin.noWarehouses", { defaultValue: "No warehouses" }),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
  }, [
    activatedDomains.warehouses,
    dirtyRefreshWarehouses,
    tenantContext,
    user,
  ]);
  const refreshWarehouses = useCallback(
    () => setDirtyRefreshWarehouses((previous) => !previous),
    [],
  );
  const removeWarehouse = useCallback(
    (documentId: string) =>
      removeDoc(
        setLoadingWarehouses,
        "warehouses",
        documentId,
        refreshWarehouses,
      ),
    [refreshWarehouses],
  );

  useEffect(() => {
    if (!activatedDomains.shopSettings || isNull(channel) || !user) return;
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      "buying",
      setBuyingStoreSettings,
      t("admin.noBuyingSettings", { defaultValue: "No store buying settings" }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      "freeShipping",
      setFreeShippingStoreSettings,
      t("admin.noFreeShippingSettings", {
        defaultValue: "No store free shipping settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      "underConstruction",
      setUnderConstructionStoreSettings,
      t("admin.noConstructionSettings", {
        defaultValue: "No store construction mode settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      "checkout",
      setCheckoutStoreSettings,
      t("admin.noCheckoutSettings", {
        defaultValue: "No store checkout settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      "express",
      setShippingOptionsExpressStoreSettings,
      t("admin.noShippingExpressSettings", {
        defaultValue: "No store express settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      "shippingOptionsPrices",
      setShippingOptionsPricesStoreSettings,
      t("admin.noShippingPricesSettings", {
        defaultValue: "No store shipping costs settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      CURRENCIES_SETTINGS_DOC_ID,
      setRawCurrencySettings,
      t("admin.noCurrencySettings", {
        defaultValue: "No currency settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      PRINTING_METHODS_SETTINGS_DOC_ID,
      setRawPrintingMethodsSettings,
      t("admin.noPrintingMethodsSettings", {
        defaultValue: "No printing methods settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      PRODUCTION_GROUPING_SETTINGS_DOC_ID,
      setRawProductionGroupingSettings,
      t("admin.noProductionGroupingSettings", {
        defaultValue: "No production grouping settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      SHIPPING_METHODS_SETTINGS_DOC_ID,
      setRawShippingMethodsSettings,
      t("admin.noShippingMethodsSettings", {
        defaultValue: "No shipping methods settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      PAYMENT_METHODS_SETTINGS_DOC_ID,
      setRawPaymentMethodsSettings,
      t("admin.noPaymentMethodsSettings", {
        defaultValue: "No payment methods settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
      setRawOrderWorkflowStatusesSettings,
      t("admin.noOrderWorkflowStatusesSettings", {
        defaultValue: "No order workflow statuses settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      ORDER_RULE_PRESETS_SETTINGS_DOC_ID,
      setRawOrderRulePresetsSettings,
      t("admin.noOrderRulePresetsSettings", {
        defaultValue: "No order rule presets settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      SUPPORT_TAXONOMY_SETTINGS_DOC_ID,
      setRawSupportTaxonomySettings,
      t("admin.noSupportTaxonomySettings", {
        defaultValue: "No support taxonomy settings",
      }),
    );
    initDoc(
      setLoadingShopSettings,
      "/channels/" + channel.id + "/settings",
      UNITS_PROOFING_SETTINGS_DOC_ID,
      setRawUnitsProofingSettings,
      t("admin.noUnitsProofingSettings", {
        defaultValue: "No units and proofing settings",
      }),
    );
  }, [activatedDomains.shopSettings, dirtyRefreshShopSettings, channel, user]);
  const refreshStoreSettings = useCallback(
    () => setDirtyRefreshShopSettings((previous) => !previous),
    [],
  );

  const storeSettings = useMemo<Settings | null>(() => {
    if (!activatedDomains.shopSettings || isNull(channel) || !user) {
      return null;
    }

    return {
      buying: buyingStoreSettings ?? {
        enabled: false,
        max: 500000,
        min: 5000,
      },
      freeShipping: freeShippingStoreSettings ?? {
        enabled: false,
        min: 500000,
      },
      underConstruction: underConstructionStoreSettings ?? {
        enabled: false,
        message: "",
      },
      checkout: checkoutStoreSettings ?? {
        invoiceEnabled: true,
        stockPolicy: "allow",
      },
      express: shippingOptionsExpressStoreSettings ?? {
        enabled: false,
        percent: 20,
      },
      shippingOptionsPrices: shippingOptionsPricesStoreSettings ?? {
        COMPANY_COURIER: 4000,
        CUSTOM: 0,
        DHL: 3000,
        DPD: 3000,
        FEDEX: 3000,
        INPOST: 3000,
        PACZKOMATY_INPOST: 1500,
        PERSONAL_COLLECTION: 0,
      },
    };
  }, [
    activatedDomains.shopSettings,
    buyingStoreSettings,
    channel,
    checkoutStoreSettings,
    freeShippingStoreSettings,
    shippingOptionsExpressStoreSettings,
    shippingOptionsPricesStoreSettings,
    underConstructionStoreSettings,
    user,
  ]);

  const currencySettings = useMemo(
    () => normalizeCurrencySettings(rawCurrencySettings),
    [rawCurrencySettings],
  );

  const printingMethodsSettings = useMemo(
    () => normalizePrintingMethodsSettings(rawPrintingMethodsSettings),
    [rawPrintingMethodsSettings],
  );

  const productionGroupingSettings = useMemo(
    () => normalizeProductionGroupingSettings(rawProductionGroupingSettings),
    [rawProductionGroupingSettings],
  );

  const shippingMethodsSettings = useMemo(
    () => normalizeShippingMethodsSettings(rawShippingMethodsSettings),
    [rawShippingMethodsSettings],
  );

  const paymentMethodsSettings = useMemo(
    () => normalizePaymentMethodsSettings(rawPaymentMethodsSettings),
    [rawPaymentMethodsSettings],
  );

  const orderWorkflowStatusesSettings = useMemo(
    () =>
      normalizeOrderWorkflowStatusesSettings(rawOrderWorkflowStatusesSettings),
    [rawOrderWorkflowStatusesSettings],
  );

  const orderRulePresetsSettings = useMemo(
    () =>
      normalizeOrderRulePresetsSettings(
        rawOrderRulePresetsSettings,
        orderWorkflowStatusesSettings,
        printingMethodsSettings,
      ),
    [
      orderWorkflowStatusesSettings,
      printingMethodsSettings,
      rawOrderRulePresetsSettings,
    ],
  );

  const supportTaxonomySettings = useMemo(
    () => normalizeSupportTaxonomySettings(rawSupportTaxonomySettings),
    [rawSupportTaxonomySettings],
  );

  const unitsProofingSettings = useMemo(
    () => normalizeUnitsProofingSettings(rawUnitsProofingSettings),
    [rawUnitsProofingSettings],
  );

  const value = useMemo(
    () => ({
      loadingConfiguration,
      loadingAttributes,
      loadingMembers,
      loadingWarehouses,
      loadingProductTypes,
      loadingShopSettings,
      productTypesPageIndex,
      setProductTypesPageIndex,
      attributes,
      refreshAttributes,
      removeAttribute,
      canRemoveAttribute,
      productTypes,
      productTypesCount,
      showProductTypes,
      searchProductTypes,
      productTypesSearchResults,
      cleanProductTypesResults,
      refreshProductTypes,
      dirtyRefreshProductTypes,
      removeProductType,
      canRemoveProductType,
      orderProductTypesBy,
      members,
      filteredMembers,
      refreshMembers,
      removeMember,
      warehouses,
      warehousesAsOptions,
      refreshWarehouses,
      removeWarehouse,
      storeSettings,
      currencySettings,
      printingMethodsSettings,
      shippingMethodsSettings,
      paymentMethodsSettings,
      orderWorkflowStatusesSettings,
      orderRulePresetsSettings,
      productionGroupingSettings,
      supportTaxonomySettings,
      unitsProofingSettings,
      refreshStoreSettings,
    }),
    [
      loadingConfiguration,
      loadingAttributes,
      loadingMembers,
      loadingWarehouses,
      loadingProductTypes,
      loadingShopSettings,
      productTypesPageIndex,
      attributes,
      refreshAttributes,
      removeAttribute,
      canRemoveAttribute,
      productTypes,
      productTypesCount,
      showProductTypes,
      searchProductTypes,
      productTypesSearchResults,
      cleanProductTypesResults,
      refreshProductTypes,
      dirtyRefreshProductTypes,
      removeProductType,
      canRemoveProductType,
      orderProductTypesBy,
      members,
      filteredMembers,
      refreshMembers,
      removeMember,
      warehouses,
      warehousesAsOptions,
      refreshWarehouses,
      removeWarehouse,
      storeSettings,
      currencySettings,
      printingMethodsSettings,
      shippingMethodsSettings,
      paymentMethodsSettings,
      orderWorkflowStatusesSettings,
      orderRulePresetsSettings,
      productionGroupingSettings,
      supportTaxonomySettings,
      unitsProofingSettings,
      refreshStoreSettings,
    ],
  );

  return (
    <ConfigurationActivationContext.Provider value={activationValue}>
      <ConfigurationContext.Provider value={value}>
        {children}
      </ConfigurationContext.Provider>
    </ConfigurationActivationContext.Provider>
  );
};

const useConfiguration = () => {
  const context = useContext(ConfigurationContext);
  const { activateAll, activatedDomains } = useContext(
    ConfigurationActivationContext,
  );

  useEffect(() => {
    activateAll();
  }, [activateAll]);

  const allActivated =
    activatedDomains.catalog &&
    activatedDomains.members &&
    activatedDomains.shopSettings &&
    activatedDomains.warehouses;

  return useMemo(
    () => ({
      ...context,
      loadingAttributes: allActivated ? context.loadingAttributes : true,
      loadingConfiguration: allActivated ? context.loadingConfiguration : true,
      loadingMembers: allActivated ? context.loadingMembers : true,
      loadingProductTypes: allActivated ? context.loadingProductTypes : true,
      loadingShopSettings: allActivated ? context.loadingShopSettings : true,
      loadingWarehouses: allActivated ? context.loadingWarehouses : true,
    }),
    [allActivated, context],
  );
};

const useConfigurationMembers = () => {
  const context = useContext(ConfigurationContext);
  const { activateMembers, activatedDomains } = useContext(
    ConfigurationActivationContext,
  );

  useEffect(() => {
    activateMembers();
  }, [activateMembers]);

  return useMemo(
    () => ({
      filteredMembers: context.filteredMembers,
      loadingMembers: activatedDomains.members ? context.loadingMembers : true,
      members: context.members,
      refreshMembers: context.refreshMembers,
      removeMember: context.removeMember,
    }),
    [
      activatedDomains.members,
      context.filteredMembers,
      context.loadingMembers,
      context.members,
      context.refreshMembers,
      context.removeMember,
    ],
  );
};

const useConfigurationWarehouses = () => {
  const context = useContext(ConfigurationContext);
  const { activateWarehouses, activatedDomains } = useContext(
    ConfigurationActivationContext,
  );

  useEffect(() => {
    activateWarehouses();
  }, [activateWarehouses]);

  return useMemo(
    () => ({
      loadingWarehouses: activatedDomains.warehouses
        ? context.loadingWarehouses
        : true,
      refreshWarehouses: context.refreshWarehouses,
      removeWarehouse: context.removeWarehouse,
      warehouses: context.warehouses,
      warehousesAsOptions: context.warehousesAsOptions,
    }),
    [
      activatedDomains.warehouses,
      context.loadingWarehouses,
      context.refreshWarehouses,
      context.removeWarehouse,
      context.warehouses,
      context.warehousesAsOptions,
    ],
  );
};

const useConfigurationSettings = () => {
  const context = useContext(ConfigurationContext);
  const { activateShopSettings, activatedDomains } = useContext(
    ConfigurationActivationContext,
  );

  useEffect(() => {
    activateShopSettings();
  }, [activateShopSettings]);

  return useMemo(
    () => ({
      currencySettings: context.currencySettings,
      loadingShopSettings: activatedDomains.shopSettings
        ? context.loadingShopSettings
        : true,
      orderRulePresetsSettings: context.orderRulePresetsSettings,
      orderWorkflowStatusesSettings: context.orderWorkflowStatusesSettings,
      paymentMethodsSettings: context.paymentMethodsSettings,
      printingMethodsSettings: context.printingMethodsSettings,
      productionGroupingSettings: context.productionGroupingSettings,
      refreshStoreSettings: context.refreshStoreSettings,
      shippingMethodsSettings: context.shippingMethodsSettings,
      storeSettings: context.storeSettings,
      supportTaxonomySettings: context.supportTaxonomySettings,
      unitsProofingSettings: context.unitsProofingSettings,
    }),
    [
      activatedDomains.shopSettings,
      context.currencySettings,
      context.loadingShopSettings,
      context.orderRulePresetsSettings,
      context.orderWorkflowStatusesSettings,
      context.paymentMethodsSettings,
      context.printingMethodsSettings,
      context.productionGroupingSettings,
      context.refreshStoreSettings,
      context.shippingMethodsSettings,
      context.storeSettings,
      context.supportTaxonomySettings,
      context.unitsProofingSettings,
    ],
  );
};

const useConfigurationCatalog = () => {
  const context = useContext(ConfigurationContext);
  const { activateCatalog, activatedDomains } = useContext(
    ConfigurationActivationContext,
  );

  useEffect(() => {
    activateCatalog();
  }, [activateCatalog]);

  return useMemo(
    () => ({
      attributes: context.attributes,
      canRemoveAttribute: context.canRemoveAttribute,
      canRemoveProductType: context.canRemoveProductType,
      cleanProductTypesResults: context.cleanProductTypesResults,
      dirtyRefreshProductTypes: context.dirtyRefreshProductTypes,
      loadingAttributes: activatedDomains.catalog
        ? context.loadingAttributes
        : true,
      loadingProductTypes: activatedDomains.catalog
        ? context.loadingProductTypes
        : true,
      orderProductTypesBy: context.orderProductTypesBy,
      productTypes: context.productTypes,
      productTypesCount: context.productTypesCount,
      productTypesPageIndex: context.productTypesPageIndex,
      productTypesSearchResults: context.productTypesSearchResults,
      refreshAttributes: context.refreshAttributes,
      refreshProductTypes: context.refreshProductTypes,
      removeAttribute: context.removeAttribute,
      removeProductType: context.removeProductType,
      searchProductTypes: context.searchProductTypes,
      setProductTypesPageIndex: context.setProductTypesPageIndex,
      showProductTypes: context.showProductTypes,
    }),
    [
      activatedDomains.catalog,
      context.attributes,
      context.canRemoveAttribute,
      context.canRemoveProductType,
      context.cleanProductTypesResults,
      context.dirtyRefreshProductTypes,
      context.loadingAttributes,
      context.loadingProductTypes,
      context.orderProductTypesBy,
      context.productTypes,
      context.productTypesCount,
      context.productTypesPageIndex,
      context.productTypesSearchResults,
      context.refreshAttributes,
      context.refreshProductTypes,
      context.removeAttribute,
      context.removeProductType,
      context.searchProductTypes,
      context.setProductTypesPageIndex,
      context.showProductTypes,
    ],
  );
};

export {
  ConfigurationProvider,
  useConfiguration,
  useConfigurationCatalog,
  useConfigurationMembers,
  useConfigurationSettings,
  useConfigurationWarehouses,
};
