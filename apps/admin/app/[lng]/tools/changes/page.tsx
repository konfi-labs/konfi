import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import { ChangesProvider } from "context/changes";
import ChangesPage from "./changes-page";

export default async function Page() {
  return (
    <ChangesProvider>
      <ChangesPage />
    </ChangesProvider>
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
    title: t("ROUTES.changes"),
  };
}
