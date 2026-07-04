import i18next from "@/i18n/i18next";
import { getCustomerCarts } from "@/actions/customer-carts";
import type { Metadata } from "next";
import CustomerCartsPage from "./customer-carts-page";

export default async function Page({
  params,
}: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await params;
  const initialCarts = await getCustomerCarts(lng);

  return <CustomerCartsPage initialCarts={initialCarts} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");

  return {
    title: t("customers.carts.title", {
      defaultValue: "Customer carts",
    }),
  };
}
