import { fetchMetadata } from "@/lib/firebase/serverApp";
import { T_STORE_B2B } from "@konfi/utils";
import { Metadata } from "next";
import B2BPage from "./b2b-page";
import { Locale } from "@konfi/types";

export default function Page() {
  return <B2BPage />;
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_B2B, lng);
}
