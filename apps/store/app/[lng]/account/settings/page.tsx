import { fetchMetadata } from "@/lib/firebase/serverApp";
import { T_ACCOUNT_SETTINGS } from "@konfi/utils";
import { Metadata } from "next";
import SettingsPage from "./settings-page";
import { Locale } from "@konfi/types";

export default function Page() {
  return <SettingsPage />;
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_ACCOUNT_SETTINGS, lng);
}
