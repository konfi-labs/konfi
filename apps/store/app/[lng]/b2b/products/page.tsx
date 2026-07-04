import { fetchMetadata } from "@/lib/firebase/serverApp";
import { T_STORE_B2B_PRODUCTS } from "@konfi/utils";
import { Metadata } from "next";
import { Suspense } from "react";
import B2BProductsPage from "./b2b-products-page";
import { Locale } from "@konfi/types";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <B2BProductsPage />
    </Suspense>
  );
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_B2B_PRODUCTS, lng);
}
