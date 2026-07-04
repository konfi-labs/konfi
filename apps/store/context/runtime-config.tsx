"use client";

import { createContext, useContext } from "react";
import type { StoreRuntimeConfig } from "@/lib/runtime-config";

const StoreRuntimeConfigContext = createContext<StoreRuntimeConfig | null>(
  null,
);

export function StoreRuntimeConfigProvider({
  children,
  runtimeConfig,
}: {
  children: React.ReactNode;
  runtimeConfig: StoreRuntimeConfig;
}) {
  return (
    <StoreRuntimeConfigContext.Provider value={runtimeConfig}>
      {children}
    </StoreRuntimeConfigContext.Provider>
  );
}

export function useStoreRuntimeConfig() {
  const runtimeConfig = useContext(StoreRuntimeConfigContext);

  if (!runtimeConfig) {
    throw new Error(
      "useStoreRuntimeConfig must be used within StoreRuntimeConfigProvider.",
    );
  }

  return runtimeConfig;
}
