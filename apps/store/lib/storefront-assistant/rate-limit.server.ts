import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { Timestamp } from "firebase-admin/firestore";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 20;

export interface StorefrontAssistantRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export async function checkStorefrontAssistantRateLimit(
  uid: string,
): Promise<StorefrontAssistantRateLimitResult> {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const usageRef = getAdminDb().collection("storefrontAssistantUsage").doc(uid);

  return await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    const attempts =
      snapshot.exists && Array.isArray(snapshot.data()?.attempts)
        ? (snapshot.data()?.attempts as Timestamp[])
        : [];
    const recentAttempts = attempts.filter(
      (attempt) => attempt.toMillis() > windowStart,
    );

    if (recentAttempts.length >= MAX_ATTEMPTS) {
      const oldestAttempt = recentAttempts[0]?.toMillis() ?? now;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestAttempt + WINDOW_MS - now) / 1000),
      );

      return { allowed: false, retryAfterSeconds };
    }

    transaction.set(
      usageRef,
      {
        attempts: [...recentAttempts, Timestamp.fromMillis(now)],
        updatedAt: Timestamp.fromMillis(now),
      },
      { merge: true },
    );

    return { allowed: true };
  });
}
