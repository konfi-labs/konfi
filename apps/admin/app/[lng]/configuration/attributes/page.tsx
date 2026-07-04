import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import { Suspense } from "react";
import AttributesPage from "./attributes-page";

export const instant = false;

export default async function Page() {
  return (
    <Suspense fallback={<AdminLoadingSkeleton variant="table" rows={6} />}>
      <AttributesPage />
    </Suspense>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.configAttributes"),
  };
}
