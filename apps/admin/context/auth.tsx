"use client";

import { handleIdToken } from "@/actions";
import {
  getCurrentTenantAccessAction,
  type CurrentTenantAccess,
} from "@/actions/tenant-permissions";
import {
  ADMIN_AUTH_ERROR_QUERY_PARAM,
  clearStoredAdminAuthErrorReason,
  type AdminAuthErrorReason,
  normalizeAdminAuthErrorReason,
  readStoredAdminAuthErrorReason,
  writeStoredAdminAuthErrorReason,
} from "@/lib/auth-errors";
import { resolveAdminSessionRoute } from "@/lib/auth-session-route";
import {
  normalizeTenantContextHint,
  tenantContextQueryParam,
} from "@/lib/tenant-handoff";
import {
  isRecentFirebaseSignIn,
  shouldFallbackToGoogleRedirect,
} from "@/lib/google-auth-flow";
import { auth } from "@/lib/firebase/clientApp";
import { isNull } from "es-toolkit";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  EmailAuthProvider,
  getIdTokenResult,
  getRedirectResult,
  GoogleAuthProvider,
  MultiFactorError,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  User,
  UserInfo,
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
// import { saveMessagingDeviceToken } from "@/lib/messaging";
import { useT } from "@/i18n/client";
import { toaster } from "@konfi/components/ui/toaster";
import {
  createBrowserSessionSync,
  type BrowserSessionSync,
} from "@konfi/utils/browser-platform";
import type { TenantPermission } from "@sblyvwx/cloud-contracts";
import { Route } from "next";
import { useRouter } from "next/navigation";
import { useTenantContext } from "./tenant";

interface LoginResult {
  mfaRequired?: boolean;
}

const GOOGLE_AUTH_REDIRECT_KEY = "admin-google-auth-redirect";

type GoogleAuthRedirectState = {
  redirectRoute: string;
  tenantContextHint?: string;
};

type AdminSessionResponse = Awaited<ReturnType<typeof handleIdToken>>;

interface AdminSessionRequestResult {
  currentPath: string;
  response: AdminSessionResponse;
  route: string;
  usedLoginRedirect: boolean;
}

