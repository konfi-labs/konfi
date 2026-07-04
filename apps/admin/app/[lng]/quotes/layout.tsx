"use client";

import { QuotesProvider } from "@/context/quotes";
import { CatalogProvider } from "@/context/catalog";
import { CustomersProvider } from "@/context/customers";
import { FakturowniaPricingProvider } from "@/context/fakturownia-pricing";
import { OrdersProvider } from "@/context/orders";

export default function QuotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QuotesProvider>
      <CatalogProvider>
        <CustomersProvider>
          <OrdersProvider>
            <FakturowniaPricingProvider>
              {children}
            </FakturowniaPricingProvider>
          </OrdersProvider>
        </CustomersProvider>
      </CatalogProvider>
    </QuotesProvider>
  );
}
