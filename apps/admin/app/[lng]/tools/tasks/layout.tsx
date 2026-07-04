"use client";

import { AgentsProvider } from "@/context/agents";
import type { ReactNode } from "react";

export default function TasksLayout({ children }: { children: ReactNode }) {
  return <AgentsProvider>{children}</AgentsProvider>;
}
