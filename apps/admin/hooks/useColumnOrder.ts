import { Channel, Order, OrderStatus } from "@konfi/types";
import { arrayUnion, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase/clientApp";
import { db, update } from "@konfi/firebase";
import { useCallback } from "react";
import { useTenantContext } from "@/context/tenant";

const useColumnOrder = (
  column: keyof typeof OrderStatus,
  data: Order[],
  channelId: Channel["id"],
  max?: number,
) => {
  const tenantContext = useTenantContext();
  const dropTaskFrom = useCallback(
    (from: keyof typeof OrderStatus, id: Order["id"]) => {
      if (data.length === max) return;
      const timestampNow = Timestamp.now();
      const _activities = [];
      _activities.push({
        type: "ORDER_STATUS_UPDATE",
        value: column,
        timestamp: timestampNow,
      });
      update(
        { status: column, activities: arrayUnion(..._activities) },
        db.doc(firestore, "/channels/" + channelId + "/orders", id),
        tenantContext,
      );
    },
    [column, data.length, channelId, max, tenantContext],
  );

  return {
    dropTaskFrom,
  };
};

export default useColumnOrder;
