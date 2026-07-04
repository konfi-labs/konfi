"use client";

import { handleCustomerIdToken } from "@/actions";
import { useT } from "@/i18n/client";
import { analytics, auth, firestore } from "@/lib/firebase/clientApp";
import { canUseGoogleRedirectCurrentUser } from "@/lib/google-auth-flow";
import { initDoc } from "@/lib/helpers";
import { toaster } from "@konfi/components";
import { tenantFirestorePaths } from "@konfi/firebase";
import { Customer } from "@konfi/types";
import {
  createBrowserSessionSync,
  type BrowserSessionSync,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { logEvent } from "firebase/analytics";
import { AppCheckTokenResult } from "firebase/app-check";
import { EmailAuthProvider, MultiFactorError, User } from "firebase/auth";
import { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTenantContext } from "./tenant";

const GOOGLE_AUTH_REDIRECT_KEY = "store-google-auth-redirect";

type GoogleAuthRedirectState = {
  mode: "link" | "sign-in";
  redirectRoute: string;
};

function isGooglePopupUnsupportedBrowser() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent;

  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1)
  );
}

function readGoogleAuthRedirectState(): GoogleAuthRedirectState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(GOOGLE_AUTH_REDIRECT_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as GoogleAuthRedirectState;
  } catch (error) {
    console.error("Failed to parse Google auth redirect state:", error);
    window.sessionStorage.removeItem(GOOGLE_AUTH_REDIRECT_KEY);
    return null;
  }
}

function writeGoogleAuthRedirectState(state: GoogleAuthRedirectState) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    GOOGLE_AUTH_REDIRECT_KEY,
    JSON.stringify(state),
  );
}

function clearGoogleAuthRedirectState() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(GOOGLE_AUTH_REDIRECT_KEY);
}

function hasPendingGoogleAuthRedirect() {
  return Boolean(readGoogleAuthRedirectState());
}

function getRecentGoogleRedirectCurrentUser(
  mode: GoogleAuthRedirectState["mode"],
) {
  const currentUser = auth.currentUser;
  if (
    currentUser &&
    canUseGoogleRedirectCurrentUser({
      isAnonymous: currentUser.isAnonymous,
      lastSignInTime: currentUser.metadata.lastSignInTime,
      mode,
      providerIds: currentUser.providerData.map(
        (provider) => provider.providerId,
      ),
    })
  ) {
    return currentUser;
  }

  return null;
}

function readSafeLoginRedirect(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window.location.pathname.includes("/auth/login")) {
    return null;
  }

  const redirect = new URLSearchParams(window.location.search).get("redirect");
  return redirect?.startsWith("/") && !redirect.startsWith("//")
    ? redirect
    : null;
}

async function syncCustomerSessionCookie(user: User | null): Promise<void> {
  try {
    if (!user) {
      await handleCustomerIdToken("", true);
      return;
    }

    await handleCustomerIdToken(await user.getIdToken(), false);
  } catch (error) {
    console.error("Error syncing customer session cookie:", error);
  }
}

interface LoginResult {
  mfaRequired?: boolean;
}

interface IAuth {
  loading: boolean;
  user: User | null;
  customer: Customer | null;
  redirectRoute: string | null;
  appCheckToken: AppCheckTokenResult | null;
  mfaError: MultiFactorError | null;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  login: (email: string, password: string) => Promise<LoginResult | void>;
  loginWithGoogle: () => Promise<LoginResult | void>;
  loginAsGuest: (
    addToCart: (_user: User, newItem?: boolean) => Promise<boolean | string>,
  ) => Promise<void>;
  logout: () => Promise<void>;
  forgot: (email: string) => Promise<void>;
  passwordChange: (oldPassword: string, newPassword: string) => Promise<void>;
  redirect: (route: string) => void;
  removeAccount: (password?: string) => Promise<void>;
  clearMfaError: () => void;
  onMfaSuccess: () => void;
}

const AuthContext = createContext<IAuth>({
  loading: true,
  user: null,
  customer: null,
  redirectRoute: null,
  appCheckToken: null,
  mfaError: null,
  register: () => new Promise<void>(() => {}),
  login: () => new Promise<void>(() => {}),
  loginWithGoogle: () => new Promise<void>(() => {}),
  loginAsGuest: () => new Promise<void>(() => {}),
  logout: () => new Promise<void>(() => {}),
  forgot: () => new Promise<void>(() => {}),
  passwordChange: () => new Promise<void>(() => {}),
  redirect: () => new Promise<void>(() => {}),
  removeAccount: () => new Promise<void>(() => {}),
  clearMfaError: () => {},
  onMfaSuccess: () => {},
});

