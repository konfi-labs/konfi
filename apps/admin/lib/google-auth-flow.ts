export const GOOGLE_REDIRECT_CURRENT_USER_MAX_AGE_MS = 5 * 60 * 1000;

const GOOGLE_POPUP_REDIRECT_FALLBACK_CODES = new Set([
  "auth/operation-not-supported-in-this-environment",
  "auth/popup-blocked",
]);

export function shouldFallbackToGoogleRedirect(errorCode: string | undefined) {
  return Boolean(
    errorCode && GOOGLE_POPUP_REDIRECT_FALLBACK_CODES.has(errorCode),
  );
}

export function isRecentFirebaseSignIn(
  lastSignInTime: string | undefined,
  nowMs = Date.now(),
  maxAgeMs = GOOGLE_REDIRECT_CURRENT_USER_MAX_AGE_MS,
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
