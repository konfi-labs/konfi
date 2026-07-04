"use client";

import { Heading } from "@chakra-ui/react";
import {
  STORE_ACCOUNT_ADDRESSES,
  STORE_ACCOUNT_GENERATIONS,
  STORE_ACCOUNT_ORDERS,
  STORE_ACCOUNT_RATINGS,
  STORE_HELP,
} from "@konfi/utils";
import { CardSections } from "@konfi/components";
import { CustomHeading } from "@konfi/components";
import { useT } from "@/i18n/client";

const AccountPage = () => {
  const { t } = useT();

  const CONFIG_SECTIONS = [
    {
      heading: t("account.basic", { defaultValue: "Basic" }),
      cards: [
        {
          route: STORE_ACCOUNT_ORDERS,
          icon: "assignment",
          title: t("account.orders", { defaultValue: "Orders" }),
          description: t("account.ordersDescription", {
            defaultValue: "Check order status and track shipments",
          }),
          nofollow: true,
        },
        {
          route: STORE_ACCOUNT_ADDRESSES,
          icon: "home",
          title: t("account.addresses", { defaultValue: "Addresses" }),
          description: t("account.addressesDescription", {
            defaultValue: "Edit delivery addresses for orders",
          }),
          nofollow: true,
        },
        {
          route: STORE_ACCOUNT_RATINGS,
          icon: "star",
          title: t("account.reviews", { defaultValue: "Reviews" }),
          description: t("account.reviewsDescription", {
            defaultValue: "Add reviews for purchased products",
          }),
          nofollow: true,
        },
        {
          route: STORE_ACCOUNT_GENERATIONS,
          icon: "auto_awesome",
          title: t("account.generations.label", {
            defaultValue: "AI generations",
          }),
          description: t("account.generations.cardDescription", {
            defaultValue:
              "Browse, preview, and download graphics you generated with AI.",
          }),
          nofollow: true,
        },
      ],
    },
    {
      heading: t("account.other", { defaultValue: "Other" }),
      cards: [
        {
          route: STORE_HELP,
          icon: "help_outline",
          title: t("account.help", { defaultValue: "Help" }),
          description: t("account.helpDescription", {
            defaultValue: "Browse available help pages",
          }),
        },
      ],
    },
  ];
  return (
    <>
      <CustomHeading
        heading={t("account.label", { defaultValue: "Account" })}
        mb={"8"}
      />
      <CardSections sectionCards={CONFIG_SECTIONS} />
    </>
  );
};

export default AccountPage;
