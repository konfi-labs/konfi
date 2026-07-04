"use client";

import { meilisearchSearch } from "@/actions";
import { updateOrderPaymentDocument } from "@/actions/order-updates";
import { useTenantContext } from "@/context/tenant";
import { useProductionOrderActions } from "@/hooks/useProductionOrderActions";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  type PaymentDocumentOrderUpdate,
  updateOrderCollection,
} from "@/lib/orders/payment-document";
import { showSearchResults } from "@/lib/search";
import { toaster } from "@konfi/components/ui/toaster";
import type { OrdersSearchField } from "@konfi/meilisearch";
import { getTextSearchFields, parsePriceSearchInput } from "@konfi/meilisearch";
import {
  calculateProcessingQueue,
  db,
  getDoc,
  tenant,
  update,
  vectorSearch,
} from "@konfi/firebase";
import type { ItemProblem } from "@konfi/types";
import { Order, RulesState, RulesStateAction, SearchType } from "@konfi/types";
import { applyOrderItemStatusChange } from "@konfi/utils/order-item-status";
import { rulesStateReducer } from "@konfi/utils/reducers";
import { debounce } from "es-toolkit/function";
import {
  DocumentReference,
  endBefore,
  getCountFromServer,
  limitToLast,
  onSnapshot,
  orderBy,
  Query,
  QueryConstraint,
  QuerySnapshot,
  startAfter,
  where,
} from "firebase/firestore";
import {
  createContext,
  Dispatch,
  SetStateAction,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth";
import { useChannels } from "./channels";
import { useConfigurationMembers } from "./configuration";

interface IOrders {
  loadingOrders: boolean;
  pageIndex: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  includeStoreOrders: boolean;
  setIncludeStoreOrders: (next: boolean) => void;
  selectedSearchFields: OrdersSearchField[];
  setSelectedSearchFields: Dispatch<SetStateAction<OrdersSearchField[]>>;
  customerFilterId: string | null;
  setCustomerFilterId: (customerId: string | null) => void;
  orders: Order[] | null;
  ordersCount: number;
  showOrders: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  showSearchOrders: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  searchOrders: (
    searchKey: string,
    vector?: boolean,
    searchFields?: OrdersSearchField[],
  ) => Promise<undefined | void | (() => void)>;
  ordersSearchResults: Order[] | null;
  ordersSearchTotalCount: number;
  cleanOrdersSearchResults: () => void;
  deactivateOrder: (documentId: string, channelId?: string) => void;
  queryConstraints: QueryConstraint[];
  setQueries: (queryConstraints: QueryConstraint[]) => void;
  rulesState: RulesState;
  dispatchRulesState: Dispatch<RulesStateAction>;
  setStartDate: Dispatch<SetStateAction<string | undefined>>;
  setEndDate: Dispatch<SetStateAction<string | undefined>>;
  refreshOrders: () => void;
  patchOrder: (
    orderId: string,
    channelId: string | undefined,
    patch: Partial<Order>,
  ) => void;
  updatePaymentDocument: (
    orderId: string,
    channelId: string,
    paymentDocumentId?: string,
    proformaDocumentId?: string,
  ) => Promise<PaymentDocumentOrderUpdate>;
  updateCarriedOutBy: (
    orderId: string,
    channelId: string,
    carriedOutBy: string[],
  ) => Promise<void>;
  updateItemFulfillment: (
    orderId: string,
    channelId: string,
    itemId: string,
    fulfilled: boolean,
  ) => Promise<void>;
  updateItemInProgress: (
    orderId: string,
    channelId: string,
    itemId: string,
    inProgress: boolean,
  ) => Promise<void>;
  updateItemPickedUp: (
    orderId: string,
    channelId: string,
    itemId: string,
    pickedUp: boolean,
  ) => Promise<void>;
  updateItemDelivered: (
    orderId: string,
    channelId: string,
    itemId: string,
    delivered: boolean,
  ) => Promise<void>;
  updateItemPriority: (
    orderId: string,
    channelId: string,
    itemId: string,
    priority: boolean,
  ) => Promise<void>;
  updateItemProblem: (
    orderId: string,
    channelId: string,
    itemId: string,
    problem: ItemProblem | null,
  ) => Promise<void>;
  processingQueue: React.RefObject<number>;
}

export const ORDERS_PAGE_SIZE = 30;
const ORDERS_INCLUDE_STORE_STORAGE_KEY = "ordersIncludeStore";

type TimestampLike =
  | { toDate?: () => Date; seconds?: number }
  | null
  | undefined;

function toMillis(value: TimestampLike): number {
  if (!value) {
    return 0;
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  return 0;
}

function sortOrdersByCreatedAtDesc(orders: Order[]): Order[] {
  return orders.toSorted((left, right) => {
    const createdAtDifference =
      toMillis(right.createdAt) - toMillis(left.createdAt);

    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return `${left.channelId}:${left.id}`.localeCompare(
      `${right.channelId}:${right.id}`,
    );
  });
}

function mapSnapshotOrders(
  querySnap: QuerySnapshot<Order>,
  previousOrders: Order[],
  collectionChannelId: string,
): Order[] {
  const changedOrderIds = new Set(
    querySnap.docChanges().map((change) => change.doc.id),
  );
  const previousById = new Map(
    previousOrders.map((order) => [order.id, order] as const),
  );

  return querySnap.docs.map((doc) => {
    const id = doc.id;
    if (!changedOrderIds.has(id)) {
      const previousOrder = previousById.get(id);
      if (previousOrder?.channelId === collectionChannelId) {
        return previousOrder;
      }
    }

    return {
      ...doc.data(),
      channelId: collectionChannelId,
      id,
    };
  });
}

function hasSameOrderReferences(
  previousOrders: Order[] | null,
  nextOrders: Order[],
): previousOrders is Order[] {
  return (
    previousOrders !== null &&
    previousOrders.length === nextOrders.length &&
    previousOrders.every((order, index) => order === nextOrders[index])
  );
}

const OrdersContext = createContext<IOrders>({
  loadingOrders: true,
  pageIndex: 0,
  setPageIndex: () => {},
  includeStoreOrders: false,
  setIncludeStoreOrders: () => {},
  selectedSearchFields: [],
  setSelectedSearchFields: () => {},
  customerFilterId: null,
  setCustomerFilterId: () => {},
  orders: null,
  ordersCount: 0,
  showOrders: () => Promise.resolve(),
  showSearchOrders: () => Promise.resolve(),
  searchOrders: () => Promise.resolve(),
  cleanOrdersSearchResults: () => null,
  ordersSearchResults: null,
  ordersSearchTotalCount: 0,
  deactivateOrder: () => {},
  queryConstraints: [],
  setQueries: () => {},
  rulesState: {
    rulesQueries: [],
    values: [],
    presetEnabled: false,
    enabledPresetIndex: null,
    enabledPresetId: null,
  },
  dispatchRulesState: () => {},
  setStartDate: () => {},
  setEndDate: () => {},
  refreshOrders: () => {},
  patchOrder: () => {},
  updatePaymentDocument: () => Promise.resolve({}),
  updateCarriedOutBy: () => Promise.resolve(),
  updateItemFulfillment: () => Promise.resolve(),
  updateItemInProgress: () => Promise.resolve(),
  updateItemPickedUp: () => Promise.resolve(),
  updateItemDelivered: () => Promise.resolve(),
  updateItemPriority: () => Promise.resolve(),
  updateItemProblem: () => Promise.resolve(),
  processingQueue: { current: 0 },
});

const OrdersProvider = ({ children }: React.PropsWithChildren) => {
  const { t } = useT(["order", "orders", "translation"]);
  const { loadingChannels } = useChannels();
  const { members } = useConfigurationMembers();
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const searchOperationUnsubscribe = useRef<(() => void) | null>(null);
  const searchRequestIdRef = useRef(0);
  const [ordersSearchResults, setOrdersSearchResults] = useState<
    Order[] | null
  >(null);
  const [ordersSearchTotalCount, setOrdersSearchTotalCount] =
    useState<number>(0);
  const [currentSearchQuery, setCurrentSearchQuery] = useState<string>("");
  const [isVectorSearch, setIsVectorSearch] = useState<boolean>(false);
  const [selectedSearchFields, setSelectedSearchFields] = useState<
    OrdersSearchField[]
  >([]);
  const [customerFilterId, setCustomerFilterIdState] = useState<string | null>(
    null,
  );
  const { channel } = useChannels();
  const { user } = useAuth();
  const tenantContext = useTenantContext();
  const [ordersQuery, setOrdersQuery] = useState<Query<Order> | null>(null);
  const [queryConstraints, setQueryConstraints] = useState<QueryConstraint[]>(
    [],
  );
  const [rulesState, dispatchRulesState] = useReducer(rulesStateReducer, {
    rulesQueries: [],
    values: [],
    presetEnabled: false,
    enabledPresetIndex: null,
    enabledPresetId: null,
  });
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const processingQueue = useRef<number>(0);
  const previousSelectedSearchFields = useRef<string>("");
  const storeChannelId = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID?.trim();
  const [includeStoreOrders, setIncludeStoreOrdersState] = useState(false);
  const [includeStoreOrdersLoaded, setIncludeStoreOrdersLoaded] =
    useState(false);
  const [mergedFetchLimit, setMergedFetchLimit] = useState<number | null>(null);
  const canIncludeStoreOrders =
    Boolean(storeChannelId) &&
    Boolean(channel?.id) &&
    channel?.id !== storeChannelId;
  const includeStoreOrdersInCurrentChannel =
    includeStoreOrders && canIncludeStoreOrders;
  const baseOrderQueryConstraints = useMemo(
    () =>
      tenant.queryConstraints(tenantContext, [
        ...queryConstraints,
        ...(customerFilterId
          ? [where("customer.id", "==", customerFilterId)]
          : []),
        where("active", "==", true),
      ]),
    [customerFilterId, queryConstraints, tenantContext],
  );

  // Debounced applier for rule-based query constraints (700ms debounce)
  const applyQueriesDebounced = useRef<
    ((constraints: QueryConstraint[]) => void) & {
      cancel: () => void;
      flush: () => void;
    }
  >(
    debounce((constraints: QueryConstraint[]) => {
      startTransition(() => {
        setQueryConstraints(constraints);
        setOrdersQuery(null);
        setPageIndex(0);
      });
    }, 700) as ((constraints: QueryConstraint[]) => void) & {
      cancel: () => void;
      flush: () => void;
    },
  );

  const refreshOrders = useCallback(() => {
    startTransition(() => {
      // cancel any pending debounced rules application
      try {
        applyQueriesDebounced.current?.cancel();
      } catch {
        /* noop */
      }
      setMergedFetchLimit(null);
      setOrdersQuery(null);
      setQueryConstraints([]);
      setCustomerFilterIdState(null);
      setPageIndex(0);
      setOrdersSearchResults(null);
      setStartDate(undefined);
      setEndDate(undefined);
      dispatchRulesState({
        rulesQueries: [],
        values: [],
        presetEnabled: false,
        enabledPresetIndex: null,
        enabledPresetId: null,
        type: "INIT",
      });
    });
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ORDERS_INCLUDE_STORE_STORAGE_KEY);
      setIncludeStoreOrdersState(stored === "true");
    } catch (error) {
      console.error("Error loading include-store orders preference:", error);
    } finally {
      setIncludeStoreOrdersLoaded(true);
    }
  }, []);

  const setIncludeStoreOrders = useCallback((next: boolean) => {
    try {
      localStorage.setItem(ORDERS_INCLUDE_STORE_STORAGE_KEY, String(next));
    } catch (error) {
      console.error("Error saving include-store orders preference:", error);
    }

    startTransition(() => {
      setIncludeStoreOrdersState(next);
      setOrdersQuery(null);
      setMergedFetchLimit(null);
      setPageIndex(0);
    });
  }, []);

  const setCustomerFilterId = useCallback((customerId: string | null) => {
    const unsubscribeHandler = searchOperationUnsubscribe.current;

    if (typeof unsubscribeHandler === "function") {
      unsubscribeHandler();
      searchOperationUnsubscribe.current = null;
    }

    startTransition(() => {
      setOrdersSearchResults(null);
      setOrdersSearchTotalCount(0);
      setCurrentSearchQuery("");
      setIsVectorSearch(false);
      setCustomerFilterIdState(customerId);
      setOrdersQuery(null);
      setMergedFetchLimit(null);
      setPageIndex(0);
    });
  }, []);

  useEffect(() => {
    if (loadingChannels) {
      setLoadingOrders(true);
    }
  }, [loadingChannels]);

  useEffect(() => {
    refreshOrders();
  }, [channel, refreshOrders, user]);

  useEffect(() => {
    if (channel && user && members && members.length > 0) {
      calculateProcessingQueue(channel.id, members?.length)
        .then((queue) => {
          startTransition(() => {
            processingQueue.current = queue;
          });
        })
        .catch((error) => {
          console.error("Error calculating processing queue:", error);
        });
    }
  }, [channel, user, members]);

  useEffect(() => {
    if (!channel?.id || !user?.uid) {
      setOrdersCount(0);
      return;
    }

    if (!includeStoreOrdersLoaded) {
      return;
    }

    let cancelled = false;

    const countChannelIds = [channel.id];
    if (includeStoreOrdersInCurrentChannel && storeChannelId) {
      countChannelIds.push(storeChannelId);
    }

    void Promise.all(
      countChannelIds.map(async (channelId) => {
        const countQuery = db.query<Order>(
          firestore,
          `/channels/${channelId}/orders`,
          999999,
          undefined,
          baseOrderQueryConstraints,
          startDate,
          endDate,
        );

        const result = await getCountFromServer(countQuery);
        return result.data().count;
      }),
    )
      .then((counts) => {
        if (cancelled) {
          return;
        }

        setOrdersCount(counts.reduce((sum, count) => sum + count, 0));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error("Error getting orders count:", {
          channelIds: countChannelIds,
          error,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    baseOrderQueryConstraints,
    channel?.id,
    endDate,
    includeStoreOrdersInCurrentChannel,
    includeStoreOrdersLoaded,
    startDate,
    storeChannelId,
    user?.uid,
  ]);

  useEffect(() => {
    if (!channel || !user || !includeStoreOrdersLoaded) {
      return;
    }

    setLoadingOrders(true);

    const handleSnapshotError = (channelId: string, error: unknown) => {
      console.error("Error subscribing to orders snapshot:", {
        channelId,
        error,
      });
      toaster.create({
        title: t("orders.error", { defaultValue: "Error" }),
        description: t("orders.loadFailed", {
          defaultValue: "Failed to load orders. Please refresh and try again.",
        }),
        type: "error",
      });
      setLoadingOrders(false);
    };

    if (includeStoreOrdersInCurrentChannel && storeChannelId) {
      const fetchLimit = Math.max(
        ORDERS_PAGE_SIZE,
        mergedFetchLimit ?? (pageIndex + 1) * ORDERS_PAGE_SIZE,
      );
      const pageStart = pageIndex * ORDERS_PAGE_SIZE;
      const pageEnd = pageStart + ORDERS_PAGE_SIZE;

      const buildSnapshotQuery = (channelId: string) =>
        db.query<Order>(
          firestore,
          `/channels/${channelId}/orders`,
          fetchLimit,
          undefined,
          baseOrderQueryConstraints,
          startDate,
          endDate,
        );

      let currentOrdersSnapshot: Order[] = [];
      let storeOrdersSnapshot: Order[] = [];
      let currentReady = false;
      let storeReady = false;

      const publishMergedOrders = () => {
        if (!currentReady || !storeReady) {
          return;
        }

        const mergedOrders = sortOrdersByCreatedAtDesc([
          ...currentOrdersSnapshot,
          ...storeOrdersSnapshot,
        ]).slice(pageStart, pageEnd);

        startTransition(() => {
          setOrders((previousOrders) => {
            if (hasSameOrderReferences(previousOrders, mergedOrders)) {
              return previousOrders;
            }

            return mergedOrders;
          });
          setLoadingOrders(false);
        });
      };

      const unsubscribeCurrent = onSnapshot(
        buildSnapshotQuery(channel.id),
        (querySnap) => {
          currentOrdersSnapshot = mapSnapshotOrders(
            querySnap,
            currentOrdersSnapshot,
            channel.id,
          );
          currentReady = true;
          publishMergedOrders();
        },
        (error) => {
          handleSnapshotError(channel.id, error);
        },
      );

      const unsubscribeStore = onSnapshot(
        buildSnapshotQuery(storeChannelId),
        (querySnap) => {
          storeOrdersSnapshot = mapSnapshotOrders(
            querySnap,
            storeOrdersSnapshot,
            storeChannelId,
          );
          storeReady = true;
          publishMergedOrders();
        },
        (error) => {
          handleSnapshotError(storeChannelId, error);
        },
      );

      return () => {
        unsubscribeCurrent();
        unsubscribeStore();
      };
    }

    const snapshotQuery =
      ordersQuery ??
      db.query<Order>(
        firestore,
        `/channels/${channel.id}/orders`,
        ORDERS_PAGE_SIZE,
        undefined,
        baseOrderQueryConstraints,
        startDate,
        endDate,
      );

    const unsubscribe = onSnapshot(
      snapshotQuery,
      (querySnap) => {
        startTransition(() => {
          setOrders((previousOrders) => {
            const nextOrders = mapSnapshotOrders(
              querySnap,
              previousOrders ?? [],
              channel.id,
            );

            if (hasSameOrderReferences(previousOrders, nextOrders)) {
              return previousOrders;
            }

            return nextOrders;
          });
          setLoadingOrders(false);
        });
      },
      (error) => {
        handleSnapshotError(channel.id, error);
      },
    );

    return unsubscribe;
  }, [
    baseOrderQueryConstraints,
    channel,
    endDate,
    includeStoreOrdersInCurrentChannel,
    includeStoreOrdersLoaded,
    mergedFetchLimit,
    ordersQuery,
    pageIndex,
    startDate,
    storeChannelId,
    t,
    user,
  ]);

  // Reset pagination state only when the underlying filters change.
  // Including pagination state itself here causes page clicks to instantly
  // snap back to the first page.
  useEffect(() => {
    setOrdersQuery(null);
    setMergedFetchLimit(null);
    setPageIndex(0);
  }, [
    endDate,
    includeStoreOrdersInCurrentChannel,
    queryConstraints,
    customerFilterId,
    startDate,
  ]);

  const showOrders = useCallback(
    async (
      type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
      limit: number,
    ): Promise<void> => {
      const safeLimit = Math.max(1, limit);
      const lastPageIndex = Math.max(0, Math.ceil(ordersCount / safeLimit) - 1);

      if (includeStoreOrdersInCurrentChannel) {
        if (type === "NEXT") {
          // When total count is known, block if already on last page
          if (ordersCount > 0 && pageIndex >= lastPageIndex) return;
          // When total count is unknown (race condition), block only if current page is not full
          if (ordersCount === 0 && (!orders || orders.length < safeLimit))
            return;
        }
        if (type === "PREVIOUS" && pageIndex === 0) {
          return;
        }
        // LAST requires a known total count; guard against ordersCount === 0
        if (type === "LAST" && ordersCount === 0) {
          return;
        }

        startTransition(() => {
          setOrdersQuery(null);
          setMergedFetchLimit(type === "LAST" ? ordersCount : null);
          setPageIndex((prev) => {
            if (type === "FIRST") return 0;
            if (type === "NEXT") {
              // When total is known cap at lastPageIndex, otherwise freely increment
              return ordersCount > 0
                ? Math.min(lastPageIndex, prev + 1)
                : prev + 1;
            }
            if (type === "PREVIOUS") return Math.max(0, prev - 1);
            if (type === "LAST") return lastPageIndex;
            return prev;
          });
        });

        return;
      }

      // Guard invalid pagination requests
      if (!channel?.id) {
        return;
      }
      if (type === "NEXT" && (!orders || orders.length < safeLimit)) {
        return;
      }
      if (type === "NEXT" && ordersCount > 0 && pageIndex >= lastPageIndex) {
        return;
      }
      if (type === "PREVIOUS" && pageIndex === 0) {
        return;
      }
      const baseConstraints = baseOrderQueryConstraints;

      let paginationConstraints: QueryConstraint[];

      switch (type) {
        case "PREVIOUS":
          paginationConstraints = [
            ...(orders?.[0]?.createdAt
              ? [endBefore(orders[0].createdAt), limitToLast(safeLimit)]
              : []),
            ...baseConstraints,
          ];
          break;
        case "LAST":
          paginationConstraints = [
            orderBy("createdAt", "desc"),
            limitToLast(ordersCount % safeLimit || safeLimit),
            ...baseConstraints,
          ];
          break;
        case "NEXT":
          paginationConstraints = [
            ...(orders &&
            orders.length > 0 &&
            orders[orders.length - 1]?.createdAt
              ? [startAfter(orders[orders.length - 1].createdAt)]
              : []),
            ...baseConstraints,
          ];
          break;
        case "FIRST":
        default:
          paginationConstraints = baseConstraints;
          break;
      }

      startTransition(() => {
        setOrdersQuery(
          db.query(
            firestore,
            `/channels/${channel.id}/orders`,
            safeLimit,
            undefined,
            paginationConstraints,
            startDate,
            endDate,
          ),
        );
        // Update local page index hint
        setPageIndex((prev) => {
          if (type === "FIRST") return 0;
          if (type === "NEXT") {
            return ordersCount > 0
              ? Math.min(lastPageIndex, prev + 1)
              : prev + 1;
          }
          if (type === "PREVIOUS") return Math.max(0, prev - 1);
          if (type === "LAST") {
            return lastPageIndex;
          }
          return prev;
        });
      });
    },
    [
      baseOrderQueryConstraints,
      channel?.id,
      endDate,
      includeStoreOrdersInCurrentChannel,
      orders,
      ordersCount,
      pageIndex,
      startDate,
    ],
  );

  const searchOrders = useCallback(
    async (
      searchKey: string,
      vector?: boolean,
      searchFields?: OrdersSearchField[],
    ): Promise<void | (() => void) | undefined> => {
      const resolvedSearchFields = searchFields ?? selectedSearchFields;

      if (typeof searchOperationUnsubscribe.current === "function") {
        searchOperationUnsubscribe.current();
        searchOperationUnsubscribe.current = null;
      }
      const searchRequestId = ++searchRequestIdRef.current;
      const isLatestSearchRequest = () =>
        searchRequestIdRef.current === searchRequestId;

      if (searchKey.length === 0) {
        setOrdersSearchResults(null);
        setOrdersSearchTotalCount(0);
        refreshOrders();
        return;
      }

      setLoadingOrders(true);
      setCurrentSearchQuery(searchKey);
      setIsVectorSearch(!!vector);
      setSelectedSearchFields(resolvedSearchFields);
      setPageIndex(0); // Reset to first page when searching

      const searchChannelId = channel?.id;
      if (!searchChannelId) {
        setLoadingOrders(false);
        console.error("Channel is missing");
        return;
      }

      // Check if searchKey is a number
      const isNumeric =
        !isNaN(Number(searchKey)) && !isNaN(parseFloat(searchKey));
      const shouldUseExactNumberQuery =
        isNumeric &&
        (resolvedSearchFields.length === 0 ||
          (resolvedSearchFields.length === 1 &&
            resolvedSearchFields[0] === "orderNumber"));

      // Price search: parse user input as price in minor currency
      const hasPriceField = resolvedSearchFields.includes("totalPrice");
      const parsedPrice = hasPriceField
        ? parsePriceSearchInput(searchKey)
        : undefined;
      const textSearchFields = hasPriceField
        ? getTextSearchFields(resolvedSearchFields)
        : resolvedSearchFields;
      const shouldUseExactPriceQuery =
        parsedPrice !== undefined && textSearchFields.length === 0;

      if (vector && searchKey.length > 3 && !isNumeric) {
        setLoadingOrders(true);
        const vectorSearchResult = (await vectorSearch(
          SearchType.ORDERS,
          searchChannelId,
          searchKey,
        )) as Order["id"][];
        if (!isLatestSearchRequest()) {
          return;
        }
        setIsVectorSearch(true);

        if (vectorSearchResult && vectorSearchResult.length > 0) {
          setOrdersSearchTotalCount(vectorSearchResult.length);

          const unsubscribe = onSnapshot(
            db.query<Order>(
              firestore,
              "/channels/" + searchChannelId + "/orders",
              ORDERS_PAGE_SIZE,
              undefined,
              tenant.queryConstraints(tenantContext, [
                where(
                  "id",
                  "in",
                  vectorSearchResult.slice(0, ORDERS_PAGE_SIZE),
                ),
              ]),
            ),
            (querySnap) => {
              if (!isLatestSearchRequest()) {
                return;
              }

              if (querySnap.docs.length === 0) {
                console.info("No search results found");
                toaster.create({
                  title: t("common.noResults", {
                    defaultValue: "No results",
                  }),
                  description:
                    t("common.noOrdersMatchingQuery", {
                      defaultValue: "No orders found matching the query: ",
                    }) + searchKey,
                  type: "info",
                });
                setLoadingOrders(false);
                return;
              }

              startTransition(() => {
                setOrdersSearchResults((previousOrders) => {
                  const nextOrders = mapSnapshotOrders(
                    querySnap,
                    previousOrders ?? [],
                    searchChannelId,
                  );

                  if (hasSameOrderReferences(previousOrders, nextOrders)) {
                    return previousOrders;
                  }

                  return nextOrders;
                });
                setLoadingOrders(false);
              });
            },
            (error) => {
              if (!isLatestSearchRequest()) {
                return;
              }

              console.error(error);
              setLoadingOrders(false);
            },
          );

          searchOperationUnsubscribe.current = unsubscribe;

          return () => unsubscribe();
        } else {
          setLoadingOrders(false);
          console.error("No search results found");
          toaster.create({
            title: t("common.noResults", { defaultValue: "No results" }),
            description:
              t("common.noOrdersMatchingQuery", {
                defaultValue: "No orders found matching the query: ",
              }) + searchKey,
            type: "info",
          });
        }
      } else {
        let searchResult: { results: string[]; totalHits: number } | undefined;
        if (!shouldUseExactNumberQuery && !shouldUseExactPriceQuery) {
          try {
            searchResult = (await meilisearchSearch(
              "ORDERS",
              searchKey,
              searchChannelId,
              0,
              ORDERS_PAGE_SIZE,
              textSearchFields,
            )) as { results: string[]; totalHits: number };
          } catch (error) {
            if (process.env.NODE_ENV === "development") {
              console.error("Error searching in MeiliSearch:", error);
            }
          }
        }

        if (!isLatestSearchRequest()) {
          return;
        }

        const meilisearchResult = searchResult?.results || [];
        setOrdersSearchTotalCount(
          shouldUseExactNumberQuery || shouldUseExactPriceQuery
            ? 1
            : searchResult?.totalHits || meilisearchResult.length,
        );

        const shouldUseKeywordsFallback = resolvedSearchFields.length === 0;

        if (
          !shouldUseExactNumberQuery &&
          !shouldUseExactPriceQuery &&
          meilisearchResult.length === 0 &&
          !shouldUseKeywordsFallback
        ) {
          startTransition(() => {
            setOrdersSearchResults([]);
          });
          toaster.create({
            title: t("common.noResults", { defaultValue: "No results" }),
            description:
              t("common.noOrdersMatchingQuery", {
                defaultValue: "No orders found matching the query: ",
              }) + searchKey,
            type: "info",
          });
          setLoadingOrders(false);
          return;
        }

        // If searchKey is numeric, search by id instead of keywords
        const queryConstraint = shouldUseExactNumberQuery
          ? where("number", "==", Number(searchKey))
          : shouldUseExactPriceQuery
            ? where("totalPrice", "==", parsedPrice)
            : meilisearchResult.length > 0
              ? where("id", "in", meilisearchResult)
              : where("keywords", "array-contains", searchKey);

        const unsubscribe = onSnapshot(
          db.query<Order>(
            firestore,
            "/channels/" + searchChannelId + "/orders",
            ORDERS_PAGE_SIZE,
            undefined,
            tenant.queryConstraints(tenantContext, [
              where("active", "==", true),
              queryConstraint,
            ]),
            undefined,
            undefined,
            meilisearchResult.length > 0,
          ),
          (querySnap) => {
            if (!isLatestSearchRequest()) {
              return;
            }

            if (querySnap.docs.length === 0) {
              setOrdersSearchTotalCount(0);
              console.info("No search results found");
              toaster.create({
                title: t("common.noResults", { defaultValue: "No results" }),
                description:
                  t("common.noOrdersMatchingQuery", {
                    defaultValue: "No orders found matching the query: ",
                  }) + searchKey,
                type: "info",
              });
              setLoadingOrders(false);
              return;
            }

            startTransition(() => {
              setOrdersSearchResults((previousOrders) => {
                const nextOrders = mapSnapshotOrders(
                  querySnap,
                  previousOrders ?? [],
                  searchChannelId,
                );

                if (hasSameOrderReferences(previousOrders, nextOrders)) {
                  return previousOrders;
                }

                return nextOrders;
              });
              setLoadingOrders(false);
            });
          },
          (error) => {
            if (!isLatestSearchRequest()) {
              return;
            }

            console.error(error);
            setLoadingOrders(false);
          },
        );
        searchOperationUnsubscribe.current = unsubscribe;

        return () => unsubscribe();
      }
    },
    [channel, refreshOrders, selectedSearchFields, t, tenantContext],
  );

  useEffect(() => {
    const selectedSearchFieldsKey = selectedSearchFields.join("|");

    if (previousSelectedSearchFields.current === selectedSearchFieldsKey) {
      return;
    }

    previousSelectedSearchFields.current = selectedSearchFieldsKey;

    if (!currentSearchQuery) {
      return;
    }

    void searchOrders(currentSearchQuery, isVectorSearch, selectedSearchFields);
  }, [currentSearchQuery, isVectorSearch, searchOrders, selectedSearchFields]);

  const cleanOrdersSearchResults = useCallback(() => {
    const unsubscribeHandler = searchOperationUnsubscribe.current;

    if (typeof unsubscribeHandler === "function") {
      unsubscribeHandler();
      searchOperationUnsubscribe.current = null;
    }

    setLoadingOrders(true);
    startTransition(() => {
      setOrdersSearchResults(null);
      setOrdersSearchTotalCount(0);
      setCurrentSearchQuery("");
      setIsVectorSearch(false);
      refreshOrders();
      setLoadingOrders(false);
    });
  }, [refreshOrders]);

  const {
    deactivateOrder,
    updateItemFulfillment,
    updateItemInProgress,
    updateItemPriority,
    updateItemProblem,
  } = useProductionOrderActions({
    fallbackChannelId: channel?.id,
    setLoading: setLoadingOrders,
  });

  const setQueries = useCallback((_queryConstraints: QueryConstraint[]) => {
    // Debounce applying rules to avoid rapid re-subscriptions
    if (applyQueriesDebounced.current) {
      applyQueriesDebounced.current(_queryConstraints);
    } else {
      startTransition(() => {
        setQueryConstraints(_queryConstraints);
        setOrdersQuery(null);
        setPageIndex(0);
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const applyQueries = applyQueriesDebounced.current;

    return () => {
      try {
        applyQueries.cancel();
      } catch {
        /* noop */
      }
    };
  }, []);

  const updatePaymentDocument = useCallback(
    async (
      orderId: string,
      channelId: string,
      paymentDocumentId?: string,
      proformaDocumentId?: string,
    ) => {
      try {
        const updateData = await updateOrderPaymentDocument({
          channelId,
          orderId,
          paymentDocumentId,
          proformaDocumentId,
          source: "admin-payment-document-form",
        });
        setOrders((previousOrders) =>
          updateOrderCollection(previousOrders, orderId, updateData, channelId),
        );
        setOrdersSearchResults((previousOrders) =>
          updateOrderCollection(previousOrders, orderId, updateData, channelId),
        );
        toaster.create({
          title: t("order.paymentDocumentAdded", {
            defaultValue: "Payment document added",
          }),
          description: t("order.paymentDocumentAddedDescription", {
            defaultValue: "Added payment document to order.",
          }),
          type: "success",
        });
        return updateData;
      } catch (error) {
        console.error(error);
        toaster.create({
          title: t("order.paymentDocumentError", { defaultValue: "Error" }),
          description: t("order.paymentDocumentErrorDescription", {
            defaultValue:
              "An error occurred while adding the payment document.",
          }),
          type: "error",
        });
        throw error;
      }
    },
    [t],
  );

  const patchOrder = useCallback(
    (orderId: string, channelId: string | undefined, patch: Partial<Order>) => {
      setOrders((previousOrders) =>
        updateOrderCollection(previousOrders, orderId, patch, channelId),
      );
      setOrdersSearchResults((previousOrders) =>
        updateOrderCollection(previousOrders, orderId, patch, channelId),
      );
    },
    [],
  );

  const updateCarriedOutBy = useCallback(
    async (orderId: string, channelId: string, carriedOutBy: string[]) => {
      try {
        await update(
          {
            carriedOutBy,
          },
          db.doc(firestore, `channels/${channelId}/orders`, orderId),
          tenantContext,
        );
        toaster.create({
          title: t("order.carriedOutByUpdated", {
            defaultValue: "Executors updated",
          }),
          description: t("order.carriedOutByUpdatedDescription", {
            defaultValue: "Updated order executors.",
          }),
          type: "success",
        });
      } catch (error) {
        console.error(error);
        toaster.create({
          title: t("order.carriedOutByError", { defaultValue: "Error" }),
          description: t("order.carriedOutByErrorDescription", {
            defaultValue: "An error occurred while updating executors.",
          }),
          type: "error",
        });
      }
    },
    [t, tenantContext],
  );

  const updateItemPickedUp = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      pickedUp: boolean,
    ) => {
      try {
        const orderRef = db.doc(
          firestore,
          `channels/${channelId}/orders`,
          orderId,
        );
        const existingOrder = await getDoc<Order>(
          orderRef as DocumentReference<Order>,
        );

        if (!existingOrder) {
          throw new Error(
            t("order.itemStatusUpdateError", {
              defaultValue: "Failed to update item status",
            }),
          );
        }

        const nextCollections = applyOrderItemStatusChange(existingOrder, {
          itemId,
          pickedUp,
        });

        await update(nextCollections, orderRef, tenantContext);
        toaster.create({
          title: t("order.itemPickedUp", { defaultValue: "Item picked up" }),
          description: t("order.itemPickedUpDescription", {
            defaultValue: "Updated picked up items.",
          }),
          type: "success",
        });
      } catch (error) {
        console.error(error);
        toaster.create({
          title: t("order.itemPickedUpError", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("order.itemPickedUpErrorDescription", {
                  defaultValue:
                    "An error occurred while updating picked up items.",
                }),
          type: "error",
        });
      }
    },
    [t, tenantContext],
  );

  const updateItemDelivered = useCallback(
    async (
      orderId: string,
      channelId: string,
      itemId: string,
      delivered: boolean,
    ) => {
      try {
        const orderRef = db.doc(
          firestore,
          `channels/${channelId}/orders`,
          orderId,
        );
        const existingOrder = await getDoc<Order>(
          orderRef as DocumentReference<Order>,
        );

        if (!existingOrder) {
          throw new Error(
            t("order.itemStatusUpdateError", {
              defaultValue: "Failed to update item status",
            }),
          );
        }

        const nextCollections = applyOrderItemStatusChange(existingOrder, {
          itemId,
          delivered,
        });

        await update(nextCollections, orderRef, tenantContext);
        toaster.create({
          title: t("order.itemDelivered", { defaultValue: "Item delivered" }),
          description: t("order.itemDeliveredDescription", {
            defaultValue: "Updated delivered items.",
          }),
          type: "success",
        });
      } catch (error) {
        console.error(error);
        toaster.create({
          title: t("order.itemDeliveredError", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("order.itemDeliveredErrorDescription", {
                  defaultValue:
                    "An error occurred while updating delivered items.",
                }),
          type: "error",
        });
      }
    },
    [t, tenantContext],
  );

  const showSearchOrders = useCallback(
    async (
      type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
      limit: number,
    ): Promise<void> => {
      if (!currentSearchQuery || !channel) return;

      const unsubscribe = await showSearchResults<Order>({
        entityType: "ORDERS",
        channelId: channel.id,
        searchQuery: currentSearchQuery,
        isVectorSearch,

        paginationAction: type,
        pageIndex,
        pageSize: limit,
        totalCount: ordersSearchTotalCount,
        searchFields: selectedSearchFields,

        firestore,
        collectionPath: `/channels/${channel.id}/orders`,

        vectorSearchFn: (_, channelId, query) =>
          vectorSearch(SearchType.ORDERS, channelId, query),
        meilisearchFn: meilisearchSearch,

        setResults: (results) => {
          startTransition(() => {
            setOrdersSearchResults(results);
          });
        },
        setLoading: setLoadingOrders,
        setPageIndex,
      });

      if (searchOperationUnsubscribe.current) {
        searchOperationUnsubscribe.current();
      }

      searchOperationUnsubscribe.current = unsubscribe;
    },
    [
      channel,
      currentSearchQuery,
      isVectorSearch,
      ordersSearchTotalCount,
      pageIndex,
      selectedSearchFields,
    ],
  );

  const value = useMemo(
    () => ({
      loadingOrders,
      pageIndex,
      setPageIndex,
      includeStoreOrders,
      setIncludeStoreOrders,
      selectedSearchFields,
      setSelectedSearchFields,
      customerFilterId,
      setCustomerFilterId,
      orders,
      ordersCount,
      showOrders,
      showSearchOrders,
      searchOrders,
      ordersSearchResults,
      ordersSearchTotalCount,
      cleanOrdersSearchResults,
      deactivateOrder,
      queryConstraints,
      setQueries,
      rulesState,
      dispatchRulesState,
      setStartDate,
      setEndDate,
      refreshOrders,
      patchOrder,
      updatePaymentDocument,
      updateCarriedOutBy,
      updateItemFulfillment,
      updateItemInProgress,
      updateItemPickedUp,
      updateItemDelivered,
      updateItemPriority,
      updateItemProblem,
      processingQueue,
    }),
    [
      loadingOrders,
      pageIndex,
      includeStoreOrders,
      orders,
      ordersCount,
      selectedSearchFields,
      customerFilterId,
      showOrders,
      showSearchOrders,
      searchOrders,
      ordersSearchResults,
      ordersSearchTotalCount,
      cleanOrdersSearchResults,
      deactivateOrder,
      queryConstraints,
      setQueries,
      rulesState,
      refreshOrders,
      patchOrder,
      updatePaymentDocument,
      updateCarriedOutBy,
      updateItemFulfillment,
      updateItemInProgress,
      updateItemPickedUp,
      updateItemDelivered,
      updateItemPriority,
      updateItemProblem,
      processingQueue,
      setIncludeStoreOrders,
      setCustomerFilterId,
    ],
  );

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
};

const useOrders = () => useContext(OrdersContext);

export { OrdersProvider, useOrders };
