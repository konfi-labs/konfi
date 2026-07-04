"use client";

import { SuppliersProvider } from "@/context/suppliers";
import type { ReactNode } from "react";

export default function ConfigurationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <SuppliersProvider>{children}</SuppliersProvider>;
}
