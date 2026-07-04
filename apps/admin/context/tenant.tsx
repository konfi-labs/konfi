"use client";

import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { createContext, useContext, useEffect } from "react";

const TenantContextProvider = createContext<TenantContext | null>(null);

function debugTenantClient(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[admin-tenant:client] ${event}`, details);
}

export function TenantProvider({
  children,
  tenantContext,
}: {
  children: React.ReactNode;
  tenantContext: TenantContext;
}) {
  useEffect(() => {
    debugTenantClient("active tenant context", {
      deploymentMode: tenantContext.deploymentMode,
      requireTenantId: tenantContext.requireTenantId,
      tenantId: tenantContext.tenantId ?? null,
    });
  }, [tenantContext]);

  return (
    <TenantContextProvider.Provider value={tenantContext}>
      {children}
    </TenantContextProvider.Provider>
  );
}

export function useTenantContext() {
  const tenantContext = useContext(TenantContextProvider);

  if (!tenantContext) {
    throw new Error("useTenantContext must be used within TenantProvider.");
  }

  return tenantContext;
}