function debugAdminAuthClient(
  event: string,
  details: Record<string, unknown> = {},
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[admin-auth:client] ${event}`, details);
}

async function deleteAdminPwaIndexedDb() {
  if (typeof indexedDB === "undefined") {
    return;
  }

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("konfi-delivery-sync");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function clearAdminPwaState() {
  if (typeof window === "undefined") {
    return;
  }

  const clearMessage = { type: "KONFI_CLEAR_ADMIN_PWA_CACHES" };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.postMessage(clearMessage);
  }

  if ("caches" in window) {
    const cacheNames = await window.caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("konfi-admin-"))
        .map((cacheName) => window.caches.delete(cacheName)),
    );
  }

  await deleteAdminPwaIndexedDb();
}

function summarizeAdminSessionResponse(
  response: AdminSessionResponse | undefined,
) {
  if (!response) {
    return null;
  }

  return {
    reason: "reason" in response ? response.reason : null,
    redirect: response.redirect,
    status: response.status,
    tenantId: getAuthorizedSessionTenantId(response) ?? null,
  };
}

function getAuthorizedSessionTenantId(
  response: AdminSessionResponse | undefined,
) {
  if (response?.status !== "authorized" || !("tenantId" in response)) {
    return undefined;
  }

  const tenantId = response.tenantId?.trim();
  return tenantId || undefined;
}

const getFirebaseAuthErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const { code } = error as { code?: unknown };

  return typeof code === "string" ? code : undefined;
};

const getFirebaseAuthErrorDetail = (error: unknown) => {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const { message, customData } = error as {
    message?: unknown;
    customData?: unknown;
  };

  if (typeof customData === "object" && customData !== null) {
    const { _tokenResponse } = customData as { _tokenResponse?: unknown };

    if (typeof _tokenResponse === "object" && _tokenResponse !== null) {
      const { error: tokenError, error_description: errorDescription } =
        _tokenResponse as {
          error?: unknown;
          error_description?: unknown;
        };

      if (typeof errorDescription === "string") {
        return errorDescription;
      }

      if (typeof tokenError === "string") {
        return tokenError;
      }

      if (typeof tokenError === "object" && tokenError !== null) {
        const { message: tokenErrorMessage } = tokenError as {
          message?: unknown;
        };

        if (typeof tokenErrorMessage === "string") {
          return tokenErrorMessage;
        }
      }
    }
  }

  return typeof message === "string" ? message : undefined;
};

function readSafeLoginRedirect(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const redirect = new URLSearchParams(window.location.search).get("redirect");

  return redirect?.startsWith("/") && !redirect.startsWith("//")
    ? redirect
    : null;
}

function readTenantContextHint(): string | undefined {
  if (typeof window === "undefined") {
    return;
  }

  return normalizeTenantContextHint(
    new URLSearchParams(window.location.search).get(tenantContextQueryParam),
  );
}

function readCurrentLoginAuthError(): AdminAuthErrorReason | undefined {
  if (typeof window === "undefined") {
    return;
  }

  return (
    normalizeAdminAuthErrorReason(
      new URLSearchParams(window.location.search).get(
        ADMIN_AUTH_ERROR_QUERY_PARAM,
      ),
    ) ?? readStoredAdminAuthErrorReason()
  );
}

function isCurrentLoginPath() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.location.pathname.includes("/auth/login");
}

function shouldUseGooglePopup() {
  if (typeof window === "undefined") {
    return false;
  }

  return true;
}

function appendCurrentAuthErrorToLoginRedirect(
  redirect: string | null | undefined,
) {
  if (!redirect || typeof window === "undefined") {
    return redirect ?? null;
  }

  if (!redirect.includes("/auth/login")) {
    return redirect;
  }

  const reason = readCurrentLoginAuthError();
  if (!reason) {
    return redirect;
  }

  const url = new URL(redirect, window.location.origin);
  if (!url.searchParams.has(ADMIN_AUTH_ERROR_QUERY_PARAM)) {
    url.searchParams.set(ADMIN_AUTH_ERROR_QUERY_PARAM, reason);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function readGoogleAuthRedirectState(): GoogleAuthRedirectState | null {
  if (typeof window === "undefined") {
    return null;
  }

  let rawValue: string | null = null;

  try {
    rawValue = window.sessionStorage.getItem(GOOGLE_AUTH_REDIRECT_KEY);
  } catch {
    // Fall back to local storage below.
  }

  if (!rawValue) {
    try {
      rawValue = window.localStorage.getItem(GOOGLE_AUTH_REDIRECT_KEY);
    } catch {
      // No redirect state available.
    }
  }

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as GoogleAuthRedirectState;
  } catch (error) {
    console.error("Failed to parse Google auth redirect state:", error);
    clearGoogleAuthRedirectState();
    return null;
  }
}

function writeGoogleAuthRedirectState(state: GoogleAuthRedirectState) {
  if (typeof window === "undefined") {
    return;
  }

  const encodedState = JSON.stringify(state);
  try {
    window.sessionStorage.setItem(GOOGLE_AUTH_REDIRECT_KEY, encodedState);
  } catch {
    // Local storage below is enough to restore the redirect flow.
  }

  try {
    window.localStorage.setItem(GOOGLE_AUTH_REDIRECT_KEY, encodedState);
  } catch {
    // Ignore storage failures; the Firebase redirect can still complete.
  }
}

function clearGoogleAuthRedirectState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(GOOGLE_AUTH_REDIRECT_KEY);
  } catch {
    // Ignore storage failures.
  }

  try {
    window.localStorage.removeItem(GOOGLE_AUTH_REDIRECT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function getRecentGoogleRedirectCurrentUser() {
  const currentUser = auth.currentUser;
  if (
    currentUser &&
    isRecentFirebaseSignIn(currentUser.metadata.lastSignInTime)
  ) {
    return currentUser;
  }

  return null;
}

function isUnauthorizedSessionResponse(
  response: AdminSessionResponse,
): response is AdminSessionResponse & {
  reason: AdminAuthErrorReason;
} {
  return response.status === "unauthorized" || response.status === "error";
}

interface IAuth {
  loading: boolean;
  initialLoading: boolean;
  actionLoading: boolean;
  user: User | null;
  userInfo: UserInfo | null;
  isAdminClient: boolean;
  isSuperAdminClient: boolean;
  isCourierClient: boolean;
  tenantAccess: CurrentTenantAccess | null;
  redirectRoute: string | null;
  authExpiration: number | null;
  authorizationError: AdminAuthErrorReason | null;
  mfaError: MultiFactorError | null;
  login: (
    email: string,
    password: string,
    remember: boolean,
  ) => Promise<LoginResult | void>;
  loginWithGoogle: (remember: boolean) => Promise<LoginResult | void>;
  logout: () => Promise<void>;
  passwordChange: (oldPassword: string, newPassword: string) => Promise<void>;
  redirect: (route: string) => void;
  hasTenantPermission: (permission: TenantPermission) => boolean;
  hasTenantWidePermission: (permission: TenantPermission) => boolean;
  clearMfaError: () => void;
  onMfaSuccess: () => void;
}

const AuthContext = createContext<IAuth>({
  loading: true,
  initialLoading: true,
  actionLoading: false,
  user: null,
  userInfo: null,
  isAdminClient: false,
  isSuperAdminClient: false,
  isCourierClient: false,
  tenantAccess: null,
  redirectRoute: null,
  authExpiration: null,
  authorizationError: null,
  mfaError: null,
  login: () => Promise.resolve(),
  loginWithGoogle: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  redirect: () => {},
  hasTenantPermission: () => false,
  hasTenantWidePermission: () => false,
  passwordChange: () => Promise.resolve(),
  clearMfaError: () => {},
  onMfaSuccess: () => {},
});

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const isFirstLoad = useRef(true);
  // const [user, loadingAuthState] = useAuthState(auth)
  const [user, setUser] = useState<User | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isAdminClient, setIsAdminClient] = useState<boolean>(false);
  const [isSuperAdminClient, setIsSuperAdminClient] = useState<boolean>(false);
  const [isCourierClient, setIsCourierClient] = useState<boolean>(false);
  const [tenantAccess, setTenantAccess] = useState<CurrentTenantAccess | null>(
    null,
  );
  const [redirectRoute, setRedirectRoute] = useState<string | null>(null);
  const [authorizationError, setAuthorizationError] =
    useState<AdminAuthErrorReason | null>(null);
  const [mfaError, setMfaError] = useState<MultiFactorError | null>(null);
  const router = useRouter();
  const tenantContext = useTenantContext();
  const [authExpiration, setAuthExpiration] = useState<number | null>(null);
  const pendingUnauthorizedRedirect = useRef<string | null>(null);
  const shownUnauthorizedReason = useRef<string | null>(null);
  const sessionSync = useRef<BrowserSessionSync | null>(null);

  const clearLocalAuthState = useCallback(() => {
    setUser(null);
    setUserInfo(null);
    setIsAdminClient(false);
    setIsSuperAdminClient(false);
    setIsCourierClient(false);
    setTenantAccess(null);
    setAuthExpiration(null);
  }, []);

  useEffect(() => {
    const sync = createBrowserSessionSync({
      app: "admin",
      onRemoteLogout: () => {
        void (async () => {
          try {
            await clearAdminPwaState();
          } catch (error) {
            console.warn(
              "[admin-sw] failed to clear PWA state during remote logout",
              error,
            );
          }

          try {
            await signOut(auth);
          } catch (error) {
            console.error("Error signing out remote admin session:", error);
          }

          try {
            await handleIdToken("", true);
          } catch (error) {
            console.error("Error revoking remote admin session:", error);
          }

          pendingUnauthorizedRedirect.current = null;
          clearLocalAuthState();
          clearStoredAdminAuthErrorReason();
          setAuthorizationError(null);
        })();
      },
    });

    sessionSync.current = sync;

    return () => {
      sync.close();
      if (sessionSync.current === sync) {
        sessionSync.current = null;
      }
    };
  }, [clearLocalAuthState]);

  // This function will always get the current pathname when called
  const getLatestPathWithToken = useCallback(
    async (
      token: string,
      revoke: boolean = false,
    ): Promise<AdminSessionRequestResult> => {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      const safeRedirect = readSafeLoginRedirect();
      const tenantContextHint = readTenantContextHint();
      const { route, usedLoginRedirect } = resolveAdminSessionRoute({
        currentPath,
        hasToken: token.length > 0,
        pathname: window.location.pathname,
        safeRedirect,
      });

      debugAdminAuthClient("handleIdToken request", {
        currentPath,
        hasToken: token.length > 0,
        revoke,
        route,
        safeRedirect,
        tenantContextHint: tenantContextHint ?? null,
      });

      const response = await handleIdToken(
        token,
        revoke,
        route,
        tenantContextHint,
      );
      debugAdminAuthClient("handleIdToken response", {
        response: summarizeAdminSessionResponse(response),
      });

      return {
        currentPath,
        response,
        route,
        usedLoginRedirect,
      };
    },
    [], // Remove pathname dependency to keep function reference stable
  );

  const getAdminAuthorizationErrorDescription = useCallback(
    (reason: AdminAuthErrorReason) => {
      switch (reason) {
        case "admin-access-required":
          return t("auth.adminAccessRequiredDescription", {
            defaultValue:
              "This Google account is authenticated, but it has not been granted Konfi admin access yet.",
          });
        case "tenant-context-required":
          return t("auth.tenantContextRequiredDescription", {
            defaultValue:
              "This admin app is running in SaaS mode, but no tenant was resolved for this domain. Configure a local tenant or open the tenant domain.",
          });
        case "tenant-membership-required":
          return t("auth.tenantMembershipRequiredDescription", {
            defaultValue:
              "This account is not assigned to this tenant yet. Create the tenant membership in Konfi Cloud, then sign in again.",
          });
        case "session-error":
          return t("auth.sessionErrorDescription", {
            defaultValue:
              "The admin session could not be created. Check the Firebase project and service account configuration.",
          });
      }
    },
    [t],
  );

  const ensureTenantContextForAuthorizedSession = useCallback(
    (response: AdminSessionResponse | undefined) => {
      const authorizedTenantId = getAuthorizedSessionTenantId(response);
      if (!authorizedTenantId) {
        return true;
      }

      if (tenantContext.tenantId !== authorizedTenantId) {
        debugAdminAuthClient("refresh tenant runtime context", {
          currentTenantId: tenantContext.tenantId ?? null,
          nextTenantId: authorizedTenantId,
        });
        router.refresh();
        return false;
      }

      return true;
    },
    [router, tenantContext.tenantId],
  );

  const handleUnauthorizedSession = useCallback(
    async (
      reason: AdminAuthErrorReason,
      redirect: string,
      uid?: string | null,
    ) => {
      const noticeKey = `${uid ?? "unknown"}:${reason}`;
      writeStoredAdminAuthErrorReason(reason);
      const redirectWithReason =
        appendCurrentAuthErrorToLoginRedirect(redirect) ?? redirect;
      pendingUnauthorizedRedirect.current = redirectWithReason;
      setAuthorizationError(reason);
      clearLocalAuthState();

      if (shownUnauthorizedReason.current !== noticeKey) {
        shownUnauthorizedReason.current = noticeKey;
        toaster.error({
          title: t("auth.noAuthorization", {
            defaultValue: "No authorization",
          }),
          description: getAdminAuthorizationErrorDescription(reason),
        });
      }

      try {
        await signOut(auth);
      } catch (error) {
        console.error("Error signing out unauthorized admin user:", error);
      }

      router.replace(redirectWithReason as Route);
    },
    [clearLocalAuthState, getAdminAuthorizationErrorDescription, router, t],
  );

  useEffect(() => {
    try {
      return auth.onIdTokenChanged(async (_user) => {
        debugAdminAuthClient("onIdTokenChanged", {
          email: _user?.email ?? null,
          hasUser: Boolean(_user),
          uid: _user?.uid ?? null,
        });
        // Only show loading overlay on first load, not on token refreshes
        if (isFirstLoad.current) {
          setLoading(true);
        }
        if (!_user) {
          clearLocalAuthState();
          setLoading(false);
          setInitialLoading(false);
          isFirstLoad.current = false;
          try {
            const pendingRedirect = pendingUnauthorizedRedirect.current;
            const shouldPreserveLoginAuthError =
              !pendingRedirect &&
              isCurrentLoginPath() &&
              Boolean(readCurrentLoginAuthError());
            pendingUnauthorizedRedirect.current = null;
            const { response } = await getLatestPathWithToken("", true);
            // Add null check before accessing redirect property
            const rawRedirect = shouldPreserveLoginAuthError
              ? null
              : (pendingRedirect ?? response?.redirect);
            const redirect = appendCurrentAuthErrorToLoginRedirect(rawRedirect);
            if (redirect) {
              router.push(redirect as Route);
            }
          } catch (error) {
            console.error("Error during token handling:", error);
          }
        } else {
          if (isCurrentLoginPath() && readGoogleAuthRedirectState()) {
            debugAdminAuthClient("defer token handling for Google redirect", {
              email: _user.email ?? null,
              uid: _user.uid,
            });
            return;
          }

          try {
            const sessionRequest = await getLatestPathWithToken(
              await _user.getIdToken(),
              false,
            );
            const { response } = sessionRequest;

            if (isUnauthorizedSessionResponse(response)) {
              await handleUnauthorizedSession(
                response.reason,
                response.redirect,
                _user.uid,
              );
              setLoading(false);
              setInitialLoading(false);
              isFirstLoad.current = false;
              return;
            }

            if (!ensureTenantContextForAuthorizedSession(response)) {
              clearLocalAuthState();
              setLoading(true);
              setInitialLoading(true);
              return;
            }

            setUser(_user);
            setUserInfo({
              displayName: _user.displayName,
              email: _user.email,
              phoneNumber: _user.phoneNumber,
              photoURL: _user.photoURL,
              providerId: _user.providerId,
              uid: _user.uid,
            });

            // Add null check before accessing redirect property
            if (response && response.redirect) {
              const currentPath = `${window.location.pathname}${window.location.search}`;
              const stalePreservedRoute =
                response.status === "authorized" &&
                response.redirect === sessionRequest.route &&
                !sessionRequest.usedLoginRedirect &&
                currentPath !== sessionRequest.currentPath;

              if (stalePreservedRoute) {
                debugAdminAuthClient("skip stale preserved auth redirect", {
                  currentPath,
                  requestedPath: sessionRequest.currentPath,
                  redirect: response.redirect,
                });
              } else if (response.redirect !== currentPath) {
                router.push(response.redirect as Route);
              }
            }
          } catch (error) {
            console.error("Error during token handling:", error);
          }
          const idTokenResult = await getIdTokenResult(_user);
          debugAdminAuthClient("client token claims", {
            accessLevel: idTokenResult.claims.accessLevel ?? null,
            admin: Boolean(idTokenResult.claims.admin),
            courier: Boolean(idTokenResult.claims.courier),
            uid: _user.uid,
          });
          setAuthExpiration(new Date(idTokenResult.expirationTime).getTime());
          if (idTokenResult.claims.admin) {
            setIsAdminClient(true);
            if (idTokenResult.claims.accessLevel === 9999) {
              setIsSuperAdminClient(true);
            } else {
              setIsSuperAdminClient(false);
            }
          } else {
            setIsAdminClient(false);
            setIsSuperAdminClient(false);
            setTenantAccess(null);
          }
          if (idTokenResult.claims.courier) {
            setIsCourierClient(true);
          } else {
            setIsCourierClient(false);
          }

          if (idTokenResult.claims.admin) {
            try {
              setTenantAccess(await getCurrentTenantAccessAction());
            } catch (error) {
              console.error("Error loading tenant access:", error);
              setTenantAccess(null);
            }
          }
        }
        setLoading(false);
        setInitialLoading(false);
        isFirstLoad.current = false;
      });
    } catch (error) {
      console.error(error);
      setUser(null);
      setUserInfo(null);
      setIsAdminClient(false);
      setIsSuperAdminClient(false);
      setIsCourierClient(false);
      setTenantAccess(null);
      setAuthExpiration(null);
      setLoading(false);
      setInitialLoading(false);
      isFirstLoad.current = false;
    }
  }, [
    clearLocalAuthState,
    ensureTenantContextForAuthorizedSession,
    getLatestPathWithToken,
    handleUnauthorizedSession,
    router,
  ]);

  const completeLogin = useCallback(
    async (
      loggedInUser: User,
      targetRoute?: string | null,
      targetTenantContextHint?: string,
    ): Promise<boolean> => {
      try {
        const route = targetRoute ?? readSafeLoginRedirect() ?? "/";
        const tenantContextHint =
          targetTenantContextHint ?? readTenantContextHint();
        debugAdminAuthClient("completeLogin start", {
          email: loggedInUser.email,
          route,
          tenantContextHint: tenantContextHint ?? null,
          uid: loggedInUser.uid,
        });
        const response = await handleIdToken(
          await loggedInUser.getIdToken(),
          false,
          route,
          tenantContextHint,
        );
        debugAdminAuthClient("completeLogin response", {
          response: summarizeAdminSessionResponse(response),
          uid: loggedInUser.uid,
        });

        if (isUnauthorizedSessionResponse(response)) {
          await handleUnauthorizedSession(
            response.reason,
            response.redirect,
            loggedInUser.uid,
          );
          return false;
        }

        if (!ensureTenantContextForAuthorizedSession(response)) {
          clearLocalAuthState();
          setLoading(true);
          setInitialLoading(true);
          return false;
        }

        toaster.success({
          title: t("auth.loggedIn", { defaultValue: "Logged in" }),
          description: t("auth.loggedInDescription", {
            defaultValue: "You have been logged into your account",
          }),
        });
        clearStoredAdminAuthErrorReason();
        setAuthorizationError(null);
        setUser(loggedInUser);
        // Add null check before accessing redirect property
        if (response && response.redirect) {
          router.push(response.redirect as Route);
        }
        return true;
      } catch (error) {
        console.error("Error during token handling in login:", error);
        return false;
      }
    },
    [
      clearLocalAuthState,
      ensureTenantContextForAuthorizedSession,
      handleUnauthorizedSession,
      router,
      t,
    ],
  );

  const getGoogleLoginErrorDescription = useCallback(
    (errorCode: string | undefined, errorDetail?: string) => {
      switch (errorCode) {
        case "auth/operation-not-allowed":
          return t("auth.googleLoginProviderDisabled", {
            defaultValue: "Google sign-in is not enabled in Firebase Auth.",
          });
        case "auth/unauthorized-domain":
          return t("auth.googleLoginUnauthorizedDomain", {
            defaultValue:
              "This domain is not authorized in Firebase Auth settings.",
          });
        case "auth/popup-blocked":
          return t("auth.googleLoginPopupBlocked", {
            defaultValue:
              "The browser blocked the Google sign-in popup. Allow popups and try again.",
          });
        case "auth/account-exists-with-different-credential":
          return t("auth.googleLoginAccountExists", {
            defaultValue:
              "An account already exists with the same email and a different sign-in method.",
          });
        case "auth/argument-error":
          return t("auth.googleLoginArgumentError", {
            defaultValue:
              "Google sign-in is configured with invalid provider options.",
          });
        case "auth/internal-error":
          return t("auth.googleLoginInternalError", {
            defaultValue:
              "Google sign-in failed inside Firebase Auth. Details: {{detail}}",
            detail: errorDetail ?? "unknown",
          });
        default:
          return t("auth.googleLoginErrorWithCode", {
            defaultValue:
              "Could not sign in with Google. Firebase error: {{code}}",
            code: errorCode ?? "unknown",
          });
      }
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;

    const handleGoogleRedirectResult = async () => {
      const redirectState = readGoogleAuthRedirectState();

      if (!redirectState) {
        return;
      }

      try {
        setActionLoading(true);
        debugAdminAuthClient("google redirect result start", {
          redirectRoute: redirectState.redirectRoute,
        });
        const redirectResult = await getRedirectResult(auth);

        if (cancelled) {
          return;
        }

        clearGoogleAuthRedirectState();

        const fallbackCurrentUser = redirectResult?.user
          ? null
          : getRecentGoogleRedirectCurrentUser();
        const loggedInUser = redirectResult?.user ?? fallbackCurrentUser;
        debugAdminAuthClient("google redirect result", {
          currentUserUid: auth.currentUser?.uid ?? null,
          hasRecentCurrentUserFallback: Boolean(fallbackCurrentUser),
          hasCurrentUser: Boolean(auth.currentUser),
          hasRedirectUser: Boolean(redirectResult?.user),
          redirectUserUid: redirectResult?.user.uid ?? null,
        });

        if (loggedInUser) {
          const completed = await completeLogin(
            loggedInUser,
            redirectState.redirectRoute,
            redirectState.tenantContextHint,
          );
          if (completed) {
            setLoading(false);
            setInitialLoading(false);
            isFirstLoad.current = false;
          }
          return;
        }

        const reason: AdminAuthErrorReason = "session-error";
        debugAdminAuthClient("google redirect missing user", {
          reason,
          redirectRoute: redirectState.redirectRoute,
        });
        writeStoredAdminAuthErrorReason(reason);
        setAuthorizationError(reason);
        setLoading(false);
        setInitialLoading(false);
        isFirstLoad.current = false;
        toaster.error({
          title: t("auth.loginError", { defaultValue: "Login error" }),
          description: getAdminAuthorizationErrorDescription(reason),
        });

        const redirect =
          appendCurrentAuthErrorToLoginRedirect(window.location.pathname) ??
          window.location.pathname;
        router.replace(redirect as Route);
      } catch (error) {
        if (cancelled) {
          return;
        }

        clearGoogleAuthRedirectState();
        const errorCode = getFirebaseAuthErrorCode(error);
        const errorDetail = getFirebaseAuthErrorDetail(error);
        if (errorCode === "auth/multi-factor-auth-required") {
          setMfaError(error as MultiFactorError);
          setLoading(false);
          setInitialLoading(false);
          isFirstLoad.current = false;
          return;
        }
        console.error("Google redirect sign-in failed", {
          code: errorCode,
          detail: errorDetail,
          error,
        });
        setLoading(false);
        setInitialLoading(false);
        isFirstLoad.current = false;
        toaster.error({
          title: t("auth.loginError", { defaultValue: "Login error" }),
          description: getGoogleLoginErrorDescription(errorCode, errorDetail),
        });
      } finally {
        if (!cancelled) {
          setActionLoading(false);
        }
      }
    };

    void handleGoogleRedirectResult();

    return () => {
      cancelled = true;
    };
  }, [
    completeLogin,
    getAdminAuthorizationErrorDescription,
    getGoogleLoginErrorDescription,
    router,
    t,
  ]);

  const login = useCallback(
    async (
      email: string,
      password: string,
      remember: boolean,
    ): Promise<LoginResult | void> => {
      try {
        setActionLoading(true);
        clearStoredAdminAuthErrorReason();
        setAuthorizationError(null);
        await auth.setPersistence(
          remember ? browserLocalPersistence : browserSessionPersistence,
        );
        const userCredentials = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await completeLogin(userCredentials.user);
        setActionLoading(false);
        // await saveMessagingDeviceToken(userCredentials.user.uid);
      } catch (error) {
        setActionLoading(false);
        // Check if this is an MFA required error using Firebase Auth error code
        const errorCode = getFirebaseAuthErrorCode(error);
        if (errorCode === "auth/multi-factor-auth-required") {
          // Store the MFA error for the verification dialog
          setMfaError(error as MultiFactorError);
          return { mfaRequired: true };
        }
        console.error(error);
        toaster.error({
          title: t("auth.loginError", { defaultValue: "Login error" }),
          description: t("auth.invalidCredentials", {
            defaultValue: "Invalid email or password",
          }),
        });
      }
    },
    [completeLogin, t],
  );

  const loginWithGoogle = useCallback(
    async (remember: boolean): Promise<LoginResult | void> => {
      try {
        setActionLoading(true);
        clearStoredAdminAuthErrorReason();
        setAuthorizationError(null);
        await auth.setPersistence(
          remember ? browserLocalPersistence : browserSessionPersistence,
        );
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const googleRedirectRoute =
          readSafeLoginRedirect() ?? redirectRoute ?? "/";
        const tenantContextHint = readTenantContextHint();
        const usePopup = shouldUseGooglePopup();
        debugAdminAuthClient("google sign-in start", {
          authDomain: auth.app.options.authDomain ?? null,
          method: usePopup ? "popup" : "redirect",
          projectId: auth.app.options.projectId ?? null,
          redirectRoute: googleRedirectRoute,
          remember,
          tenantContextHint: tenantContextHint ?? null,
        });

        if (usePopup) {
          try {
            const userCredentials = await signInWithPopup(auth, provider);
            debugAdminAuthClient("google popup result", {
              email: userCredentials.user.email,
              uid: userCredentials.user.uid,
            });
            await completeLogin(
              userCredentials.user,
              googleRedirectRoute,
              tenantContextHint,
            );
            setActionLoading(false);
            return;
          } catch (error) {
            const errorCode = getFirebaseAuthErrorCode(error);
            if (!shouldFallbackToGoogleRedirect(errorCode)) {
              throw error;
            }

            debugAdminAuthClient("google popup fallback to redirect", {
              code: errorCode,
              redirectRoute: googleRedirectRoute,
            });
          }
        }

        writeGoogleAuthRedirectState({
          redirectRoute: googleRedirectRoute,
          ...(tenantContextHint ? { tenantContextHint } : {}),
        });
        await signInWithRedirect(auth, provider);
      } catch (error) {
        setActionLoading(false);
        const errorCode = getFirebaseAuthErrorCode(error);
        const errorDetail = getFirebaseAuthErrorDetail(error);
        if (errorCode === "auth/multi-factor-auth-required") {
          setMfaError(error as MultiFactorError);
          return { mfaRequired: true };
        }
        if (
          errorCode === "auth/popup-closed-by-user" ||
          errorCode === "auth/cancelled-popup-request"
        ) {
          return;
        }
        clearGoogleAuthRedirectState();
        console.error("Google sign-in failed", {
          code: errorCode,
          detail: errorDetail,
          error,
        });
        toaster.error({
          title: t("auth.loginError", { defaultValue: "Login error" }),
          description: getGoogleLoginErrorDescription(errorCode, errorDetail),
        });
      }
    },
    [completeLogin, getGoogleLoginErrorDescription, redirectRoute, t],
  );

  const clearMfaError = useCallback(() => {
    setMfaError(null);
  }, []);

  const onMfaSuccess = useCallback(() => {
    setMfaError(null);
    toaster.success({
      title: t("auth.loggedIn", { defaultValue: "Logged in" }),
      description: t("auth.loggedInDescription", {
        defaultValue: "You have been logged into your account",
      }),
    });
  }, [t]);

  const logout = useCallback(async () => {
    try {
      setActionLoading(true);
      try {
        await clearAdminPwaState();
      } catch (error) {
        console.warn(
          "[admin-sw] failed to clear PWA state during logout",
          error,
        );
      }
      await signOut(auth);
      try {
        await handleIdToken("", true);
        // No need to handle redirect here as it's managed by onIdTokenChanged
      } catch (error) {
        console.error("Error during token handling in logout:", error);
      }
      setUser(null);
      setIsAdminClient(false);
      setIsSuperAdminClient(false);
      setIsCourierClient(false);
      clearStoredAdminAuthErrorReason();
      setAuthorizationError(null);
      sessionSync.current?.notifyLogout();
      setActionLoading(false);
      toaster.success({
        title: t("auth.loggedOut", { defaultValue: "Logged out" }),
        description: t("auth.loggedOutDescription", {
          defaultValue: "You have been logged out of your account",
        }),
      });
    } catch (error) {
      console.error(error);
      setActionLoading(false);
    }
  }, [t]);

  const passwordChange = useCallback(
    async (oldPassword: string, newPassword: string) => {
      const currentUser = auth.currentUser;
      if (currentUser && !currentUser.isAnonymous) {
        try {
          setActionLoading(true);
          if (isNull(currentUser.email)) {
            console.error("User email is missing");
            return;
          }
          await reauthenticateWithCredential(
            currentUser,
            EmailAuthProvider.credential(currentUser.email, oldPassword),
          );
          await updatePassword(currentUser, newPassword);
          toaster.success({
            title: t("auth.passwordChanged", { defaultValue: "Saved!" }),
            description: t("auth.passwordChangedDescription", {
              defaultValue: "Password has been changed",
            }),
          });
          setActionLoading(false);
        } catch (error) {
          console.error(error);
          setActionLoading(false);
        }
      }
    },
    [t],
  );

  const redirect = useCallback(async (route: string) => {
    setRedirectRoute(route);
  }, []);

  const hasTenantPermission = useCallback(
    (permission: TenantPermission) => {
      if (isSuperAdminClient) {
        return true;
      }

      if (!tenantAccess) {
        return false;
      }

      return (
        tenantAccess.isLegacyFullAccess ||
        tenantAccess.permissions.includes(permission)
      );
    },
    [isSuperAdminClient, tenantAccess],
  );

  const hasTenantWidePermission = useCallback(
    (permission: TenantPermission) => {
      if (isSuperAdminClient) {
        return true;
      }

      return (
        tenantAccess?.hasFullTenantScope === true &&
        hasTenantPermission(permission)
      );
    },
    [hasTenantPermission, isSuperAdminClient, tenantAccess?.hasFullTenantScope],
  );

  const value = useMemo(
    () => ({
      loading,
      initialLoading,
      actionLoading,
      user,
      userInfo,
      isAdminClient,
      isSuperAdminClient,
      isCourierClient,
      tenantAccess,
      redirectRoute,
      authExpiration,
      authorizationError,
      mfaError,
      login,
      loginWithGoogle,
      logout,
      redirect,
      hasTenantPermission,
      hasTenantWidePermission,
      passwordChange,
      clearMfaError,
      onMfaSuccess,
    }),
    [
      actionLoading,
      authExpiration,
      authorizationError,
      clearMfaError,
      hasTenantPermission,
      hasTenantWidePermission,
      initialLoading,
      isAdminClient,
      isCourierClient,
      isSuperAdminClient,
      loading,
      login,
      loginWithGoogle,
      logout,
      mfaError,
      onMfaSuccess,
      passwordChange,
      redirect,
      redirectRoute,
      tenantAccess,
      user,
      userInfo,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext);

export { AuthProvider, useAuth };
