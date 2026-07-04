"use client";

import { PromotionsProvider } from "@/context/promotions";
import { CustomersProvider } from "@/context/customers";

export default function PromotionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PromotionsProvider>
      <CustomersProvider>{children}</CustomersProvider>
    </PromotionsProvider>
  );
}
