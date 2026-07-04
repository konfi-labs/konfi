"use client";

import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { Box, Flex, HStack } from "@chakra-ui/react";
import { ButtonLink, LinkOverlay } from "@konfi/components";
import {
  STORE_ABOUT_US,
  STORE_B2B,
  STORE_B2B_PRODUCTS,
  STORE_CONTACT,
  STORE_COOPERATION,
} from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { usePathname } from "next/navigation";
import ProductsMenu from "./ProductsMenu";
import { StorefrontLogo } from "./StorefrontLogo";

export default function NavigationLinks({
  lng,
  logoUrl,
}: {
  lng: string;
  logoUrl?: string;
}) {
  const { t } = useT();
  const { customer } = useAuth();
  const pathname = usePathname();

  return (
    <Flex align={"center"} gap={"0"}>
      <LinkOverlay lng={lng} href={"/"}>
        <Box ml={"2"} w={"80px"}>
          <StorefrontLogo src={logoUrl} />
        </Box>
      </LinkOverlay>
      <HStack ml={8}>
        <ProductsMenu lng={lng} />
        {customer && (
          <ButtonLink
            lng={lng}
            href={
              customer?.b2b && !isEmpty(customer?.linkedProductsIds)
                ? STORE_B2B_PRODUCTS
                : STORE_B2B
            }
            mx={2}
            ariaLabel={t("ROUTES.b2b", { defaultValue: "B2B", lng })}
            pathname={pathname}
            colorChangeOnRouteMatch={
              !(customer?.b2b && !isEmpty(customer?.linkedProductsIds))
            }
          >
            {t("ROUTES.b2b", { defaultValue: "B2B", lng })}
          </ButtonLink>
        )}
        <ButtonLink
          lng={lng}
          href={STORE_CONTACT}
          mx={2}
          ariaLabel={t("ROUTES.contact", { defaultValue: "Contact", lng })}
          pathname={pathname}
          colorChangeOnRouteMatch
        >
          {t("ROUTES.contact", { defaultValue: "Contact", lng })}
        </ButtonLink>
        <ButtonLink
          lng={lng}
          href={STORE_COOPERATION}
          mx={2}
          ariaLabel={t("ROUTES.cooperation", {
            defaultValue: "Cooperation",
            lng,
          })}
          pathname={pathname}
          colorChangeOnRouteMatch
        >
          {t("ROUTES.cooperation", { defaultValue: "Cooperation", lng })}
        </ButtonLink>
        <ButtonLink
          lng={lng}
          href={STORE_ABOUT_US}
          mx={2}
          ariaLabel={t("ROUTES.aboutUs", { defaultValue: "About Us", lng })}
          pathname={pathname}
          colorChangeOnRouteMatch
        >
          {t("ROUTES.aboutUs", { defaultValue: "About Us", lng })}
        </ButtonLink>
      </HStack>
    </Flex>
  );
}
