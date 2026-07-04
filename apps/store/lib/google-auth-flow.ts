export const GOOGLE_PROVIDER_ID = "google.com";
export const STORE_GOOGLE_REDIRECT_CURRENT_USER_MAX_AGE_MS = 5 * 60 * 1000;

export type StoreGoogleRedirectMode = "link" | "sign-in";

export function isRecentFirebaseSignIn(
  lastSignInTime: string | undefined,
  nowMs = Date.now(),
  maxAgeMs = STORE_GOOGLE_REDIRECT_CURRENT_USER_MAX_AGE_MS,
) {
  if (!lastSignInTime) {
    return false;
  }

  const signInMs = Date.parse(lastSignInTime);
  if (!Number.isFinite(signInMs) || signInMs > nowMs) {
    return false;
  }

  return nowMs - signInMs <= maxAgeMs;
}

export function canUseGoogleRedirectCurrentUser({
  isAnonymous,
  lastSignInTime,
  mode,
  nowMs,
  providerIds,
}: {
  isAnonymous: boolean;
  lastSignInTime: string | undefined;
  mode: StoreGoogleRedirectMode;
  nowMs?: number;
  providerIds: readonly string[];
}) {
  if (!isRecentFirebaseSignIn(lastSignInTime, nowMs)) {
    return false;
  }

  if (!providerIds.includes(GOOGLE_PROVIDER_ID)) {
    return false;
  }

  if (mode === "sign-in" && isAnonymous) {
    return false;
  }

  return true;
}
