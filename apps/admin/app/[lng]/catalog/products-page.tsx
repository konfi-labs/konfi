"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useT } from "@/i18n/client";
import { Separator, Skeleton } from "@chakra-ui/react";
import { CustomHeading } from "@konfi/components";
import dynamic from "next/dynamic";

const Products = dynamic(() => import("@/components/catalog/Products"), {
  loading: () => <Skeleton />,
  ssr: false,
});
const Categories = dynamic(() => import("@/components/catalog/Categories"), {
  loading: () => <Skeleton />,
  ssr: false,
});

const IndexPage = () => {
  const { t } = useT();
  return (
    <>
      <CustomHeading
        heading={t("ROUTES.catalog", { defaultValue: "Catalog" })}
        mb="8"
        color={"primary.solid"}
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Products />
      <Separator my={"6"} />
      <Categories />
    </>
  );
};

export default IndexPage;
