import { isSocialFeatureEnabled } from "@/lib/social/feature-flag";
import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import SocialPage from "./social-page";

export default async function Page() {
  if (!isSocialFeatureEnabled()) {
    notFound();
  }
  return <SocialPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.social"),
  };
}
