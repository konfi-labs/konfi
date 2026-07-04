import { OrderStatus } from "@konfi/types";
import {
  collection,
  getCountFromServer,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { firestore, initFirestore } from "../lib";

export async function calculateProcessingQueue(
  channelId: string,
  membersCount: number,
  timeFrameDays?: number,
): Promise<number> {
  if (!channelId || !membersCount || membersCount <= 0) return 0;
  if (!firestore) {
    initFirestore();
  }
  try {
    const _timeFrameDays = timeFrameDays || 7;
    const ordersCollection = collection(
      firestore,
      `channels/${channelId}/orders`,
    );
    const timeThreshold = Timestamp.fromDate(
      new Date(Date.now() - _timeFrameDays * 24 * 60 * 60 * 1000),
    );
    const ordersCountQuery = query(
      ordersCollection,
      where("createdAt", ">", timeThreshold),
      where("active", "==", true),
    );
    const ordersCountSnapshot = await getCountFromServer(ordersCountQuery);

    const pendingOrdersQuery = query(
      ordersCollection,
      where("active", "==", true),
      where("status", "in", [
        OrderStatus.NEW,
        OrderStatus.IN_PROGRESS,
        OrderStatus.WAITING_FOR_MATERIALS,
        OrderStatus.UNDER_REVIEW,
        OrderStatus.DELAYED,
      ]),
    );
    const pendingOrdersSnapshot = await getCountFromServer(pendingOrdersQuery);

    const workersEfficiency =
      ordersCountSnapshot.data().count / _timeFrameDays / membersCount;

    if (workersEfficiency <= 0) {
      return 0;
    }

    const processingQueue =
      pendingOrdersSnapshot.data().count / (membersCount * workersEfficiency);

    return Math.floor(processingQueue);
  } catch (error) {
    console.error("Error fetching processing queue:", error);
    return 0; // Return 0 if there's an error
  }
}
