"use client";

import { CatalogProvider } from "@/context/catalog";
import { CustomersProvider } from "@/context/customers";
import { FakturowniaPricingProvider } from "@/context/fakturownia-pricing";
import { OrdersProvider } from "@/context/orders";
import type { ReactNode } from "react";

export default function AllegroLayout({ children }: { children: ReactNode }) {
  return (
    <CatalogProvider>
      <CustomersProvider>
        <OrdersProvider>
          <FakturowniaPricingProvider>
            {children}
          </FakturowniaPricingProvider>
        </OrdersProvider>
      </CustomersProvider>
    </CatalogProvider>
  );
}
