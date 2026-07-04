import { fetchMetadata } from "@/lib/firebase/serverApp";
import { T_AUTH_REGISTER } from "@konfi/utils";
import { Metadata } from "next";
import RegisterPage from "./register-page";
import { Locale } from "@konfi/types";

export default async function Page() {
  return <RegisterPage />;
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_AUTH_REGISTER, lng);
}
