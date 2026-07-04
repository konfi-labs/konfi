"use client";

import CampaignUpdateForm from "@/components/promotions/CampaignUpdateForm";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { useT } from "@/i18n/client";
import { CustomHeading, Empty } from "@konfi/components";
import { Campaign } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { useParams } from "next/navigation";
import useSWRImmutable from "swr";

export async function fetchCampaign(id: string) {
  const getDoc = (await import("@konfi/firebase")).getDoc;
  const db = (await import("@konfi/firebase")).db;
  const firestore = (await import("@/lib/firebase/clientApp")).firestore;
  const result = await getDoc(db.doc(firestore, "campaigns", id));
  if (!isUndefined(result)) {
    const campaign = result as Campaign;
    return campaign;
  } else return null;
}

export default function PromotionEditPage() {
  const { id } = useParams();
  const { t } = useT();
  const { data: campaign, isValidating: isValidatingPromotion } =
    useSWRImmutable(id, fetchCampaign, {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    });

  if (isValidatingPromotion) {
    return <AdminLoadingSkeleton variant="fields" rows={7} />;
  }
  if (!campaign)
    return (
      <Empty
        title={t("campaigns.notExists", {
          defaultValue: "Campaign does not exist",
        })}
        description={t("campaigns.notFound", {
          defaultValue: "Campaign not found with the given identifier",
        })}
        icon="sell"
      />
    );

  return (
    <>
      <CustomHeading
        heading={t("admin.editCampaign", { defaultValue: "Edit Campaign" })}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <CampaignUpdateForm campaign={campaign} />
    </>
  );
}
