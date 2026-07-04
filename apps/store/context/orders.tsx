"use client";

import { firestore } from "@/lib/firebase/clientApp";
import { db } from "@konfi/firebase";
import { Order } from "@konfi/types";
import { isNull } from "es-toolkit";
import {
  DocumentSnapshot,
  onSnapshot,
  orderBy,
  Query,
  QueryConstraint,
  where,
} from "firebase/firestore";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./auth";
import { useStoreRuntimeConfig } from "./runtime-config";

interface IOrders {
  isEmpty: boolean;
  loadingOrders: boolean;
  pageIndex: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  orders: Order[] | null;
  ordersCount: number;
  showOrders: (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ) => Promise<void>;
  searchOrders: (searchKey: string) => Promise<void>;
  ordersSearchResults: Order[] | null;
  cleanOrdersSearchResults: () => void;
  setRules: (queryConstraints: QueryConstraint[]) => void;
}

const OrdersContext = createContext<IOrders>({
  isEmpty: true,
  loadingOrders: true,
  pageIndex: 0,
  setPageIndex: () => {},
  orders: null,
  ordersCount: 0,
  showOrders: () => new Promise<void>((resolve) => resolve()),
  searchOrders: () => new Promise<void>((resolve) => resolve()),
  cleanOrdersSearchResults: () => null,
  ordersSearchResults: null,
  setRules: () => {},
});

const OrdersProvider = ({ children }: React.PropsWithChildren) => {
  const { user, customer, loading: userLoading } = useAuth();
  const runtimeConfig = useStoreRuntimeConfig();
  const channelId = runtimeConfig.channelId;
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [isEmpty, setIsEmpty] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const [latestOrder, setLatestOrders] = useState<
    DocumentSnapshot<Order> | undefined
  >(undefined);
  const [ordersSearchResults, setOrdersSearchResults] = useState<
    Order[] | null
  >(null);
  const [ordersQuery, setOrdersQuery] = useState<Query | null>(null);
  const [queryConstraints, setQueryConstraints] = useState<QueryConstraint[]>(
    [],
  );
  const [hasInitValues, setHasInitValues] = useState(true);

  function setInit() {
    setIsEmpty(true);
    setPageIndex(0);
    setOrders(null);
    setOrdersCount(0);
    setLatestOrders(undefined);
    setOrdersSearchResults(null);
    setOrdersQuery(null);
    setQueryConstraints([]);
    setHasInitValues(true);
  }

  useEffect(() => {
    if (!user || !customer) {
      if (!hasInitValues) setInit();
      setLoadingOrders(false);
      return;
    }

    let unsubscribeFn: () => void;
    try {
      unsubscribeFn = onSnapshot(
        queryConstraints.length > 0
          ? db.query<Order>(
              firestore,
              "/channels/" + (channelId ?? "") + "/orders",
              10,
              undefined,
              [
                ...queryConstraints,
                where("active", "==", true),
                where("customer.id", "==", customer?.orders ?? []),
              ],
            )
          : !isNull(ordersQuery)
            ? ordersQuery
            : db.query<Order>(
                firestore,
                "/channels/" + (channelId ?? "") + "/orders",
                10,
                undefined,
                [
                  where("active", "==", true),
                  where("customer.id", "==", customer.id),
                ],
              ),
        (querySnap) => {
          setOrders(querySnap.docs.map((doc) => doc.data() as Order));
          setLoadingOrders(false);
          setHasInitValues(false);
          setIsEmpty(querySnap.empty);
        },
        (error) => {
          console.error(error);
          setLoadingOrders(false);
          setHasInitValues(false);
        },
      );
    } catch (e) {
      console.error("Error while subscribing to orders query: ", e);
      setLoadingOrders(false);
      setHasInitValues(false);
    }

    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
      }
    };
  }, [
    userLoading,
    user,
    customer,
    ordersQuery,
    queryConstraints,
    hasInitValues,
    channelId,
  ]);

  const showOrders = async (
    type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
    limit: number,
  ): Promise<void> => {
    if (!user || !customer) {
      setLoadingOrders(false);
      setInit();
      return;
    }

    if (isNull(channelId)) {
      setLoadingOrders(false);
      setInit();
      return;
    }
    const db = (await import("@konfi/firebase")).db;
    const startAfter = (await import("firebase/firestore")).startAfter;
    const endBefore = (await import("firebase/firestore")).endBefore;
    const where = (await import("firebase/firestore")).where;
    const limitToLast = (await import("firebase/firestore")).limitToLast;

    setOrdersQuery(
      db.query(
        firestore,
        "/channels/" + channelId + "/orders",
        limit,
        type === "NEXT" ? latestOrder : undefined,
        type === "PREVIOUS"
          ? [
              endBefore(orders?.[0].createdAt),
              limitToLast(limit),
              where("orderId", "in", customer.orders),
            ]
          : type === "LAST"
            ? [
                orderBy("createdAt", "desc"),
                limitToLast(ordersCount % limit || limit),
              ]
            : type === "NEXT"
              ? [
                  startAfter(orders?.[orders.length - 1].createdAt),
                  where("orderId", "in", customer.orders),
                ]
              : undefined,
      ),
    );
  };

  const searchOrders: (searchKey: string) => Promise<void> = async (
    searchKey: string,
  ) => {
    const search = (await import("@/lib/helpers")).search;
    await search(
      firestore,
      setLoadingOrders,
      "/channels/" + channelId + "/orders",
      searchKey,
      setOrdersSearchResults,
    );
  };
  const cleanOrdersSearchResults = () => setOrdersSearchResults(null);
  const setRules = (_queryConstraints: QueryConstraint[]) =>
    setQueryConstraints(_queryConstraints);

  return (
    <OrdersContext.Provider
      value={{
        isEmpty,
        loadingOrders,
        pageIndex,
        setPageIndex,
        orders,
        ordersCount,
        showOrders,
        searchOrders,
        ordersSearchResults,
        cleanOrdersSearchResults,
        setRules,
      }}
    >
      {children}
    </OrdersContext.Provider>
  );
};

const useOrders = () => useContext(OrdersContext);

export { OrdersProvider, useOrders };
