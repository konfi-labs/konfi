import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import AdminLoadingSkeleton from "../../components/layout/AdminLoadingSkeleton";
import OrderPage from "./order-page";

export default function Page() {
  return (
    <>
      <Suspense fallback={<AdminLoadingSkeleton variant="form" rows={8} />}>
        <OrderPage />
      </Suspense>
      <DynamicMarker />
    </>
  );
}

function DynamicMarker() {
  return (
    <Suspense fallback={null}>
      <Connection />
    </Suspense>
  );
}

async function Connection() {
  await connection();
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.order"),
  };
}
