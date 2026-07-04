import {
  fetchMetadata,
  fetchPageContent,
  getStoreRuntimeConfigForRequest,
} from "@/lib/firebase/serverApp";
import { readRuntimeString } from "@/lib/runtime-config";
import { Skeleton } from "@chakra-ui/react";
import { Locale } from "@konfi/types";
import { T_STORE_ABOUT_US } from "@konfi/utils";
import { PageMarkdown } from "app/[lng]/components/PageMarkdown";
import { Metadata } from "next";
import { Suspense } from "react";

type Params = Promise<{ id: string; lng: Locale }>;

export default async function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton w={"100%"} h={"100vh"} />}>
      <AboutUsPageContent params={params} />
    </Suspense>
  );
}

async function AboutUsPageContent({ params }: { params: Params }) {
  const { lng } = await params;
  const runtimeConfig = await getStoreRuntimeConfigForRequest();
  const source = await fetchPageContent(T_STORE_ABOUT_US, lng);
  const shortCompanyName =
    readRuntimeString(runtimeConfig?.legal, "shortCompanyName", "shortName") ??
    process.env.NEXT_PUBLIC_SHORT_COMPANY_NAME;
  const legalCompanyName =
    readRuntimeString(
      runtimeConfig?.legal,
      "legalCompanyName",
      "legalName",
      "companyName",
      "name",
    ) ?? process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME;
  const streetAddress =
    readRuntimeString(runtimeConfig?.legal, "streetAddress", "street") ??
    process.env.NEXT_PUBLIC_COMPANY_STREET_ADDRESS;
  const postalCode =
    readRuntimeString(runtimeConfig?.legal, "postalCode", "zip") ??
    process.env.NEXT_PUBLIC_COMPANY_POSTAL_CODE;
  const addressLocality =
    readRuntimeString(runtimeConfig?.legal, "addressLocality", "city") ??
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS_LOCALITY;
  const phoneNumber =
    readRuntimeString(runtimeConfig?.contact, "phoneNumber", "phone") ??
    process.env.NEXT_PUBLIC_COMPANY_PHONE_NUMBER;
  const companyMail =
    readRuntimeString(runtimeConfig?.contact, "companyMail", "email", "mail") ??
    process.env.NEXT_PUBLIC_COMPANY_MAIL;
  const vatId =
    readRuntimeString(runtimeConfig?.legal, "vatId", "vatID", "nip") ??
    process.env.NEXT_PUBLIC_VAT_ID;
  const logoUrl = runtimeConfig
    ? `${runtimeConfig.storeBaseUrl}/assets/icon3.png`
    : undefined;

  return (
    <>
      <PageMarkdown source={source} />
      <div itemScope itemType="https://schema.org/Organization">
        <span itemProp="name" content={shortCompanyName} />
        <span itemProp="legalName" content={legalCompanyName} />
        <div
          itemProp="address"
          itemScope
          itemType="https://schema.org/PostalAddress"
        >
          <span itemProp="streetAddress" content={streetAddress} />
          <span itemProp="postalCode" content={postalCode} />
          <span itemProp="addressLocality" content={addressLocality} />
        </div>
        <div
          itemProp="contactPoint"
          itemScope
          itemType="https://schema.org/ContactPoint"
        >
          <span itemProp="telephone" content={phoneNumber} />
          <span itemProp="email" content={companyMail} />
        </div>
        <span itemProp="telephone" content={phoneNumber} />
        <meta itemProp="vatID" content={vatId} />
        {logoUrl ? <meta itemProp="logo" content={logoUrl} /> : null}
      </div>
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_ABOUT_US, lng);
}
