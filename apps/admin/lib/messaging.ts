import { requireTenantContextTenantId } from "@konfi/firebase";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { arrayUnion, doc, setDoc, Timestamp } from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";
import { firestore, messaging } from "./firebase/clientApp";

export async function requestNotificationsPermissions(
  uid: string,
  tenantContext: TenantContext,
) {
  console.log("Requesting notifications permissions...");
  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    console.log("Notification permissions granted.");
    saveMessagingDeviceToken(uid, tenantContext);
  } else {
    console.error("Unable to get permission to notify.");
  }
}

export async function saveMessagingDeviceToken(
  uid: string,
  tenantContext: TenantContext,
) {
  const msg = await messaging();
  if (typeof window === "undefined") return;
  if (!msg) return;
  const tenantId = requireTenantContextTenantId(
    tenantContext,
    "FCM token registration",
  );

  const fcmToken = await getToken(msg, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAP_ID,
  });

  if (fcmToken) {
    console.log("Got FCM token:", fcmToken);
    const tokenRef = doc(firestore, "fcmTokens", uid);
    await setDoc(
      tokenRef,
      {
        tenantId,
        tokens: arrayUnion({ value: fcmToken, timestamp: Timestamp.now() }),
        uid,
      },
      { merge: true },
    );

    onMessage(msg, (message) => {
      console.log("Push notification received:", message.notification);
      new Notification(message.notification?.title || "", {
        body: message.notification?.body,
      });
    });
  } else {
    requestNotificationsPermissions(uid, tenantContext);
  }
}
