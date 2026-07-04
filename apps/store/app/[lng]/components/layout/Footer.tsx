"use client";

import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import { buildRuntimeAssetUrl, readRuntimeString } from "@/lib/runtime-config";
import {
  Badge,
  Box,
  Container,
  HStack,
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ColorModeButton,
  Image,
  LanguageSwitcher,
  Link,
} from "@konfi/components";
import * as ROUTES from "@konfi/utils";
import { usePathname, useRouter } from "next/navigation";
import { StorefrontLogo } from "./StorefrontLogo";

const PAYMENT_METHOD_LABELS = [
  "Przelewy24",
  "Stripe",
  "BLIK",
  "Klarna",
  "Visa",
  "Mastercard",
  "Apple Pay",
] as const;

const ListHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <Text fontWeight={"600"} fontSize={"lg"} mb={2}>
      {children}
    </Text>
  );
};

function useFooterRuntimeValues() {
  const runtimeConfig = useStoreRuntimeConfig();
  const facebookName =
    readRuntimeString(runtimeConfig.metadata, "facebookName") ??
    readRuntimeString(runtimeConfig.contact, "facebookName") ??
    process.env.NEXT_PUBLIC_FACEBOOK_NAME;
  const instagramName =
    readRuntimeString(runtimeConfig.metadata, "instagramName") ??
    readRuntimeString(runtimeConfig.contact, "instagramName") ??
    process.env.NEXT_PUBLIC_INSTAGRAM_NAME;
  const additionalLink =
    readRuntimeString(runtimeConfig.metadata, "footerAdditionalLink") ??
    process.env.NEXT_PUBLIC_FOOTER_ADDIITIONAL_LINK;
  const additionalLinkText =
    readRuntimeString(runtimeConfig.metadata, "footerAdditionalLinkText") ??
    process.env.NEXT_PUBLIC_FOOTER_ADDIITIONAL_LINK_TEXT ??
    "";
  const additionalLinkImage = buildRuntimeAssetUrl(
    runtimeConfig.cdnUrl,
    readRuntimeString(runtimeConfig.metadata, "footerAdditionalLinkImage") ??
      process.env.NEXT_PUBLIC_FOOTER_ADDIITIONAL_LINK_IMAGE,
  );

  return {
    additionalLink,
    additionalLinkImage,
    additionalLinkText,
    facebookName,
    instagramName,
  };
}

export default function Footer({
  lng,
  logoUrl,
}: {
  lng: string;
  logoUrl?: string;
}) {
  return (
    <>
      <Box display={{ base: "none", md: "block" }}>
        <LargeWithLogo lng={lng} logoUrl={logoUrl} />
      </Box>
      <Box display={{ base: "block", md: "none" }}>
        <SmallWithLogo lng={lng} logoUrl={logoUrl} />
      </Box>
    </>
  );
}

function LargeWithLogo({ lng, logoUrl }: { lng: string; logoUrl?: string }) {
  const { t } = useT();
  const footer = useFooterRuntimeValues();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Box
      data-store-footer=""
      position={"relative"}
      w={"100%"}
      h={"400px"}
      shadow={"xs"}
      bgColor={{ base: "gray.50", _dark: "gray.900" }}
    >
      <Container as={Stack} maxW={"7xl"} py={10}>
        <SimpleGrid
          templateColumns={{ sm: "1fr 1fr", md: "0.5fr 0.5fr 0.5fr 1fr" }}
          gap={8}
        >
          <Stack align={"flex-start"}>
            <ListHeader>
              {t("store.footer.help", { defaultValue: "Help", lng })}
            </ListHeader>
            <Link lng={lng} href={ROUTES.STORE_FAQ}>
              {t("ROUTES.faq", { defaultValue: "FAQ", lng })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_REASONS_FOR_REJECTIONS}>
              {t("ROUTES.rejections", { defaultValue: "Rejections", lng })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_PRIVACY_POLICY}>
              {t("ROUTES.privacyPolicy", {
                defaultValue: "Privacy Policy",
                lng,
              })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_REGULATIONS}>
              {t("store.footer.terms", {
                defaultValue: "Terms and Conditions",
                lng,
              })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_GENERAL_CONDITIONS_OF_SALE}>
              {t("ROUTES.generalConditionsOfSale", {
                defaultValue: "General Conditions of Sale",
                lng,
              })}
            </Link>
          </Stack>
          <Stack align={""}>
            <ListHeader>
              {t("store.footer.findUs", { defaultValue: "Find Us", lng })}
            </ListHeader>
            <Link lng={lng} href={ROUTES.STORE_CONTACT}>
              {t("store.footer.contactDetails", {
                defaultValue: "Contact details",
                lng,
              })}
            </Link>
            {footer.facebookName ? (
              <Link href={`https://www.facebook.com/${footer.facebookName}/`}>
                Facebook
              </Link>
            ) : null}
            {footer.instagramName ? (
              <Link href={`https://www.instagram.com/${footer.instagramName}/`}>
                Instagram
              </Link>
            ) : null}
          </Stack>
          <Stack align={"flex-start"}>
            <ListHeader>
              {t("store.footer.aboutUs", { defaultValue: "About Us", lng })}
            </ListHeader>
            <Link lng={lng} href={ROUTES.STORE_COOPERATION}>
              {t("ROUTES.cooperation", { defaultValue: "Cooperation", lng })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_ABOUT_US}>
              {t("ROUTES.aboutUs", { defaultValue: "About Us", lng })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_BLOG}>
              {t("ROUTES.blog", { defaultValue: "Blog", lng })}
            </Link>
          </Stack>
          <Stack gap={6}>
            <Box
              w={"80px"}
              height={"auto"}
              color={{ base: "gray.700", _dark: "gray.300" }}
            >
              <StorefrontLogo src={logoUrl} />
            </Box>
            <Text fontSize={"sm"}>
              {t("store.footer.termsOfUse", {
                defaultValue:
                  "By using the service, you confirm that you have read and accept the guidelines presented in the terms of use and the privacy policy.",
                lng,
              })}
            </Text>
            {footer.additionalLink && (
              <Box maxW={"160px"}>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={footer.additionalLink}
                >
                  <Image
                    transparentBackground
                    src={footer.additionalLinkImage ?? ""}
                    style={{ border: "none", borderRadius: "0" }}
                    alt={footer.additionalLinkText}
                    width={160}
                    ratio={2.13}
                    height={75}
                    priority={false}
                  />
                </a>
              </Box>
            )}
          </Stack>
        </SimpleGrid>
        <Box>
          <Text fontSize={"sm"} fontWeight={"semibold"}>
            {t("store.footer.paymentsNote", {
              defaultValue: "Accepted payment methods:",
              lng,
            })}
          </Text>
          <HStack mt={2}>
            {PAYMENT_METHOD_LABELS.map((label) => (
              <Badge
                key={label}
                variant="surface"
                colorPalette="gray"
                borderRadius="md"
                px={2}
                minH="28px"
                display="inline-flex"
                alignItems="center"
                letterSpacing="0"
              >
                {label}
              </Badge>
            ))}
            <Box alignSelf={"flex-end"} ml={"auto"}>
              <Box
                verticalAlign={"middle"}
                display={"inline-block"}
                mr={2}
                mt={1}
              >
                <ColorModeButton />
              </Box>
              <LanguageSwitcher
                lng={lng}
                t={t}
                router={router}
                pathname={pathname}
              />
            </Box>
          </HStack>
        </Box>
      </Container>
    </Box>
  );
}

