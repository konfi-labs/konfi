"use client";

import { useT } from "@/i18n/client";
import { CustomHeading } from "@konfi/components";
import B2BInquiryForm from "app/[lng]/components/b2b/B2BInquiryForm";

export default function B2BPage() {
  const { t } = useT();
  return (
    <>
      <CustomHeading
        heading={t("store.b2bForm", { defaultValue: "B2B Form" })}
        mb={"8"}
      />
      <B2BInquiryForm />
    </>
  );
}
