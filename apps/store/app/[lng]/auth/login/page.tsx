import { fetchMetadata } from "@/lib/firebase/serverApp";
import { T_AUTH_LOGIN } from "@konfi/utils";
import { Metadata } from "next";
import LoginPage from "./login-page";
import { Locale } from "@konfi/types";

export default async function Page() {
  return <LoginPage />;
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_AUTH_LOGIN, lng);
}
