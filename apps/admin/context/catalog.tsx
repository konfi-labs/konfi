"use client";

import { revalidateTagCache } from "@/actions";
import { scheduleChangeLogAfterFormSubmit } from "@/actions/change-log";
import { syncProductSearchIndexAction } from "@/actions/product-search-index";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { createChangeSnapshot } from "@/lib/change-snapshot";
import { firestore } from "@/lib/firebase/clientApp";
import { init, removeDoc, search, show } from "@/lib/helpers";
import { db, getDoc, tenant, update, withTenantId } from "@konfi/firebase";
import {
  Category,
  Customer,
  EntityType,
  NestedCategory,
  Product,
  Supplier,
} from "@konfi/types";
import { isNull } from "es-toolkit";
import {
  arrayRemove,
  arrayUnion,
  DocumentSnapshot,
  endBefore,
  limitToLast,
  onSnapshot,
  orderBy,
  Query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth";
import { useChannels } from "./channels";

export interface ICatalog {
  loadingCatalog: boolean;
  loadingProducts: boolean;
  loadingProductsInput: boolean;
  loadingCategories: boolean;
  loadingCategoriesInput: boolean;
  productsPageIndex: number;
  setProductsPageIndex: Dispatch<SetStateAction<number>>;
  categoriesPageIndex: number;
  setCategoriesPageIndex: Dispatch<SetStateAction<number>>;
  products: Product[] | null;
  productsCount: number;
  showProducts: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  searchProducts: (searchKey: string) => Promise<Product[] | undefined>;
  searchProductsInput: (searchKey: string) => Promise<Product[] | undefined>;
  productsSearchResults: Product[] | null;
  productsInputSearchResults: Product[] | null;
  cleanProductsSearchResults: () => void;
  refreshProducts: () => void;
  dirtyRefreshProducts: boolean;
  removeProduct: (product: Product) => Promise<void>;
  updateProductCategory: (
    product: Product,
    category: NestedCategory,
  ) => Promise<boolean>;
  categories: Category[] | null;
  categoriesCount: number;
  showCategories: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  searchCategories: (searchKey: string) => Promise<Category[] | undefined>;
  searchCategoriesInput: (searchKey: string) => Promise<Category[] | undefined>;
  categorySearchResults: Category[] | null;
  categoryInputSearchResults: Category[] | null;
  cleanCategoriesSearchResults: () => void;
  refreshCategories: () => void;
  dirtyRefreshCategories: boolean;
  removeCategory: (documentId: string) => void;
  linkProductToChannel: (productId: string, channelId: string) => Promise<void>;
  unlinkProductFromChannel: (
    productId: string,
    channelId: string,
  ) => Promise<void>;
  linkProductToCustomer: (
    productId: string,
    customerId: string,
  ) => Promise<void>;
  linkProductToSupplier: (
    productId: string,
    supplierId: string,
  ) => Promise<void>;
  linkProductToWarehouse: (
    productId: string,
    warehouseId: string,
  ) => Promise<void>;
  unlinkProductFromWarehouse: (
    productId: string,
    warehouseId: string,
  ) => Promise<void>;
}

const CatalogContext = createContext<ICatalog>({
  loadingCatalog: true,
  loadingProducts: true,
  loadingProductsInput: true,
  loadingCategories: true,
  loadingCategoriesInput: true,
  productsPageIndex: 0,
  setProductsPageIndex: () => {},
  categoriesPageIndex: 0,
  setCategoriesPageIndex: () => {},
  products: null,
  productsCount: 0,
  showProducts: () => Promise.resolve(),
  searchProducts: () => Promise.resolve(undefined),
  searchProductsInput: () => Promise.resolve(undefined),
  productsSearchResults: null,
  productsInputSearchResults: null,
  cleanProductsSearchResults: () => null,
  refreshProducts: () => {},
  dirtyRefreshProducts: false,
  removeProduct: () => Promise.resolve(),
  updateProductCategory: () => Promise.resolve(false),
  categories: null,
  categoriesCount: 0,
  showCategories: () => Promise.resolve(),
  searchCategories: () => Promise.resolve(undefined),
  searchCategoriesInput: () => Promise.resolve(undefined),
  categorySearchResults: null,
  categoryInputSearchResults: null,
  cleanCategoriesSearchResults: () => null,
  refreshCategories: () => {},
  dirtyRefreshCategories: false,
  removeCategory: () => {},
  linkProductToChannel: () => Promise.resolve(),
  unlinkProductFromChannel: () => Promise.resolve(),
  linkProductToCustomer: () => Promise.resolve(),
  linkProductToSupplier: () => Promise.resolve(),
  linkProductToWarehouse: () => Promise.resolve(),
  unlinkProductFromWarehouse: () => Promise.resolve(),
});

const CatalogProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const { t } = useT();
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingProductsInput, setLoadingProductsInput] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingCategoriesInput, setLoadingCategoriesInput] = useState(true);
  const [productsPageIndex, setProductsPageIndex] = useState(0);
  const [categoriesPageIndex, setCategoriesPageIndex] = useState(0);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsCount, setProductsCount] = useState<number>(0);
  const [latestProduct, setLatestProduct] =
    useState<DocumentSnapshot<Product> | null>(null);
  const [productsSearchResults, setProductsSearchResults] = useState<
    Product[] | null
  >(null);
  const [productsInputSearchResults, setInputProductsSearchResults] = useState<
    Product[] | null
  >(null);
  const [dirtyRefreshProducts, setDirtyRefreshProducts] =
    useState<boolean>(false);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoriesCount, setCategoriesCount] = useState<number>(0);
  const [_, setLatestCategory] = useState<DocumentSnapshot<Category> | null>(
    null,
  );
  const [categorySearchResults, setCategoriesSearchResults] = useState<
    Category[] | null
  >(null);
  const [categoryInputSearchResults, setCategoriesInputSearchResults] =
    useState<Category[] | null>(null);
  const [dirtyRefreshCategories, setDirtyRefreshCategories] =
    useState<boolean>(false);
  const { channel } = useChannels();
  const { user } = useAuth();
  const tenantContext = useTenantContext();
  const productsInputSearchUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const pendingProductsInputSearchResolveRef = useRef<
    ((value: Product[]) => void) | null
  >(null);
  const categoryInputSearchUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const pendingCategoryInputSearchResolveRef = useRef<
    ((value: Category[]) => void) | null
  >(null);

  const clearProductsInputSearchSubscription = useCallback(() => {
    productsInputSearchUnsubscribeRef.current?.();
    productsInputSearchUnsubscribeRef.current = null;
    pendingProductsInputSearchResolveRef.current?.([]);
    pendingProductsInputSearchResolveRef.current = null;
  }, []);
  const clearCategoryInputSearchSubscription = useCallback(() => {
    categoryInputSearchUnsubscribeRef.current?.();
    categoryInputSearchUnsubscribeRef.current = null;
    pendingCategoryInputSearchResolveRef.current?.([]);
    pendingCategoryInputSearchResolveRef.current = null;
  }, []);

  useEffect(
    () => () => {
      clearProductsInputSearchSubscription();
    },
    [clearProductsInputSearchSubscription],
  );
  useEffect(
    () => () => {
      clearCategoryInputSearchSubscription();
    },
    [clearCategoryInputSearchSubscription],
  );

  useEffect(() => {
    if (
      !loadingProducts &&
      !loadingProductsInput &&
      !loadingCategories &&
      !loadingCategoriesInput
    )
      setLoadingCatalog(false);
    else setLoadingCatalog(true);
  }, [
    loadingProducts,
    loadingCategories,
    loadingProductsInput,
    loadingCategoriesInput,
  ]);

  useEffect(() => {
    if (isNull(channel) || !user) return;
    init(
      setLoadingProducts,
      "/channels/" + channel.id + "/products",
      10,
      setProducts,
      setLatestProduct,
      t("common.noProducts", { defaultValue: "No products" }),
      undefined,
      [where("active", "==", true)],
      setProductsCount,
      undefined,
      undefined,
      tenantContext,
    );
    setProductsPageIndex(0);
  }, [dirtyRefreshProducts, channel, tenantContext, user]);

  const showProducts = async (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ): Promise<void> => {
    return show(
      type,
      setLoadingProducts,
      "/channels/" + channel?.id + "/products",
      limit,
      type === "NEXT" ? latestProduct : undefined,
      setLatestProduct,
      setProducts,
      type === "PREVIOUS"
        ? [
            endBefore(products?.[0].createdAt),
            limitToLast(limit),
            where("active", "==", true),
          ]
        : type === "LAST"
          ? [
              orderBy("createdAt", "desc"),
              limitToLast(productsCount % limit || limit),
              where("active", "==", true),
            ]
          : type === "NEXT"
            ? [
                startAfter(products?.[products.length - 1].createdAt),
                where("active", "==", true),
              ]
            : [where("active", "==", true)],
      tenantContext,
    );
  };

  const searchProducts = async (searchKey: string) => {
    return await search(
      setLoadingProducts,
      "/channels/" + channel?.id + "/products",
      searchKey,
      setProductsSearchResults,
      [where("active", "==", true)],
      tenantContext,
    );
  };
  const searchProductsInput = async (searchKey: string) => {
    if (!searchKey) {
      clearProductsInputSearchSubscription();
      setInputProductsSearchResults(null);
      setLoadingProductsInput(false);
      return [];
    }

    setLoadingProductsInput(true);

    return await new Promise<Product[]>((resolve) => {
      clearProductsInputSearchSubscription();

      let didResolve = false;
      const resolveSearch = (value: Product[]) => {
        if (didResolve) {
          return;
        }

        didResolve = true;
        pendingProductsInputSearchResolveRef.current = null;
        resolve(value);
      };

      pendingProductsInputSearchResolveRef.current = resolveSearch;
      productsInputSearchUnsubscribeRef.current = onSnapshot(
        db.search<Product>(
          firestore,
          "/channels/" + channel?.id + "/products",
          searchKey,
          tenant.queryConstraints(tenantContext, [
            where("active", "==", true),
            where("availability.published", "==", true),
          ]),
        ),
        (snapshot) => {
          const nextProducts = snapshot.docs.map((doc) => doc.data());

          setInputProductsSearchResults(nextProducts);
          setLoadingProductsInput(false);
          resolveSearch(nextProducts);
        },
        (error) => {
          console.error("Error subscribing to product search results:", error);
          setInputProductsSearchResults([]);
          setLoadingProductsInput(false);
          resolveSearch([]);
        },
      );
    });
  };
  const cleanProductsSearchResults = () => setProductsSearchResults(null);
  const refreshProducts = () => setDirtyRefreshProducts(!dirtyRefreshProducts);
  const logSearchIndexSyncError = ({
    error,
    channelId,
    productId,
  }: {
    error: string;
    channelId: string;
    productId: string;
  }) => {
    console.error("[CatalogContext] Failed to sync product search index", {
      error,
      channelId,
      productId,
    });
  };
  const syncProductSearchIndex = async ({
    channelId,
    productId,
    previousLinkedChannelIds,
    deletedProductState,
    previousProductState,
  }: {
    channelId: string;
    productId: string;
    previousLinkedChannelIds?: readonly string[];
    deletedProductState?: {
      active?: boolean;
      published?: boolean;
      slug?: string;
      id?: string;
    };
    previousProductState?: {
      active?: boolean;
      published?: boolean;
      slug?: string;
      id?: string;
    };
  }) => {
    const searchIndexResult = await syncProductSearchIndexAction({
      channelId,
      productId,
      previousLinkedChannelIds,
      deletedProductState,
      previousProductState,
    });
    if (!searchIndexResult.ok) {
      logSearchIndexSyncError({
        error: searchIndexResult.error,
        channelId,
        productId,
      });
    }
  };
  const scheduleProductChangeLog = ({
    productId,
    before,
  }: {
    productId: Product["id"];
    before: unknown | null;
  }) => {
    if (!channel?.id) return;

    const beforeSnapshot = before ? createChangeSnapshot(before) : null;
    if (before && !beforeSnapshot) {
      console.error("[CatalogContext] Failed to serialize previous product", {
        channelId: channel.id,
        productId,
      });
      return;
    }

    void scheduleChangeLogAfterFormSubmit({
      entityType: EntityType.Product,
      entityId: productId,
      channelId: channel.id,
      before: beforeSnapshot,
    }).catch((error) => {
      console.error("[CatalogContext] Failed to schedule change log", {
        error,
        channelId: channel.id,
        productId,
      });
    });
  };
  const removeProduct = async (product: Product) => {
    try {
      await removeDoc(
        setLoadingProducts,
        "/channels/" + channel?.id + "/products",
        product.id,
        refreshProducts,
      );
      if (!channel?.id) return;

      scheduleProductChangeLog({
        productId: product.id,
        before: product,
      });

      // Product deletion is complete at this point; semantic index cleanup is
      // best-effort so catalog deletion is not blocked by embedding/index errors.
      await syncProductSearchIndex({
        channelId: channel.id,
        productId: product.id,
        previousLinkedChannelIds: product.linkedChannels ?? [],
        deletedProductState: {
          active: product.active,
          published: product.availability.published,
          slug: product.seo.slug,
          id: product.id,
        },
      });
    } catch (error) {
      console.error(error);
    }
  };

  const updateProductCategory = async (
    product: Product,
    category: NestedCategory,
  ): Promise<boolean> => {
    const targetChannelId = product.channelId || channel?.id;
    if (!targetChannelId) return false;

    try {
      const productRef = db.doc<Partial<Product>>(
        firestore,
        `/channels/${targetChannelId}/products`,
        product.id,
      );
      const previousProduct = await getDoc(productRef);
      if (!previousProduct) {
        throw new Error("Product not found");
      }

      const updatedBy = user
        ? {
            id: user.uid,
            name: user.displayName || user.email || user.uid,
          }
        : previousProduct.updatedBy;
      const categoryUpdate = {
        category,
        updatedAt: Timestamp.now(),
        ...(updatedBy ? { updatedBy } : {}),
      };

      await updateDoc(
        productRef,
        withTenantId(categoryUpdate, tenantContext, "product category update"),
      );

      setProducts(
        (currentProducts) =>
          currentProducts?.map((currentProduct) =>
            currentProduct.id === product.id
              ? {
                  ...currentProduct,
                  category,
                }
              : currentProduct,
          ) ?? currentProducts,
      );
      setProductsSearchResults(
        (currentProducts) =>
          currentProducts?.map((currentProduct) =>
            currentProduct.id === product.id
              ? {
                  ...currentProduct,
                  category,
                }
              : currentProduct,
          ) ?? currentProducts,
      );
      refreshProducts();

      scheduleProductChangeLog({
        productId: product.id,
        before: previousProduct,
      });
      await syncProductSearchIndex({
        channelId: targetChannelId,
        productId: product.id,
        previousLinkedChannelIds: previousProduct.linkedChannels ?? [],
        previousProductState: {
          active: previousProduct.active,
          published: previousProduct.availability?.published,
          slug: previousProduct.seo?.slug,
          id: previousProduct.id,
        },
      });

      try {
        await revalidateTagCache("products");
        await revalidateTagCache("categorizedCardProducts");
        await revalidateTagCache("productMetadata");
        await revalidateTagCache("featuredProducts");
        await revalidateTagCache("popularProducts");
        await revalidateTagCache(`storeProduct-${targetChannelId}`);
        await revalidateTagCache(
          `storeProduct-${targetChannelId}-${previousProduct.seo?.slug}`,
        );
        await revalidateTagCache(`storeProductMetadata-${targetChannelId}`);
        await revalidateTagCache(
          `storeProductMetadata-${targetChannelId}-${previousProduct.seo?.slug}`,
        );
      } catch (error) {
        console.error("Failed to revalidate product category cache:", error);
      }

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const linkProductToChannel = async (productId: string, channelId: string) => {
    try {
      const productRef = db.doc<Partial<Product>>(
        firestore,
        `/channels/${channel?.id}/products`,
        productId,
      );
      const product = await getDoc(productRef);
      if (!product) {
        throw new Error("Product not found");
      }

      if (product.linkedChannels?.includes(channelId)) {
        throw new Error("Product already linked to this channel");
      }

      if (!product.linkedChannels) {
        await update(
          {
            linkedChannels: [channelId],
          },
          productRef,
          tenantContext,
        );
      } else {
        await update(
          {
            linkedChannels: arrayUnion(channelId) as unknown as string[],
          },
          productRef,
          tenantContext,
        );
      }
      if (channel?.id) {
        scheduleProductChangeLog({
          productId,
          before: product,
        });
        await syncProductSearchIndex({
          channelId: channel.id,
          productId,
          previousLinkedChannelIds: product.linkedChannels ?? [],
          previousProductState: {
            active: product.active,
            published: product.availability?.published,
            slug: product.seo?.slug,
            id: product.id,
          },
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const unlinkProductFromChannel = async (
    productId: string,
    channelId: string,
  ) => {
    try {
      const productRef = db.doc<Partial<Product>>(
        firestore,
        `/channels/${channel?.id}/products`,
        productId,
      );
      const product = await getDoc(productRef);
      if (!product) {
        throw new Error("Product not found");
      }

      if (!product.linkedChannels?.includes(channelId)) {
        throw new Error("Product not linked to this channel");
      }

      await update(
        {
          linkedChannels: arrayRemove(channelId) as unknown as string[],
        },
        productRef,
        tenantContext,
      );
      if (channel?.id) {
        scheduleProductChangeLog({
          productId,
          before: product,
        });
        await syncProductSearchIndex({
          channelId: channel.id,
          productId,
          previousLinkedChannelIds: product.linkedChannels ?? [],
          previousProductState: {
            active: product.active,
            published: product.availability?.published,
            slug: product.seo?.slug,
            id: product.id,
          },
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  async function linkProductToCustomer(productId: string, customerId: string) {
    try {
      const customerRef = db.doc<Partial<Customer>>(
        firestore,
        `/customers`,
        customerId,
      );
      const customer = await getDoc(customerRef);
      if (!customer) {
        throw new Error("Customer not found");
      }

      if (customer.linkedProductsIds?.includes(productId)) {
        throw new Error("Product already linked to this customer");
      }

      if (!customer.linkedProductsIds) {
        await update(
          {
            linkedProductsIds: [productId],
          },
          customerRef,
          tenantContext,
        );
      } else {
        await update(
          {
            linkedProductsIds: arrayUnion(productId) as unknown as string[],
          },
          customerRef,
          tenantContext,
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function linkProductToSupplier(productId: string, supplierId: string) {
    try {
      const supplierRef = db.doc<Partial<Supplier>>(
        firestore,
        `/suppliers`,
        supplierId,
      );
      const supplier = await getDoc(supplierRef);
      if (!supplier) {
        throw new Error("Supplier not found");
      }

      if (supplier.linkedProductsIds?.includes(productId)) {
        throw new Error("Product already linked to this supplier");
      }

      if (!supplier.linkedProductsIds) {
        await update(
          {
            linkedProductsIds: [productId],
          },
          supplierRef,
          tenantContext,
        );
      } else {
        await update(
          {
            linkedProductsIds: arrayUnion(productId) as unknown as string[],
          },
          supplierRef,
          tenantContext,
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function linkProductToWarehouse(
    productId: string,
    warehouseId: string,
  ) {
    try {
      const productRef = db.doc<Partial<Product>>(
        firestore,
        `/channels/${channel?.id}/products`,
        productId,
      );
      const product = await getDoc(productRef);
      if (!product) {
        throw new Error("Product not found");
      }

      if (product.linkedWarehouses?.includes(warehouseId)) {
        throw new Error("Product already linked to this warehouse");
      }

      if (!product.linkedWarehouses) {
        await update(
          {
            linkedWarehouses: [warehouseId],
          },
          productRef,
          tenantContext,
        );
      } else {
        await update(
          {
            linkedWarehouses: arrayUnion(warehouseId) as unknown as string[],
          },
          productRef,
          tenantContext,
        );
      }
      scheduleProductChangeLog({
        productId,
        before: product,
      });
    } catch (error) {
      console.error(error);
    }
  }

  async function unlinkProductFromWarehouse(
    productId: string,
    warehouseId: string,
  ) {
    try {
      const productRef = db.doc<Partial<Product>>(
        firestore,
        `/channels/${channel?.id}/products`,
        productId,
      );
      const product = await getDoc(productRef);
      if (!product) {
        throw new Error("Product not found");
      }

      if (!product.linkedWarehouses?.includes(warehouseId)) {
        throw new Error("Product not linked to this warehouse");
      }

      await update(
        {
          linkedWarehouses: arrayRemove(warehouseId) as unknown as string[],
        },
        productRef,
        tenantContext,
      );
      scheduleProductChangeLog({
        productId,
        before: product,
      });
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    if (isNull(channel)) return;
    setCategoriesPageIndex(0);
    init(
      setLoadingCategories,
      "/channels/" + channel.id + "/categories",
      10,
      setCategories,
      setLatestCategory,
      "No categories",
      undefined,
      undefined,
      setCategoriesCount,
      undefined,
      undefined,
      tenantContext,
    );
  }, [dirtyRefreshCategories, channel, tenantContext]);

  const showCategories = async (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => {
    show<Category>(
      type,
      setLoadingCategories,
      "/channels/" + channel?.id + "/categories",
      limit,
      type === "NEXT" ? latestProduct : undefined,
      setLatestCategory,
      setCategories,
      type === "PREVIOUS"
        ? [endBefore(categories?.[0].createdAt), limitToLast(limit)]
        : type === "LAST"
          ? [
              orderBy("createdAt", "desc"),
              limitToLast(categoriesCount % limit || limit),
            ]
          : type === "NEXT"
            ? [startAfter(categories?.[categories.length - 1].createdAt)]
            : undefined,
      tenantContext,
    );
  };

  const searchCategories = async (searchKey: string) =>
    await search(
      setLoadingCatalog,
      "/channels/" + channel?.id + "/categories",
      searchKey,
      setCategoriesSearchResults,
      undefined,
      tenantContext,
    );
  const subscribeCategoryInputSearchResults = useCallback(
    (
      categoriesQuery: Query<Category>,
      mapSnapshot: (docs: QueryDocumentSnapshot<Category>[]) => Category[] = (
        docs,
      ) => docs.map((doc) => doc.data()),
    ) =>
      new Promise<Category[]>((resolve) => {
        clearCategoryInputSearchSubscription();

        let didResolve = false;
        const resolveSearch = (value: Category[]) => {
          if (didResolve) {
            return;
          }

          didResolve = true;
          pendingCategoryInputSearchResolveRef.current = null;
          resolve(value);
        };

        pendingCategoryInputSearchResolveRef.current = resolveSearch;
        categoryInputSearchUnsubscribeRef.current = onSnapshot(
          categoriesQuery,
          (snapshot) => {
            const nextCategories = mapSnapshot(snapshot.docs);

            setCategoriesInputSearchResults(nextCategories);
            setLoadingCategoriesInput(false);
            resolveSearch(nextCategories);
          },
          (error) => {
            console.error(
              "Error subscribing to category search results:",
              error,
            );
            setCategoriesInputSearchResults([]);
            setLoadingCategoriesInput(false);
            resolveSearch([]);
          },
        );
      }),
    [
      clearCategoryInputSearchSubscription,
      setCategoriesInputSearchResults,
      setLoadingCategoriesInput,
    ],
  );

  const searchCategoriesInput = async (searchKey: string) => {
    if (!searchKey) {
      clearCategoryInputSearchSubscription();
      setCategoriesInputSearchResults(null);
      setLoadingCategoriesInput(false);
      return [];
    }

    setLoadingCategoriesInput(true);

    return await subscribeCategoryInputSearchResults(
      db.search<Category>(
        firestore,
        "/channels/" + channel?.id + "/categories",
        searchKey,
        tenant.queryConstraints(tenantContext),
      ),
    );
  };
  const cleanCategoriesSearchResults = () => setCategoriesSearchResults(null);
  const refreshCategories = () =>
    setDirtyRefreshCategories(!dirtyRefreshCategories);
  const removeCategory = (documentId: string) =>
    removeDoc(
      setLoadingCategories,
      "/channels/" + channel?.id + "/categories",
      documentId,
      refreshCategories,
    );

  return (
    <CatalogContext.Provider
      value={{
        loadingCatalog,
        loadingProducts,
        loadingProductsInput,
        loadingCategories,
        loadingCategoriesInput,
        productsPageIndex,
        setProductsPageIndex,
        categoriesPageIndex,
        setCategoriesPageIndex,
        products,
        productsCount,
        showProducts,
        searchProducts,
        searchProductsInput,
        productsSearchResults,
        productsInputSearchResults,
        cleanProductsSearchResults,
        refreshProducts,
        dirtyRefreshProducts,
        removeProduct,
        updateProductCategory,
        categories,
        categoriesCount,
        showCategories,
        searchCategories,
        searchCategoriesInput,
        dirtyRefreshCategories,
        categorySearchResults,
        categoryInputSearchResults,
        cleanCategoriesSearchResults,
        refreshCategories,
        removeCategory,
        linkProductToChannel,
        unlinkProductFromChannel,
        linkProductToCustomer,
        linkProductToSupplier,
        linkProductToWarehouse,
        unlinkProductFromWarehouse,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
};

const useCatalog = () => useContext(CatalogContext);

export { CatalogProvider, useCatalog };
