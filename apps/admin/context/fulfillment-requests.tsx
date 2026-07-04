"use client";

import { firestore } from "@/lib/firebase/clientApp";
import { FulfillmentRequestStatus } from "@konfi/types";
import {
  collectionGroup,
  getCountFromServer,
  query,
  where,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useChannels } from "./channels";

interface FulfillmentRequestsContextType {
  activeFulfillmentRequestsCount: number;
  refreshFulfillmentRequestsCount: () => void;
  channelWarehouseIds: string[];
}

const FulfillmentRequestsContext =
  createContext<FulfillmentRequestsContextType | null>(null);

export function FulfillmentRequestsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeFulfillmentRequestsCount, setActiveFulfillmentRequestsCount] =
    useState(0);
  const { channel } = useChannels();
  const channelWarehouseIds = channel?.warehouses || [];

  const refreshFulfillmentRequestsCount = useCallback(async () => {
    try {
      // If no channel or no warehouses, set count to 0
      if (
        !channel ||
        !channelWarehouseIds ||
        channelWarehouseIds.length === 0
      ) {
        setActiveFulfillmentRequestsCount(0);
        return;
      }

      // Query across warehouses in the current channel using collectionGroup
      const fulfillmentRequestsRef = collectionGroup(
        firestore,
        "fulfillmentRequests",
      );

      // Count active fulfillment requests with PENDING or ACCEPTED status for current channel's warehouses
      const activeCountQuery = query(
        fulfillmentRequestsRef,
        where("active", "==", true),
        where("targetWarehouseId", "in", channelWarehouseIds),
        where("status", "==", FulfillmentRequestStatus.PENDING),
      );

      const activeCountSnapshot = await getCountFromServer(activeCountQuery);
      setActiveFulfillmentRequestsCount(activeCountSnapshot.data().count);
    } catch (error) {
      console.error("Error fetching fulfillment requests count:", error);
    }
  }, [channel, channelWarehouseIds]);

  // Load count on mount and when channel changes
  useEffect(() => {
    refreshFulfillmentRequestsCount();
  }, [refreshFulfillmentRequestsCount]);

  return (
    <FulfillmentRequestsContext.Provider
      value={{
        activeFulfillmentRequestsCount,
        refreshFulfillmentRequestsCount,
        channelWarehouseIds,
      }}
    >
      {children}
    </FulfillmentRequestsContext.Provider>
  );
}

export const useFulfillmentRequests = () => {
  const context = useContext(FulfillmentRequestsContext);
  if (!context) {
    throw new Error(
      "useFulfillmentRequests must be used within a FulfillmentRequestsProvider",
    );
  }
  return context;
};
