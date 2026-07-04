import { fetchMetadata } from "@/lib/firebase/serverApp";
import { Locale } from "@konfi/types";
import { T_STORE_ACCOUNT_GENERATIONS } from "@konfi/utils";
import { Metadata } from "next";
import GenerationsPage from "./generations-page";

export default function Page() {
  return <GenerationsPage />;
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_ACCOUNT_GENERATIONS, lng);
}
