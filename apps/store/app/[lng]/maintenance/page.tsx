import { getT } from "@/i18n/index";
import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import type { Metadata } from "next";
import { MaintenancePageContent } from "./maintenance-page-content";

type Params = Promise<{ lng: string }>;

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
};

export default async function Page({ params }: { params: Params }) {
  await params;
  const { t } = await getT();
  const runtimeConfig = await getStoreRuntimeConfigForRequest();
  const title =
    runtimeConfig?.maintenance.title ??
    t("store.maintenance.title", {
      defaultValue: "Storefront is temporarily unavailable",
    });
  const message =
    runtimeConfig?.maintenance.message ??
    t("store.maintenance.description", {
      defaultValue:
        "We are preparing this store for visitors. Please check back soon.",
    });

  return <MaintenancePageContent message={message} title={title} />;
}
