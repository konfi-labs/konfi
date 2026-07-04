"use client";

import { CustomersProvider } from "@/context/customers";
import type { ReactNode } from "react";

export default function CustomersLayout({ children }: { children: ReactNode }) {
  return <CustomersProvider>{children}</CustomersProvider>;
}
