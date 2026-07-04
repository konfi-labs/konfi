import { Metadata } from "next";
import SettingsPage from "./settings-page";
import i18next from "@/i18n/i18next";

export default async function Page() {
  return <SettingsPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("account.settings"),
  };
}
