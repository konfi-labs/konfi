import admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions } from "firebase-functions";

export const app = !admin.apps.length
  ? admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.STORAGE_BUCKET,
    })
  : undefined;

export const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
export const msg = admin.messaging();
export const storage = getStorage(app);
export const auth = getAuth(app);
export const arrayUnion = admin.firestore.FieldValue.arrayUnion;
export const arrayRemove = admin.firestore.FieldValue.arrayRemove;
export const increment = admin.firestore.FieldValue.increment;
export const vector = admin.firestore.FieldValue.vector;

setGlobalOptions({ region: "europe-central2" });
