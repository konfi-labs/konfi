import { fetchMetadata } from "@/lib/firebase/serverApp";
import { T_STORE_ACCOUNT_RATINGS } from "@konfi/utils";
import { Metadata } from "next";
import RatingsPage from "./ratings-page";
import { Locale } from "@konfi/types";

export default function Page() {
  return <RatingsPage />;
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_ACCOUNT_RATINGS, lng);
}
