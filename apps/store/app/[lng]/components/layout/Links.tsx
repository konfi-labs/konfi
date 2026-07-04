"use client";

import { Box } from "@chakra-ui/react";
import { usePathname } from "next/navigation";
import { ButtonLink, DrawerActionTrigger } from "@konfi/components";
import { STORE_PRODUCTS, STORE_CONTACT } from "@konfi/utils";
import { useT } from "@/i18n/client";

export default function Links() {
  const { i18n } = useT();
  const pathname = usePathname();

  return (
    <Box>
      <DrawerActionTrigger asChild>
        <ButtonLink
          lng={i18n.resolvedLanguage}
          variant={pathname?.includes(STORE_PRODUCTS) ? "solid" : "ghost"}
          href={STORE_PRODUCTS}
          mx={2}
          fontWeight={"600"}
          colorPalette={pathname?.includes(STORE_PRODUCTS) ? "primary" : "gray"}
          ariaLabel={"Produkty"}
        >
          Produkty
        </ButtonLink>
      </DrawerActionTrigger>
      <DrawerActionTrigger asChild>
        <ButtonLink
          lng={i18n.resolvedLanguage}
          variant={pathname?.includes(STORE_CONTACT) ? "solid" : "ghost"}
          href={STORE_CONTACT}
          mx={2}
          fontWeight={"600"}
          colorPalette={pathname?.includes(STORE_CONTACT) ? "primary" : "gray"}
          ariaLabel={"Kontakt"}
        >
          Kontakt
        </ButtonLink>
      </DrawerActionTrigger>
    </Box>
  );
}
