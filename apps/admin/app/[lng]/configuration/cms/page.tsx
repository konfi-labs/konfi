import i18next from "@/i18n/i18next";
import { getTenantContextForRequest } from "@/lib/firebase/serverApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import CMSPage from "./cms-page";

export default async function Page({
  params,
}: {
  params: Promise<{ lng: string }>;
}) {
  const [{ lng }, tenantContext] = await Promise.all([
    params,
    getTenantContextForRequest(),
  ]);

  if (isSharedSaasTenantRuntime(tenantContext)) {
    redirect(`/${lng}/configuration`);
  }

  return <CMSPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.configCms"),
  };
}
