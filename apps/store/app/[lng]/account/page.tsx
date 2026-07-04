import { fetchMetadata } from "@/lib/firebase/serverApp";
import { T_STORE_ACCOUNT } from "@konfi/utils";
import { Metadata } from "next";
import AccountPage from "./account-page";
import { Locale } from "@konfi/types";

export default async function Page() {
  return <AccountPage />;
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_ACCOUNT, lng);
}
