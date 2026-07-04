"use client";

import ExternalProductImport from "@/components/catalog/ExternalProductImport";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useT } from "@/i18n/client";
import { CustomHeading } from "@konfi/components";

export default function ImportProductPage() {
  const { t } = useT();

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <>
      <CustomHeading
        heading={t("ROUTES.importProduct", {
          defaultValue: "Import Product from URL",
        })}
        mb="8"
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
        color="primary.solid"
      />
      <ExternalProductImport />
    </>
  );
}
