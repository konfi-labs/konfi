"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import ProductImagesManager from "@/components/catalog/ProductImagesManager";
import { useT } from "@/i18n/client";
import { CustomHeading } from "@konfi/components";

export default function ProductImagesPage() {
  const { t } = useT();

  return (
    <>
      <CustomHeading
        heading={t("productImages.title", {
          defaultValue: "Product Images",
        })}
        mb="8"
        color="primary.solid"
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />
      <ProductImagesManager />
    </>
  );
}
