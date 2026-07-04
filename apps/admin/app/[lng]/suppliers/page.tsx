import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import SuppliersPage from "./suppliers-page";

export default async function Page() {
  return <SuppliersPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.suppliers"),
  };
}
