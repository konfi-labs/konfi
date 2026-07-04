import { fetchMetadata } from "@/lib/firebase/serverApp";
import { T_STORE_ACCOUNT_ORDERS } from "@konfi/utils";
import { Metadata } from "next";
import OrdersPage from "./orders-page";
import { Locale } from "@konfi/types";

export default function Page() {
  return <OrdersPage />;
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_ACCOUNT_ORDERS, lng);
}
