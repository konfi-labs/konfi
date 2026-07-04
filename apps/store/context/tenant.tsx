"use client";

import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { createContext, useContext } from "react";

const StoreTenantContext = createContext<TenantContext | null>(null);

export function StoreTenantProvider({
  children,
  tenantContext,
}: {
  children: React.ReactNode;
  tenantContext: TenantContext;
}) {
  return (
    <StoreTenantContext.Provider value={tenantContext}>
      {children}
    </StoreTenantContext.Provider>
  );
}

export function useTenantContext() {
  const tenantContext = useContext(StoreTenantContext);

  if (!tenantContext) {
    throw new Error(
      "useTenantContext must be used within StoreTenantProvider.",
    );
  }

  return tenantContext;
}
