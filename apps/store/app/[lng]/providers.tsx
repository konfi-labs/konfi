"use client";

import Cookies from "@/components/layout/Cookies";
import { AuthProvider } from "@/context/auth";
import { CartProvider } from "@/context/cart";
import { StoreCurrencyProvider } from "@/context/currency";
import { OrdersProvider } from "@/context/orders";
import { StoreRuntimeConfigProvider } from "@/context/runtime-config";
import { StoreTenantProvider } from "@/context/tenant";
import {
  getStoreAppCheckToken,
  initFirestore,
  initStorage,
} from "@/lib/firebase/clientApp";
import {
  readRuntimeString,
  type StoreRuntimeConfig,
} from "@/lib/runtime-config";
import { InpostGeowidgetTokenProvider, Toaster } from "@konfi/components";
import { swrConfig } from "@konfi/utils";
import { ProgressProvider } from "@bprogress/next/app";
import type { CurrencySettings } from "@konfi/types";
import type { AppCheckTokenResult } from "firebase/app-check";
import { useEffect, useState } from "react";
import { SWRConfig } from "swr";

declare global {
  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN: string;
    __getKonfiAppCheckToken?: () => Promise<string | null>;
  }
}

if (
  typeof window !== "undefined" &&
  typeof self !== "undefined" &&
  process.env.NODE_ENV === "development"
) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN =
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_STORE ?? "";
}

export function Providers({
  children,
  currencySettings,
  runtimeConfig,
}: {
  children: React.ReactNode;
  currencySettings?: CurrencySettings | null;
  runtimeConfig: StoreRuntimeConfig;
}) {
  const [appCheckToken, setAppCheckToken] =
    useState<AppCheckTokenResult | null>(null);
  const progressColor =
    readRuntimeString(runtimeConfig.branding, "mainColor", "primaryColor") ??
    process.env.NEXT_PUBLIC_COMPANY_MAIN_COLOR ??
    "#06f";

  if (typeof window !== "undefined") {
    try {
      initFirestore();
      initStorage();
    } catch {
      // Some Firebase services may still be registering during bootstrap.
      // The client app retries initialization after the current tick.
    }
  }

  useEffect(() => {
    let isMounted = true;

    getStoreAppCheckToken().then((token) => {
      if (isMounted) {
        setAppCheckToken(token);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.__getKonfiAppCheckToken = async () => {
      const token = await getStoreAppCheckToken();
      return token?.token ?? appCheckToken?.token ?? null;
    };

    return () => {
      delete window.__getKonfiAppCheckToken;
    };
  }, [appCheckToken]);

  return (
    <ProgressProvider
      color={progressColor}
      height={"4px"}
      options={{ showSpinner: false }}
      shallowRouting
    >
      <>
        <Toaster />
        <SWRConfig value={swrConfig}>
          <StoreRuntimeConfigProvider runtimeConfig={runtimeConfig}>
            <InpostGeowidgetTokenProvider
              token={runtimeConfig.inpost?.geowidgetToken}
            >
              <StoreTenantProvider tenantContext={runtimeConfig.tenantContext}>
                <StoreCurrencyProvider currencySettings={currencySettings}>
                  <AuthProvider appCheckToken={appCheckToken}>
                    <CartProvider>
                      <OrdersProvider>
                        {children}
                        <Cookies />
                      </OrdersProvider>
                    </CartProvider>
                  </AuthProvider>
                </StoreCurrencyProvider>
              </StoreTenantProvider>
            </InpostGeowidgetTokenProvider>
          </StoreRuntimeConfigProvider>
        </SWRConfig>
      </>
    </ProgressProvider>
  );
}
