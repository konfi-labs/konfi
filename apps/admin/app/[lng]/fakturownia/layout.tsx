"use client";

import { OrdersProvider } from "@/context/orders";
import type { ReactNode } from "react";

export default function FakturowniaLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <OrdersProvider>{children}</OrdersProvider>;
}
