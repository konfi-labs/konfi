import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import AiBenchmarksPage from "./ai-benchmarks-page";

export default function Page() {
  return <AiBenchmarksPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string; }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.aiBenchmarks", { defaultValue: "AI Benchmarks" }),
  };
}
