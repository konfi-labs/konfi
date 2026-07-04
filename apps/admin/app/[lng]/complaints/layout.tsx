"use client";

import { OrdersProvider } from "@/context/orders";
import type { ReactNode } from "react";

export default function ComplaintsLayout({ children }: { children: ReactNode }) {
  return <OrdersProvider>{children}</OrdersProvider>;
}
