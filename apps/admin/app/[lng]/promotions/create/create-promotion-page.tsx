"use client";

import PromotionCreateForm from "@/components/promotions/PromotionCreateForm";
import { useT } from "@/i18n/client";
import { CustomHeading } from "@konfi/components";

export default function PromotionCreatePage() {
  const { t } = useT();

  return (
    <>
      <CustomHeading
        heading={t("admin.newPromotion", { defaultValue: "New Promotion" })}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <PromotionCreateForm />
    </>
  );
}
