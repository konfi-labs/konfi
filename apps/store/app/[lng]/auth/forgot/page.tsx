import { fetchMetadata } from "@/lib/firebase/serverApp";
import { T_AUTH_FORGOT } from "@konfi/utils";
import { Metadata } from "next";
import ForgotPage from "./forgot-page";
import { Locale } from "@konfi/types";

export default async function Page() {
  return <ForgotPage />;
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_AUTH_FORGOT, lng);
}
