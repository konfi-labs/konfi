"use client";

import { AgentsProvider } from "@/context/agents";
import { AssistantHistoryProvider } from "@/context/assistant-history";
import type { ReactNode } from "react";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <AgentsProvider>
      <AssistantHistoryProvider>{children}</AssistantHistoryProvider>
    </AgentsProvider>
  );
}
