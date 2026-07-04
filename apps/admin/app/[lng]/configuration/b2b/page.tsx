import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import B2BPage from "./b2b-page";

export default async function Page() {
  return <B2BPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.configB2B"),
  };
}
