import { FakturowniaPricingProvider } from "@/context/fakturownia-pricing";
import { CustomersProvider } from "@/context/customers";
import { OrdersProvider } from "@/context/orders";
import type { ReactNode } from "react";

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return (
    <OrdersProvider>
      <CustomersProvider>
        <FakturowniaPricingProvider>{children}</FakturowniaPricingProvider>
      </CustomersProvider>
    </OrdersProvider>
  );
}
