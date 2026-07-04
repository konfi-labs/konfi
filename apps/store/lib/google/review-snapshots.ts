import "server-only";

import {
  channelId,
  getAdminDb,
  getFirebaseAdminApp,
} from "@/lib/firebase/serverApp";
import { GoogleReview } from "@konfi/google";
import { Locale } from "@konfi/types";
import { FieldValue } from "firebase-admin/firestore";

const GOOGLE_REVIEWS_DOC_ID = "googleReviews";
const GOOGLE_REVIEWS_SOURCE = "vercel-cron";

export interface GoogleReviewsSyncDocument {
  id: typeof GOOGLE_REVIEWS_DOC_ID;
  placeId: string;
  source: typeof GOOGLE_REVIEWS_SOURCE;
  locales?: Locale[];
  reviewCounts?: Partial<Record<Locale, number>>;
  lastSyncedAt?: string;
  lastSyncedMonth?: string;
  lastAttemptedAt?: string;
  attemptedMonth?: string;
  lastError?: string;
}

export interface GoogleReviewsTranslationDocument {
  id: Locale;
  locale: Locale;
  placeId: string;
  reviews: GoogleReview[];
  syncedAt: string;
  syncedMonth: string;
}

interface SaveGoogleReviewSnapshotsInput {
  channelId?: string;
  placeId: string;
  syncedAt: string;
  syncedMonth: string;
  reviewsByLocale: Record<Locale, GoogleReview[]>;
}

interface SaveGoogleReviewSyncFailureInput {
  channelId?: string;
  attemptedAt: string;
  attemptedMonth: string;
  error: string;
  placeId: string;
}

function getGoogleReviewsDocumentPath(storeChannelId: string) {
  return `channels/${storeChannelId}/cms/${GOOGLE_REVIEWS_DOC_ID}`;
}

function getGoogleReviewsTranslationPath(
  storeChannelId: string,
  locale: Locale,
) {
  return `${getGoogleReviewsDocumentPath(storeChannelId)}/translations/${locale}`;
}

function getRequiredChannelId() {
  if (!channelId) {
    throw new Error("NEXT_PUBLIC_STORE_CHANNEL_ID is not configured.");
  }

  return channelId;
}

export function buildGoogleReviewsMonthKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export async function getGoogleReviewsSyncDocument(storeChannelId?: string) {
  const targetChannelId = storeChannelId ?? getRequiredChannelId();
  const snapshot = await getAdminDb()
    .doc(getGoogleReviewsDocumentPath(targetChannelId))
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return snapshot.data() as GoogleReviewsSyncDocument | undefined;
}

export async function saveGoogleReviewSnapshots({
  channelId: storeChannelId,
  placeId,
  syncedAt,
  syncedMonth,
  reviewsByLocale,
}: SaveGoogleReviewSnapshotsInput) {
  const targetChannelId = storeChannelId ?? getRequiredChannelId();
  const adminDb = getAdminDb();
  const parentRef = adminDb.doc(getGoogleReviewsDocumentPath(targetChannelId));
  const locales = Object.keys(reviewsByLocale) as Locale[];
  const reviewCounts = Object.fromEntries(
    locales.map((locale) => [locale, reviewsByLocale[locale].length]),
  ) as Partial<Record<Locale, number>>;

  const batch = adminDb.batch();

  const syncDocument: GoogleReviewsSyncDocument = {
    id: GOOGLE_REVIEWS_DOC_ID,
    placeId,
    source: GOOGLE_REVIEWS_SOURCE,
    locales,
    reviewCounts,
    lastSyncedAt: syncedAt,
    lastSyncedMonth: syncedMonth,
    lastAttemptedAt: syncedAt,
    attemptedMonth: syncedMonth,
    lastError: FieldValue.delete() as unknown as string,
  };

  batch.set(parentRef, syncDocument, { merge: true });

  locales.forEach((locale) => {
    const translationDoc: GoogleReviewsTranslationDocument = {
      id: locale,
      locale,
      placeId,
      reviews: reviewsByLocale[locale],
      syncedAt,
      syncedMonth,
    };

    batch.set(
      parentRef.collection("translations").doc(locale),
      translationDoc,
      { merge: true },
    );
  });

  await batch.commit();
}

export async function saveGoogleReviewSyncFailure({
  channelId: storeChannelId,
  attemptedAt,
  attemptedMonth,
  error,
  placeId,
}: SaveGoogleReviewSyncFailureInput) {
  const targetChannelId = storeChannelId ?? getRequiredChannelId();

  await getAdminDb().doc(getGoogleReviewsDocumentPath(targetChannelId)).set(
    {
      id: GOOGLE_REVIEWS_DOC_ID,
      placeId,
      source: GOOGLE_REVIEWS_SOURCE,
      lastAttemptedAt: attemptedAt,
      attemptedMonth,
      lastError: error,
    },
    { merge: true },
  );
}

export async function getStoredGoogleReviews(
  locale: Locale,
  storeChannelId = getRequiredChannelId(),
) {
  const snapshot = await getAdminDb()
    .doc(getGoogleReviewsTranslationPath(storeChannelId, locale))
    .get();

  if (!snapshot.exists) {
    return [] as GoogleReview[];
  }

  const data = snapshot.data() as GoogleReviewsTranslationDocument | undefined;

  return data?.reviews ?? [];
}

export async function ensureFirebaseAdminInitialized() {
  getFirebaseAdminApp();
}