function SmallWithLogo({ lng, logoUrl }: { lng: string; logoUrl?: string }) {
  const { t } = useT();
  const footer = useFooterRuntimeValues();
  return (
    <Box
      data-store-footer=""
      position={"relative"}
      w={"100%"}
      h={"600px"}
      shadow={"xs"}
    >
      <Container
        as={Stack}
        maxW={"7xl"}
        pt={8}
        pb={"112px"}
        bgColor={{ base: "gray.50", _dark: "gray.900" }}
      >
        <VStack gap={"8"}>
          <VStack>
            <ListHeader>
              {t("store.footer.help", { defaultValue: "Help", lng })}
            </ListHeader>
            <Link lng={lng} href={ROUTES.STORE_FAQ}>
              {t("ROUTES.faq", { defaultValue: "FAQ", lng })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_REASONS_FOR_REJECTIONS}>
              {t("ROUTES.rejections", { defaultValue: "Rejections", lng })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_PRIVACY_POLICY}>
              {t("ROUTES.privacyPolicy", {
                defaultValue: "Privacy Policy",
                lng,
              })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_REGULATIONS}>
              {t("store.footer.terms", {
                defaultValue: "Terms and Conditions",
                lng,
              })}
            </Link>
            <Link lng={lng} href={ROUTES.STORE_GENERAL_CONDITIONS_OF_SALE}>
              {t("ROUTES.generalConditionsOfSale", {
                defaultValue: "General Conditions of Sale",
                lng,
              })}
            </Link>
          </VStack>
          <VStack>
            <ListHeader>
              {t("store.footer.findUs", { defaultValue: "Find Us", lng })}
            </ListHeader>
            <Link lng={lng} href={ROUTES.STORE_CONTACT}>
              {t("store.footer.contactDetails", {
                defaultValue: "Contact details",
                lng,
              })}
            </Link>
            {footer.facebookName ? (
              <Link href={`https://www.facebook.com/${footer.facebookName}/`}>
                {t("ROUTES.facebook", { defaultValue: "Facebook", lng })}
              </Link>
            ) : null}
            {footer.instagramName ? (
              <Link href={`https://www.instagram.com/${footer.instagramName}/`}>
                {t("ROUTES.instagram", { defaultValue: "Instagram", lng })}
              </Link>
            ) : null}
          </VStack>
          <VStack gap={"4"}>
            <Box
              color={{ base: "gray.700", _dark: "gray.300" }}
              width={"72px"}
              height={"auto"}
            >
              <StorefrontLogo src={logoUrl} />
            </Box>
            <Text fontSize={"sm"} textAlign={"center"}>
              {t("store.footer.termsOfUse", {
                defaultValue:
                  "By using the service, you confirm that you have read and accept the guidelines presented in the terms of use and the privacy policy.",
                lng,
              })}
            </Text>
            {footer.additionalLink ? (
              <Box minW={"160px"} maxW={"160px"}>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={footer.additionalLink}
                >
                  <Image
                    transparentBackground
                    src={footer.additionalLinkImage ?? ""}
                    style={{ border: "none", borderRadius: "0" }}
                    alt={footer.additionalLinkText}
                    width={160}
                    ratio={2.13}
                    height={75}
                    priority={false}
                  />
                </a>
              </Box>
            ) : null}
          </VStack>
        </VStack>
      </Container>
    </Box>
  );
}