const AuthProvider = ({
  children,
  appCheckToken,
}: {
  children: React.ReactNode;
  appCheckToken: AppCheckTokenResult | null;
}) => {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [redirectRoute, setRedirectRoute] = useState<string | null>("");
  const [mfaError, setMfaError] = useState<MultiFactorError | null>(null);
  const router = useRouter();
  const params = useParams();
  const lng = (params?.lng as string) || "en";
  const customerCollectionPath = useMemo(
    () => tenantFirestorePaths.customersCollection(tenantContext),
    [
      tenantContext.deploymentMode,
      tenantContext.requireTenantId,
      tenantContext.tenantId,
    ],
  );
  const noCustomerDataMessage = t("auth.noCustomerData", {
    defaultValue: "No customer data",
  });
  const sessionSync = useRef<BrowserSessionSync | null>(null);

  useEffect(() => {
    const sync = createBrowserSessionSync({
      app: "store",
      onRemoteLogout: () => {
        void (async () => {
          try {
            const signOut = (await import("firebase/auth")).signOut;
            await signOut(auth);
          } catch (error) {
            console.error("Error signing out remote store session:", error);
          }

          await syncCustomerSessionCookie(null);
          setUser(null);
          setCustomer(null);
          setLoading(false);
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
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    const unsubscribe = auth.onIdTokenChanged(async (user) => {
      if (!user) {
        await syncCustomerSessionCookie(null);
        if (cancelled) {
          return;
        }
        setUser(null);
        setCustomer(null);
      } else {
        if (
          typeof window !== "undefined" &&
          window.location.pathname.includes("/auth/login") &&
          hasPendingGoogleAuthRedirect()
        ) {
          return;
        }

        await syncCustomerSessionCookie(user);
        if (cancelled) {
          return;
        }
        setUser(user);
        initDoc(
          firestore,
          setLoading,
          customerCollectionPath,
          user.uid,
          setCustomer,
          noCustomerDataMessage,
        );
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [customerCollectionPath, noCustomerDataMessage]);

  // Force refresh token every 10 minutes
  useEffect(() => {
    const handle = setInterval(
      async () => {
        try {
          if (user) await user.getIdToken(true);
        } catch (error) {
          console.error(error);
        }
      },
      10 * 60 * 1000,
    );

    return () => clearInterval(handle);
  }, [user]);

  const redirectAfterLogin = (targetRoute?: string | null) => {
    const nextRoute = targetRoute ?? readSafeLoginRedirect() ?? redirectRoute;

    if (nextRoute) {
      router.replace(nextRoute as Route);
      setRedirectRoute(null);
      return;
    }

    router.replace(`/${lng}`);
  };

  const notifySuccessfulLogin = (targetRoute?: string | null) => {
    toaster.success({
      title: t("login.success", { defaultValue: "Logged in." }),
      description: t("login.successDescription", {
        defaultValue: "You have been logged into your account.",
      }),
    });
    redirectAfterLogin(targetRoute);
  };

  useEffect(() => {
    let cancelled = false;

    const handleGoogleRedirectResult = async () => {
      const redirectState = readGoogleAuthRedirectState();

      if (!redirectState) {
        return;
      }

      try {
        setLoading(true);

        const { getAdditionalUserInfo, getRedirectResult } =
          await import("firebase/auth");
        const redirectResult = await getRedirectResult(auth);

        if (cancelled) {
          return;
        }

        clearGoogleAuthRedirectState();

        if (!redirectResult) {
          const fallbackCurrentUser = getRecentGoogleRedirectCurrentUser(
            redirectState.mode,
          );

          if (fallbackCurrentUser) {
            await syncCustomerSessionCookie(fallbackCurrentUser);
            notifySuccessfulLogin(redirectState.redirectRoute);
          }
          return;
        }

        const isNewUser =
          getAdditionalUserInfo(redirectResult)?.isNewUser ?? false;

        if (!isUndefined(analytics)) {
          if (isNewUser) {
            logEvent(analytics, "sign_up");
          } else {
            logEvent(analytics, "login");
          }
        }

        await syncCustomerSessionCookie(redirectResult.user);
        notifySuccessfulLogin(redirectState.redirectRoute);
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }

        clearGoogleAuthRedirectState();
        console.error(error);

        const firebaseError = error as { code?: string };

        if (firebaseError.code === "auth/multi-factor-auth-required") {
          setMfaError(error as MultiFactorError);
          return;
        }

        let errorMessage: string;
        switch (firebaseError.code) {
          case "auth/account-exists-with-different-credential":
            errorMessage = t("auth.google.accountExistsWithDifferentProvider", {
              defaultValue:
                "An account with this email already exists. Sign in with your existing method to continue.",
            });
            break;
          case "auth/credential-already-in-use":
            errorMessage = t("auth.google.credentialAlreadyInUse", {
              defaultValue:
                "This Google account is already linked to another profile. Sign in with Google to continue.",
            });
            break;
          case "auth/operation-not-allowed":
            errorMessage = t("auth.google.notEnabled", {
              defaultValue: "Google sign-in isn't enabled for this store yet.",
            });
            break;
          case "auth/popup-blocked":
            errorMessage = t("auth.google.popupBlocked", {
              defaultValue:
                "Google sign-in was blocked by your browser. Allow pop-ups and try again.",
            });
            break;
          case "auth/unauthorized-domain":
            errorMessage = t("auth.google.unauthorizedDomain", {
              defaultValue:
                "This domain isn't authorized for Google sign-in yet.",
            });
            break;
          case "auth/operation-not-supported-in-this-environment":
          case "auth/web-storage-unsupported":
            errorMessage = t("auth.google.unavailable", {
              defaultValue:
                "Google sign-in is unavailable right now. Please try again later.",
            });
            break;
          default:
            errorMessage = t("auth.unknownError", {
              defaultValue:
                "Something went wrong, please contact the administrator. Error code: {{errorCode}}",
              errorCode: firebaseError.code,
            });
            break;
        }

        toaster.error({
          title: t("common.error", { defaultValue: "Error!" }),
          description: errorMessage,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void handleGoogleRedirectResult();

    return () => {
      cancelled = true;
    };
  }, [t, redirectRoute, lng, router]);

  const register = async (
    email: string,
    password: string,
    displayName: string,
  ) => {
    try {
      setLoading(true);
      const sendEmailVerification = (await import("firebase/auth"))
        .sendEmailVerification;
      const updateProfile = (await import("firebase/auth")).updateProfile;
      if (!auth.currentUser?.isAnonymous) {
        const createUserWithEmailAndPassword = (await import("firebase/auth"))
          .createUserWithEmailAndPassword;
        const userCredentials = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        if (!isUndefined(analytics)) {
          logEvent(analytics, "sign_up");
        }
        await updateProfile(userCredentials.user, { displayName });
        await sendEmailVerification(userCredentials.user);
      } else {
        const userCredentials = EmailAuthProvider.credential(email, password);
        const linkWithCredential = (await import("firebase/auth"))
          .linkWithCredential;
        await linkWithCredential(auth.currentUser, userCredentials);
        await updateProfile(auth.currentUser, { displayName });
        await sendEmailVerification(auth.currentUser);
      }
      await syncCustomerSessionCookie(auth.currentUser);
      toaster.success({
        title: t("account.created", { defaultValue: "Account created." }),
        description: t("account.createdDescription", {
          defaultValue: "We have created an account for you.",
        }),
      });
      toaster.success({
        title: t("account.confirmEmail", {
          defaultValue: "Confirm email address.",
        }),
        description: t("account.confirmEmailDescription", {
          defaultValue:
            "A verification link has been sent to the provided email address.",
        }),
      });
      router.replace(`/${lng}`);
      setLoading(false);
    } catch (error: any) {
      console.error(error);
      const errorCode = error.code;
      let errorMessage: string;
      switch (errorCode) {
        case "auth/weak-password":
          errorMessage = t("auth.weakPassword", {
            defaultValue: "Password should have at least 6 characters.",
          });
          break;
        case "auth/email-already-exists":
          errorMessage = t("auth.emailAlreadyExists", {
            defaultValue: "An account with the provided email already exists.",
          });
          break;
        default:
          errorMessage = t("auth.unknownError", {
            defaultValue:
              "Something went wrong, please contact the administrator. Error code: {{errorCode}}",
            errorCode,
          });
          break;
      }
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: errorMessage,
      });
      setLoading(false);
    }
  };

  const login = async (
    email: string,
    password: string,
  ): Promise<LoginResult | void> => {
    try {
      setLoading(true);
      const signInWithEmailAndPassword = (await import("firebase/auth"))
        .signInWithEmailAndPassword;
      const userCredentials = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await syncCustomerSessionCookie(userCredentials.user);
      if (!isUndefined(analytics)) {
        logEvent(analytics, "login");
      }
      notifySuccessfulLogin();
      setLoading(false);
    } catch (error: unknown) {
      console.error(error);
      // Check if this is an MFA required error
      const firebaseError = error as { code?: string };
      if (firebaseError.code === "auth/multi-factor-auth-required") {
        setMfaError(error as MultiFactorError);
        setLoading(false);
        return { mfaRequired: true };
      }
      const errorCode = firebaseError.code;
      let errorMessage: string;
      switch (errorCode) {
        case "auth/invalid-credential":
          errorMessage = t("auth.invalidCredentials", {
            defaultValue: "Invalid credentials.",
          });
          break;
        case "auth/user-disabled":
          errorMessage = t("auth.accountDisabled", {
            defaultValue: "Account has been disabled.",
          });
          break;
        case "auth/email-already-exists":
          errorMessage = t("auth.emailAlreadyExists", {
            defaultValue: "An account with the provided email already exists.",
          });
          break;
        case "auth/internal-error":
          errorMessage = t("auth.internalError", {
            defaultValue:
              "Something went wrong, please contact the administrator.",
          });
          break;
        default:
          errorMessage = t("auth.unknownError", {
            defaultValue:
              "Something went wrong, please contact the administrator. Error code: {{errorCode}}",
            errorCode,
          });
          break;
      }
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: errorMessage,
      });
      setLoading(false);
    }
  };

  const loginWithGoogle = async (): Promise<LoginResult | void> => {
    try {
      setLoading(true);
      const {
        GoogleAuthProvider,
        linkWithRedirect,
        getAdditionalUserInfo,
        signInWithRedirect,
        linkWithPopup,
        signInWithPopup,
      } = await import("firebase/auth");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      auth.languageCode = lng;
      const currentUser = auth.currentUser;
      const redirectDestination =
        readSafeLoginRedirect() || redirectRoute || `/${lng}`;

      if (isGooglePopupUnsupportedBrowser()) {
        writeGoogleAuthRedirectState({
          mode: currentUser?.isAnonymous ? "link" : "sign-in",
          redirectRoute: redirectDestination,
        });

        if (currentUser?.isAnonymous) {
          await linkWithRedirect(currentUser, provider);
        } else {
          await signInWithRedirect(auth, provider);
        }

        return;
      }

      const userCredentials = currentUser?.isAnonymous
        ? await (async () => {
            try {
              return await linkWithPopup(currentUser, provider);
            } catch (error: unknown) {
              const firebaseError = error as { code?: string };

              if (firebaseError.code !== "auth/credential-already-in-use") {
                throw error;
              }

              return signInWithPopup(auth, provider);
            }
          })()
        : await signInWithPopup(auth, provider);

      const isNewUser =
        getAdditionalUserInfo(userCredentials)?.isNewUser ?? false;

      if (!isUndefined(analytics)) {
        if (isNewUser) {
          logEvent(analytics, "sign_up");
        } else {
          logEvent(analytics, "login");
        }
      }

      await syncCustomerSessionCookie(userCredentials.user);
      notifySuccessfulLogin();
    } catch (error: unknown) {
      console.error(error);
      const firebaseError = error as { code?: string };

      if (firebaseError.code === "auth/multi-factor-auth-required") {
        setMfaError(error as MultiFactorError);
        return { mfaRequired: true };
      }

      if (
        firebaseError.code === "auth/popup-closed-by-user" ||
        firebaseError.code === "auth/cancelled-popup-request"
      ) {
        return;
      }

      let errorMessage: string;
      switch (firebaseError.code) {
        case "auth/account-exists-with-different-credential":
          errorMessage = t("auth.google.accountExistsWithDifferentProvider", {
            defaultValue:
              "An account with this email already exists. Sign in with your existing method to continue.",
          });
          break;
        case "auth/credential-already-in-use":
          errorMessage = t("auth.google.credentialAlreadyInUse", {
            defaultValue:
              "This Google account is already linked to another profile. Sign in with Google to continue.",
          });
          break;
        case "auth/operation-not-allowed":
          errorMessage = t("auth.google.notEnabled", {
            defaultValue: "Google sign-in isn't enabled for this store yet.",
          });
          break;
        case "auth/popup-blocked":
          errorMessage = t("auth.google.popupBlocked", {
            defaultValue:
              "Google sign-in was blocked by your browser. Allow pop-ups and try again.",
          });
          break;
        case "auth/unauthorized-domain":
          errorMessage = t("auth.google.unauthorizedDomain", {
            defaultValue:
              "This domain isn't authorized for Google sign-in yet.",
          });
          break;
        case "auth/operation-not-supported-in-this-environment":
        case "auth/web-storage-unsupported":
          errorMessage = t("auth.google.unavailable", {
            defaultValue:
              "Google sign-in is unavailable right now. Please try again later.",
          });
          break;
        default:
          errorMessage = t("auth.unknownError", {
            defaultValue:
              "Something went wrong, please contact the administrator. Error code: {{errorCode}}",
            errorCode: firebaseError.code,
          });
          break;
      }

      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const loginAsGuest = async (
    addToCart: (_user: User, newItem?: boolean) => Promise<boolean | string>,
  ) => {
    try {
      setLoading(true);
      const signInAnonymously = (await import("firebase/auth"))
        .signInAnonymously;
      const userCredentials = await signInAnonymously(auth);
      if (!isUndefined(analytics)) {
        logEvent(analytics, "login");
      }
      if (addToCart) {
        await addToCart(userCredentials.user, false);
      }
      toaster.success({
        title: t("login.success", { defaultValue: "Logged in." }),
        description: t("login.guestSuccess", {
          defaultValue: "You have been logged in as a guest.",
        }),
      });
      setLoading(false);
    } catch (error: any) {
      console.error(error);
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    const signOut = (await import("firebase/auth")).signOut;
    await signOut(auth);
    await syncCustomerSessionCookie(null);
    setUser(null);
    setCustomer(null);
    sessionSync.current?.notifyLogout();
    setLoading(false);
    toaster.success({
      title: t("logout.success", { defaultValue: "Logged out." }),
      description: t("logout.successDescription", {
        defaultValue: "You have been logged out of your account.",
      }),
    });
  };

  const forgot = async (email: string) => {
    setLoading(true);
    try {
      const sendPasswordResetEmail = (await import("firebase/auth"))
        .sendPasswordResetEmail;
      await sendPasswordResetEmail(auth, email);
      setLoading(false);
      toaster.success({
        title: t("forgot_password.sent", {
          defaultValue: "Message has been sent.",
        }),
        description: t("forgot_password.sentDescription", {
          defaultValue:
            "A password reset link has been sent to the provided email address.",
        }),
      });
    } catch (error: any) {
      setLoading(false);
      console.error(error);
      const errorCode = error.code;
      let errorMessage: string;
      switch (errorCode) {
        case "auth/invalid-email":
          errorMessage = t("auth.accountNotFound", {
            defaultValue:
              "Account with the provided email address does not exist.",
          });
          break;
        default:
          errorMessage = t("auth.unknownError", {
            defaultValue:
              "Something went wrong, please contact the administrator. Error code: {{errorCode}}",
            errorCode,
          });
          break;
      }
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: errorMessage,
      });
    }
  };

  const passwordChange = async (oldPassword: string, newPassword: string) => {
    const user = auth.currentUser;
    if (user && !user.isAnonymous) {
      try {
        setLoading(true);
        if (isNull(user.email)) {
          console.error("User email is missing");
          return;
        }
        const reauthenticateWithCredential = (await import("firebase/auth"))
          .reauthenticateWithCredential;
        await reauthenticateWithCredential(
          user,
          EmailAuthProvider.credential(user.email, oldPassword),
        );
        const updatePassword = (await import("firebase/auth")).updatePassword;
        await updatePassword(user, newPassword);
        toaster.success({
          title: t("saved", { defaultValue: "Saved!" }),
          description: t("password.changed", {
            defaultValue: "Password has been changed.",
          }),
        });
        setLoading(false);
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    }
  };

  const redirect = async (route: string) => {
    setRedirectRoute(route);
  };

  const removeAccount = async (password?: string) => {
    const user = auth.currentUser;
    if (user) {
      try {
        setLoading(true);
        const deleteUser = (await import("firebase/auth")).deleteUser;
        if (user.isAnonymous) {
          await deleteUser(user);
        } else {
          if (isNull(user.email)) {
            console.error("User email is missing");
            return;
          }

          if (isUndefined(password)) {
            console.error("Password is missing");
            return;
          }
          const reauthenticateWithCredential = (await import("firebase/auth"))
            .reauthenticateWithCredential;
          await reauthenticateWithCredential(
            user,
            EmailAuthProvider.credential(user.email, password),
          );
          await deleteUser(user);
        }
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    }
  };

  const clearMfaError = () => {
    setMfaError(null);
  };

  const onMfaSuccess = () => {
    void (async () => {
      setMfaError(null);
      await syncCustomerSessionCookie(auth.currentUser);
      notifySuccessfulLogin();
    })();
  };

  return (
    <AuthContext.Provider
      value={{
        loading,
        user,
        customer,
        redirectRoute,
        appCheckToken,
        mfaError,
        register,
        login,
        loginWithGoogle,
        loginAsGuest,
        logout,
        forgot,
        passwordChange,
        redirect,
        removeAccount,
        clearMfaError,
        onMfaSuccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => useContext(AuthContext);

export { AuthProvider, useAuth };
