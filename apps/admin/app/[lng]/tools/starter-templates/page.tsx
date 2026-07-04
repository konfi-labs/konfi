import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import StarterTemplatesPage from "./starter-templates-page";

export default function Page() {
  return <StarterTemplatesPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");

  return {
    title: t("ROUTES.starterTemplates", {
      defaultValue: "Starter Templates",
    }),
  };
}
