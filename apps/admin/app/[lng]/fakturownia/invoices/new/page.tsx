import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import { Suspense } from "react";
import InvoiceCreateRoute from "./invoice-create-route";

export default function Page() {
  return (
    <Suspense fallback={<AdminLoadingSkeleton variant="form" rows={8} />}>
      <InvoiceCreateRoute />
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
    title: t("ROUTES.fakturowniaInvoiceCreate", {
      defaultValue: "Create invoice",
    }),
  };
}
