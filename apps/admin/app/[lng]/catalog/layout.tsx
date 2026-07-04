"use client";

import { CatalogProvider } from "@/context/catalog";
import { CustomersProvider } from "@/context/customers";
import { SuppliersProvider } from "@/context/suppliers";
import type { ReactNode } from "react";

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <CatalogProvider>
      <CustomersProvider>
        <SuppliersProvider>{children}</SuppliersProvider>
      </CustomersProvider>
    </CatalogProvider>
  );
}
