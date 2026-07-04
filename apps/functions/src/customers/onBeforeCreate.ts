import { Customer } from "@konfi/types";
import { Firestore, Timestamp } from "firebase-admin/firestore";
import {
  AuthBlockingEvent,
  AuthUserRecord,
  beforeUserCreated,
  HttpsError,
} from "firebase-functions/v2/identity";
import { db } from "../admin";

interface LegacyLookupResult {
  customerDocId: string;
  customerData: Customer;
}

async function findLegacyCustomer(
  firestore: Firestore,
  email: string,
): Promise<LegacyLookupResult | null> {
  const snapshot = await firestore
    .collection("customers")
    .where("email", "==", email.toLowerCase())
    .where("active", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    customerDocId: doc.id,
    customerData: doc.data() as Customer,
  };
}

async function promoteLegacyCustomer(
  firestore: Firestore,
  authUser: AuthUserRecord,
  legacy: LegacyLookupResult,
): Promise<void> {
  const { customerDocId, customerData } = legacy;
  const canonicalRef = firestore.collection("customers").doc(authUser.uid);
  const legacyRef = firestore.collection("customers").doc(customerDocId);
  const timestamp = Timestamp.now();

  const updatedBy = customerData.updatedBy ??
    customerData.createdBy ?? {
      id: "system",
      name: "System",
    };

  const canonicalPayload: Customer = {
    ...customerData,
    id: authUser.uid,
    email: authUser.email?.toLowerCase() ?? customerData.email ?? "",
    updatedAt: timestamp,
    updatedBy,
    active: true,
    linkedProductsIds: customerData.linkedProductsIds ?? [],
    orders: customerData.orders ?? [],
  };

  await firestore.runTransaction(async (transaction) => {
    transaction.set(canonicalRef, {
      ...canonicalPayload,
      linkedLegacyCustomerId: customerDocId,
      linkedAuthId: authUser.uid,
    });

    transaction.set(
      legacyRef,
      {
        active: false,
        linkedAuthId: authUser.uid,
        legacyMigratedAt: timestamp,
      },
      { merge: true },
    );
  });
}

export const onBeforeCreate = beforeUserCreated(
  async (event: AuthBlockingEvent) => {
    if (!event.data?.email) return;

    const email = event.data.email?.toLowerCase();
    if (!email) return;

    const legacy = await findLegacyCustomer(db, email);
    if (!legacy) {
      console.info("No legacy customer found for email", email);
      return;
    }

    const legacyAlreadyLinked =
      legacy.customerData.linkedAuthId &&
      legacy.customerData.linkedAuthId !== event.data.uid;

    if (legacyAlreadyLinked) {
      throw new HttpsError(
        "already-exists",
        "Customer account is already linked to another user.",
      );
    }

    await promoteLegacyCustomer(db, event.data, legacy);
  },
);
