import "server-only";

import { getAppForServer } from "@/lib/firebase/serverApp";
import { Rating } from "@konfi/types";

export async function getRatings({
  channelId,
  productId,
}: {
  channelId?: string;
  productId: string;
}) {
  const { firebaseServerApp } = await getAppForServer();
  const getFirestore = (await import("firebase/firestore")).getFirestore;
  const firestore = getFirestore(firebaseServerApp);
  const db = (await import("@konfi/firebase")).db;
  const get = (await import("@konfi/firebase")).get;
  const where = (await import("firebase/firestore")).where;
  const resolvedChannelId =
    channelId ?? (await import("@/lib/firebase/serverApp")).channelId;

  const ratingsRef = db.query<Rating>(
    firestore,
    `/channels/${resolvedChannelId}/products/${productId}/ratings`,
    5,
    undefined,
    [where("isRated", "==", true), where("active", "==", true)],
  );

  const ratingsCountRef = db.collection<Rating>(
    firestore,
    `/channels/${resolvedChannelId}/products/${productId}/ratings`,
  );

  const ratingsResult = await get(ratingsRef);

  let ratings: Rating[] = [];

  if (ratingsResult) {
    ratings = ratingsResult[0];
  }

  const getCountFromServer = (await import("firebase/firestore"))
    .getCountFromServer;

  const ratingsCount =
    (await getCountFromServer(ratingsCountRef)).data().count || 0;

  return {
    ratings,
    ratingsCount,
  };
}
