"use client";

import { meilisearchSearch } from "@/actions";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  getFuzzyCustomerSearchSeed,
  rankCustomersByFuzzySearch,
} from "@/lib/customers/customer-search";
import { firestore } from "@/lib/firebase/clientApp";
import { deactivate, init, search, show } from "@/lib/helpers";
import { db, get, getDoc, tenant, update } from "@konfi/firebase";
import { Customer } from "@konfi/types";
import {
  arrayRemove,
  arrayUnion,
  DocumentSnapshot,
  endBefore,
  onSnapshot,
  limitToLast,
  orderBy,
  Query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  Unsubscribe,
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

interface ICustomers {
  loadingCustomers: boolean;
  pageIndex: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  customers: Customer[] | null;
  customersCount: number;
  customersSearchResults: Customer[] | null;
  customersInputSearchResults: Customer[] | null;
  cleanCustomersSearchResults: () => void;
  showCustomers: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  searchCustomers: (
    searchKey: string,
    vector?: boolean,
  ) => Promise<Customer[] | undefined>;
  searchCustomersInput: (searchKey: string) => Promise<Customer[] | undefined>;
  refreshCustomers: () => void;
  dirtyRefreshCustomers: boolean;
  deactivateCustomer: (documentId: string) => void;
  unlinkProductFromCustomer: (
    productId: string,
    customerId: string,
  ) => Promise<void>;
  linkCustomerToCustomerGroup: (
    customerId: string,
    customerGroupId: string,
  ) => Promise<void>;
  unlinkCustomerFromCustomerGroup: (
    customerId: string,
    customerGroupId: string,
  ) => Promise<void>;
}

const CustomersContext = createContext<ICustomers>({
  loadingCustomers: true,
  pageIndex: 0,
  setPageIndex: () => {},
  customers: null,
  customersCount: 0,
  customersSearchResults: null,
  customersInputSearchResults: null,
  cleanCustomersSearchResults: () => null,
  showCustomers: () => Promise.resolve(),
  searchCustomers: () => Promise.resolve(undefined),
  searchCustomersInput: () => Promise.resolve(undefined),
  refreshCustomers: () => {},
  dirtyRefreshCustomers: false,
  deactivateCustomer: () => {},
  unlinkProductFromCustomer: () => Promise.resolve(),
  linkCustomerToCustomerGroup: () => Promise.resolve(),
  unlinkCustomerFromCustomerGroup: () => Promise.resolve(),
});

const filterActiveCustomers = (items: Customer[] | null): Customer[] | null => {
  if (items === null) return null;
  return items.filter((customer) => customer.active !== false);
};

const CustomersProvider = ({ children }: React.PropsWithChildren) => {
  const { t } = useT();
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [, setLoadingCustomersInput] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [customersCount, setCustomersCount] = useState<number>(0);
  const [latestCustomer, setLatestCustomer] =
    useState<DocumentSnapshot<Customer> | null>(null);
  const [customersSearchResults, setCustomersSearchResults] = useState<
    Customer[] | null
  >(null);
  const [customersInputSearchResults, setCustomersInputSearchResults] =
    useState<Customer[] | null>(null);
  const [dirtyRefreshCustomers, setDirtyRefreshCustomers] =
    useState<boolean>(false);
  const { user } = useAuth();
  const tenantContext = useTenantContext();
  const customersInputSearchUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const pendingCustomersInputSearchResolveRef = useRef<
    ((value: Customer[]) => void) | null
  >(null);
  const createFilteredSetter = (
    setter: Dispatch<SetStateAction<Customer[] | null>>,
  ): Dispatch<SetStateAction<Customer[] | null>> => {
    return (value) => {
      if (typeof value === "function") {
        setter((previous) => {
          const next = (
            value as (prev: Customer[] | null) => Customer[] | null
          )(previous);
          return filterActiveCustomers(next);
        });
        return;
      }
      setter(filterActiveCustomers(value));
    };
  };
  const setFilteredCustomersSearchResults = createFilteredSetter(
    setCustomersSearchResults,
  );
  const setFilteredCustomersInputSearchResults = createFilteredSetter(
    setCustomersInputSearchResults,
  );
  const getFuzzyCustomerSearchResults = useCallback(
    async (searchKey: string, limit = 99): Promise<Customer[]> => {
      const seed = getFuzzyCustomerSearchSeed(searchKey);

      if (!seed) {
        return [];
      }

      const results = await get<Customer>(
        db.search<Customer>(
          firestore,
          "customers",
          seed,
          tenant.queryConstraints(tenantContext),
        ),
      );
      const candidates = results?.[0] ?? [];

      return rankCustomersByFuzzySearch(candidates, searchKey, limit);
    },
    [tenantContext],
  );
  const clearCustomersInputSearchSubscription = useCallback(() => {
    customersInputSearchUnsubscribeRef.current?.();
    customersInputSearchUnsubscribeRef.current = null;
    pendingCustomersInputSearchResolveRef.current?.([]);
    pendingCustomersInputSearchResolveRef.current = null;
  }, []);

  useEffect(
    () => () => {
      clearCustomersInputSearchSubscription();
    },
    [clearCustomersInputSearchSubscription],
  );

  useEffect(() => {
    if (!user) return;
    init(
      setLoadingCustomers,
      "customers",
      10,
      setCustomers,
      setLatestCustomer,
      t("common.noCustomers", { defaultValue: "No customers" }),
      undefined,
      [where("active", "==", true)],
      setCustomersCount,
      undefined,
      undefined,
      tenantContext,
    );
    setPageIndex(0);
  }, [dirtyRefreshCustomers, t, tenantContext, user]);

  const showCustomers = async (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ): Promise<void> =>
    show(
      type,
      setLoadingCustomers,
      "/customers",
      limit,
      type === "NEXT" ? latestCustomer : undefined,
      setLatestCustomer,
      setCustomers,
      type === "PREVIOUS"
        ? [endBefore(customers?.[0].createdAt), limitToLast(limit)]
        : type === "LAST"
          ? [
              orderBy("createdAt", "desc"),
              limitToLast(customersCount % limit || limit),
            ]
          : type === "NEXT"
            ? [startAfter(customers?.[customers.length - 1].createdAt)]
            : undefined,
      tenantContext,
    );

  const searchCustomers = async (searchKey: string, _vector?: boolean) => {
    // Vector search disabled - too slow
    /* if (vector && searchKey.length > 3) {
      setLoadingCustomers(true);
      const vectorSearchResult = await vectorSearch(SearchType.CUSTOMERS, "undefined", searchKey) as Customer["id"][];
      if (vectorSearchResult.length > 0) {
        const customersQuery = db.query<Customer>(firestore, "customers", 5, undefined, [where("id", "in", vectorSearchResult)]);
        const customers = (await getDocs(customersQuery)).docs.map((doc) => doc.data());
        const activeCustomers = customers.filter((customer) => customer.active !== false);
        if (activeCustomers.length === 0) {
          setLoadingCustomers(false);
          toaster.create({
            title: t("common.noResults", { defaultValue: "No results" }),
            description: t("common.noCustomersMatchingQuery", { defaultValue: "No customers found matching the query: " }) + searchKey,
            type: "info",
          });
        } else {
          setFilteredCustomersSearchResults(activeCustomers);
          setLoadingCustomers(false);
        }
      } else {
        setLoadingCustomers(false);
        console.error("No customers found");
      }
      setLoadingCustomers(false);
      return undefined;
    } else */ {
      const result = await search(
        setLoadingCustomers,
        "customers",
        searchKey,
        setFilteredCustomersSearchResults,
        undefined,
        tenantContext,
      );
      if (!result) return result;
      const filteredResult = result.filter(
        (customer) => customer.active !== false,
      );
      if (filteredResult.length !== result.length) {
        setFilteredCustomersSearchResults(filteredResult);
      }

      if (filteredResult.length > 0) {
        return filteredResult;
      }

      setLoadingCustomers(true);
      const fuzzyResult = await getFuzzyCustomerSearchResults(searchKey);
      setFilteredCustomersSearchResults(fuzzyResult);
      setLoadingCustomers(false);

      return fuzzyResult;
    }
  };

  const subscribeCustomersInputSearchResults = useCallback(
    (
      customersQuery: Query<Customer>,
      mapSnapshot: (docs: QueryDocumentSnapshot<Customer>[]) => Customer[] = (
        docs,
      ) => docs.map((doc) => doc.data()),
    ) =>
      new Promise<Customer[]>((resolve) => {
        clearCustomersInputSearchSubscription();

        let didResolve = false;
        const resolveSearch = (value: Customer[]) => {
          if (didResolve) {
            return;
          }

          didResolve = true;
          pendingCustomersInputSearchResolveRef.current = null;
          resolve(value);
        };

        pendingCustomersInputSearchResolveRef.current = resolveSearch;
        customersInputSearchUnsubscribeRef.current = onSnapshot(
          customersQuery,
          (snapshot) => {
            const nextCustomers =
              filterActiveCustomers(mapSnapshot(snapshot.docs)) ?? [];

            setFilteredCustomersInputSearchResults(nextCustomers);
            setLoadingCustomersInput(false);
            resolveSearch(nextCustomers);
          },
          (error) => {
            console.error(
              "Error subscribing to customer search results:",
              error,
            );
            setFilteredCustomersInputSearchResults([]);
            setLoadingCustomersInput(false);
            resolveSearch([]);
          },
        );
      }),
    [
      clearCustomersInputSearchSubscription,
      setLoadingCustomersInput,
      setFilteredCustomersInputSearchResults,
    ],
  );
  const subscribeFuzzyCustomersInputSearchResults = useCallback(
    async (searchKey: string): Promise<Customer[]> => {
      const seed = getFuzzyCustomerSearchSeed(searchKey);

      if (!seed) {
        setFilteredCustomersInputSearchResults([]);
        setLoadingCustomersInput(false);
        return [];
      }

      return await subscribeCustomersInputSearchResults(
        db.search<Customer>(
          firestore,
          "customers",
          seed,
          tenant.queryConstraints(tenantContext),
        ),
        (docs) =>
          rankCustomersByFuzzySearch(
            docs.map((doc) => doc.data()),
            searchKey,
            5,
          ),
      );
    },
    [
      setFilteredCustomersInputSearchResults,
      setLoadingCustomersInput,
      subscribeCustomersInputSearchResults,
      tenantContext,
    ],
  );

  const subscribeExactOrFuzzyCustomersInputSearchResults = useCallback(
    async (searchKey: string): Promise<Customer[]> => {
      const exactResults = await subscribeCustomersInputSearchResults(
        db.search<Customer>(
          firestore,
          "customers",
          searchKey,
          tenant.queryConstraints(tenantContext),
        ),
      );

      if (exactResults.length > 0) {
        return exactResults;
      }

      return await subscribeFuzzyCustomersInputSearchResults(searchKey);
    },
    [
      subscribeCustomersInputSearchResults,
      subscribeFuzzyCustomersInputSearchResults,
      tenantContext,
    ],
  );

  const searchCustomersInput = async (searchKey: string) => {
    if (searchKey.length < 3) {
      clearCustomersInputSearchSubscription();
      setFilteredCustomersInputSearchResults([]);
      setLoadingCustomersInput(false);
      return [];
    }

    setLoadingCustomersInput(true);

    try {
      const searchResult = await meilisearchSearch(
        "CUSTOMERS",
        searchKey,
        undefined,
        undefined,
        5,
      );
      const customerIds = Array.isArray(searchResult) ? searchResult : [];

      if (customerIds.length === 0) {
        return await subscribeExactOrFuzzyCustomersInputSearchResults(
          searchKey,
        );
      }

      const customersQuery = db.query<Customer>(
        firestore,
        "customers",
        customerIds.length,
        undefined,
        tenant.queryConstraints(tenantContext, [
          where("id", "in", customerIds),
        ]),
      );

      return await subscribeCustomersInputSearchResults(
        customersQuery,
        (docs) => {
          const customersById = docs.reduce((map, doc) => {
            const customer = doc.data();
            map.set(customer.id, customer);
            return map;
          }, new Map<Customer["id"], Customer>());

          return customerIds
            .map((customerId) => customersById.get(customerId))
            .filter((customer): customer is Customer => Boolean(customer));
        },
      );
    } catch (error) {
      console.error(
        "Error searching customers with Meilisearch, falling back to Firebase:",
        error,
      );

      return await subscribeExactOrFuzzyCustomersInputSearchResults(searchKey);
    }

    // Vector search disabled - too slow
    // const result = await search(
    //   setLoadingCustomersInput,
    //   "customers",
    //   searchKey,
    //   setFilteredCustomersInputSearchResults,
    // );
    // const filteredResult = result?.filter((customer) => customer.active !== false) ?? [];
    // if (!result || filteredResult.length === 0) {
    //   await vectorSearch(SearchType.CUSTOMERS, "undefined", searchKey);
    //   setLoadingCustomersInput(true);
    //   const vectorSearchResult = await vectorSearch(SearchType.CUSTOMERS, "undefined", searchKey) as Customer["id"][];
    //   if (vectorSearchResult.length > 0) {
    //     const customersQuery = db.query<Customer>(firestore, "customers", 5, undefined, [where("id", "in", vectorSearchResult)]);
    //     const customers = (await getDocs(customersQuery)).docs.map((doc) => doc.data());
    //     const activeCustomers = customers.filter((customer) => customer.active !== false);
    //     if (activeCustomers.length === 0) {
    //       setLoadingCustomersInput(false);
    //       toaster.create({
    //         title: t("common.noResults", { defaultValue: "No results" }),
    //         description: t("common.noCustomersMatchingQuery", { defaultValue: "No customers found matching the query: " }) + searchKey,
    //         type: "info",
    //       });
    //     } else {
    //       setFilteredCustomersInputSearchResults(activeCustomers);
    //       setLoadingCustomersInput(false);
    //       return activeCustomers;
    //     }
    //   } else {
    //     setLoadingCustomersInput(false);
    //     console.error("No customers found");
    //   }
    //   setLoadingCustomersInput(false);
    //   return [];
    // } else {
    //   setFilteredCustomersInputSearchResults(filteredResult);
    //   return filteredResult;
    // }
  };

  const cleanCustomersSearchResults = () => setCustomersSearchResults(null);

  const refreshCustomers = () =>
    setDirtyRefreshCustomers(!dirtyRefreshCustomers);

  const deactivateCustomer = (documentId: string) =>
    deactivate(setLoadingCustomers, "customers", documentId, refreshCustomers);

  async function unlinkProductFromCustomer(
    productId: string,
    customerId: string,
  ) {
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

      if (!customer.linkedProductsIds?.includes(productId)) {
        throw new Error("Product not linked to this customer");
      }

      await update(
        {
          linkedProductsIds: arrayRemove(productId) as unknown as string[],
        },
        customerRef,
        tenantContext,
      );
    } catch (error) {
      console.error(error);
    }
  }

  async function linkCustomerToCustomerGroup(
    customerId: string,
    customerGroupId: string,
  ) {
    try {
      const updatedAt = Timestamp.now();
      const updatedBy = {
        id: user?.uid ?? "",
        name: user?.displayName ?? "",
      };

      // Update customer doc
      await update(
        {
          customerGroupIds: arrayUnion(customerGroupId) as unknown as string[],
        },
        db.doc<Partial<Customer>>(firestore, "/customers", customerId),
        tenantContext,
      );

      // Update customerGroup doc
      await update(
        {
          customerIds: arrayUnion(customerId) as unknown as string[],
          updatedBy,
          updatedAt,
        },
        db.doc<Record<string, unknown>>(
          firestore,
          "/customerGroups",
          customerGroupId,
        ),
        tenantContext,
      );
    } catch (error) {
      console.error("Error linking customer to customer group:", error);
      throw error;
    }
  }

  async function unlinkCustomerFromCustomerGroup(
    customerId: string,
    customerGroupId: string,
  ) {
    try {
      const updatedAt = Timestamp.now();
      const updatedBy = {
        id: user?.uid ?? "",
        name: user?.displayName ?? "",
      };

      // Update customer doc
      await update(
        {
          customerGroupIds: arrayRemove(customerGroupId) as unknown as string[],
        },
        db.doc<Partial<Customer>>(firestore, "/customers", customerId),
        tenantContext,
      );

      // Update customerGroup doc
      await update(
        {
          customerIds: arrayRemove(customerId) as unknown as string[],
          updatedBy,
          updatedAt,
        },
        db.doc<Record<string, unknown>>(
          firestore,
          "/customerGroups",
          customerGroupId,
        ),
        tenantContext,
      );
    } catch (error) {
      console.error("Error unlinking customer from customer group:", error);
      throw error;
    }
  }

  return (
    <CustomersContext.Provider
      value={{
        loadingCustomers,
        pageIndex,
        setPageIndex,
        customers,
        customersCount,
        customersSearchResults,
        customersInputSearchResults,
        cleanCustomersSearchResults,
        showCustomers,
        searchCustomers,
        searchCustomersInput,
        refreshCustomers,
        dirtyRefreshCustomers,
        deactivateCustomer,
        unlinkProductFromCustomer,
        linkCustomerToCustomerGroup,
        unlinkCustomerFromCustomerGroup,
      }}
    >
      {children}
    </CustomersContext.Provider>
  );
};

const useCustomers = () => useContext(CustomersContext);

export { CustomersProvider, useCustomers };
