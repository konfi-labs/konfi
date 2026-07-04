export const ADMIN_AUTH_ERROR_QUERY_PARAM = "authError";
export const ADMIN_AUTH_ERROR_STORAGE_KEY = "admin-auth-error";
export const ADMIN_AUTH_ERROR_LOCAL_STORAGE_KEY = "admin-auth-error";
export const ADMIN_AUTH_ERROR_COOKIE_NAME = "admin-auth-error";

export const ADMIN_AUTH_ERROR_REASONS = [
  "admin-access-required",
  "tenant-context-required",
  "tenant-membership-required",
  "session-error",
] as const;

export type AdminAuthErrorReason = (typeof ADMIN_AUTH_ERROR_REASONS)[number];

const ADMIN_AUTH_ERROR_REASON_SET = new Set<string>(ADMIN_AUTH_ERROR_REASONS);
const ADMIN_AUTH_ERROR_COOKIE_MAX_AGE_SECONDS = 5 * 60;

export function normalizeAdminAuthErrorReason(
  value: string | string[] | null | undefined,
): AdminAuthErrorReason | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    typeof candidate !== "string" ||
    !ADMIN_AUTH_ERROR_REASON_SET.has(candidate)
  ) {
    return;
  }

  return candidate as AdminAuthErrorReason;
}

export function readStoredAdminAuthErrorReason():
  | AdminAuthErrorReason
  | undefined {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const storedReason = normalizeAdminAuthErrorReason(
      window.sessionStorage.getItem(ADMIN_AUTH_ERROR_STORAGE_KEY),
    );

    if (storedReason) {
      return storedReason;
    }
  } catch {
    // Fall back to local storage and the cookie below.
  }

  try {
    const storedReason = normalizeAdminAuthErrorReason(
      window.localStorage.getItem(ADMIN_AUTH_ERROR_LOCAL_STORAGE_KEY),
    );

    if (storedReason) {
      return storedReason;
    }
  } catch {
    // Fall back to the cookie below.
  }

  try {
    const cookieValue = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(`${ADMIN_AUTH_ERROR_COOKIE_NAME}=`))
      ?.split("=")[1];

    return normalizeAdminAuthErrorReason(
      cookieValue ? decodeURIComponent(cookieValue) : undefined,
    );
  } catch {
    return;
  }
}

export function writeStoredAdminAuthErrorReason(
  reason: AdminAuthErrorReason,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(ADMIN_AUTH_ERROR_STORAGE_KEY, reason);
  } catch {
    // Ignore storage failures. Other storage layers still carry the same
    // controlled reason when session storage is unavailable.
  }

  try {
    window.localStorage.setItem(ADMIN_AUTH_ERROR_LOCAL_STORAGE_KEY, reason);
  } catch {
    // Ignore storage failures.
  }

  try {
    document.cookie = [
      `${ADMIN_AUTH_ERROR_COOKIE_NAME}=${encodeURIComponent(reason)}`,
      "Path=/",
      `Max-Age=${ADMIN_AUTH_ERROR_COOKIE_MAX_AGE_SECONDS}`,
      "SameSite=Lax",
      window.location.protocol === "https:" ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
  } catch {
    // Ignore cookie failures. Session storage and the URL still carry the
    // controlled reason when cookies are unavailable.
  }
}

export function clearStoredAdminAuthErrorReason(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(ADMIN_AUTH_ERROR_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }

  try {
    window.localStorage.removeItem(ADMIN_AUTH_ERROR_LOCAL_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }

  try {
    document.cookie = [
      `${ADMIN_AUTH_ERROR_COOKIE_NAME}=`,
      "Path=/",
      "Max-Age=0",
      "SameSite=Lax",
      window.location.protocol === "https:" ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
  } catch {
    // Ignore cookie failures.
  }
}
