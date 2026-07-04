"use client";

import CampaignCreateForm from "@/components/promotions/CampaignCreateForm";
import { useT } from "@/i18n/client";
import { CustomHeading } from "@konfi/components";

export default function PromotionCreatePage() {
  const { t } = useT();
  return (
    <>
      <CustomHeading
        heading={t("admin.newCampaign", {
          defaultValue: "New Campaign",
        })}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <CampaignCreateForm />
    </>
  );
}
