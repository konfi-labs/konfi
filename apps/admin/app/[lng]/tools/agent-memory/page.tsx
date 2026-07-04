import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import AgentMemoryPage from "./agent-memory-page";

export default function Page() {
  return <AgentMemoryPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.agentMemory", { defaultValue: "Agent Memory" }),
  };
}
