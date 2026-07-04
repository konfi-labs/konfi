import { PageMarkdown } from "@/components/PageMarkdown";
import {
  fetchMetadata,
  fetchPageContent,
  getStoreRuntimeConfigForRequest,
} from "@/lib/firebase/serverApp";
import { readRuntimeString } from "@/lib/runtime-config";
import {
  Box,
  Link as ChakraLink,
  Separator,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Locale } from "@konfi/types";
import { T_STORE_CONTACT } from "@konfi/utils";
import { Metadata } from "next";
import { Suspense } from "react";

type Params = Promise<{ id: string; lng: Locale }>;

export default async function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton w={"100%"} h={"100vh"} />}>
      <ContactPageContent params={params} />
    </Suspense>
  );
}

async function ContactPageContent({ params }: { params: Params }) {
  const { lng } = await params;
  const runtimeConfig = await getStoreRuntimeConfigForRequest();
  const source = await fetchPageContent(T_STORE_CONTACT, lng);

  const companyName =
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
  const city =
    readRuntimeString(runtimeConfig?.legal, "city", "addressLocality") ??
    process.env.NEXT_PUBLIC_COMPANY_CITY;
  const phone =
    readRuntimeString(runtimeConfig?.contact, "phoneNumber", "phone") ??
    process.env.NEXT_PUBLIC_COMPANY_PHONE_NUMBER;
  const email =
    readRuntimeString(runtimeConfig?.contact, "contactMail", "email", "mail") ??
    process.env.NEXT_PUBLIC_CONTACT_MAIL ??
    process.env.NEXT_PUBLIC_COMPANY_MAIL;
  const vatId =
    readRuntimeString(runtimeConfig?.legal, "vatId", "vatID", "nip") ??
    process.env.NEXT_PUBLIC_VAT_ID;

  const hasContactInfo =
    companyName ||
    streetAddress ||
    postalCode ||
    city ||
    phone ||
    email ||
    vatId;

  return (
    <>
      <PageMarkdown source={source} />
      {hasContactInfo && (
        <>
          <Separator my={8} />
          <Box
            itemScope
            itemType="https://schema.org/Organization"
            borderRadius={"3xl"}
            borderWidth={"1px"}
            p={8}
          >
            {companyName && (
              <Text
                fontSize={"xl"}
                fontWeight={"bold"}
                mb={4}
                itemProp="legalName"
              >
                {companyName}
              </Text>
            )}
            <Stack gap={2}>
              {(streetAddress || postalCode || city) && (
                <Text
                  itemProp="address"
                  itemScope
                  itemType="https://schema.org/PostalAddress"
                  as="address"
                  fontStyle={"normal"}
                >
                  {streetAddress && (
                    <span itemProp="streetAddress">{streetAddress}</span>
                  )}
                  {(postalCode || city) && (
                    <>
                      {streetAddress && <br />}
                      {postalCode && (
                        <span itemProp="postalCode">{postalCode}</span>
                      )}
                      {postalCode && city && " "}
                      {city && <span itemProp="addressLocality">{city}</span>}
                    </>
                  )}
                </Text>
              )}
              {phone && (
                <Text itemProp="telephone">
                  <ChakraLink href={`tel:${phone}`} color={"primary.solid"}>
                    {phone}
                  </ChakraLink>
                </Text>
              )}
              {email && (
                <Text itemProp="email">
                  <ChakraLink href={`mailto:${email}`} color={"primary.solid"}>
                    {email}
                  </ChakraLink>
                </Text>
              )}
              {vatId && (
                <Text>
                  <meta itemProp="vatID" content={vatId} />
                  NIP: {vatId}
                </Text>
              )}
            </Stack>
          </Box>
        </>
      )}
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_CONTACT, lng);
}
