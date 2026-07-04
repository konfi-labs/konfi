"use client";

import { useT } from "@/i18n/client";
import { Box, Container, Grid, GridItem } from "@chakra-ui/react";
import { Sidebar } from "@konfi/components";
import {
  STORE_CONTACT,
  STORE_FAQ,
  STORE_GENERAL_CONDITIONS_OF_SALE,
  STORE_HELP,
  STORE_PRIVACY_POLICY,
  STORE_REASONS_FOR_REJECTIONS,
  STORE_REGULATIONS,
} from "@konfi/utils";
import { usePathname } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import CheckoutNavigation from "./CheckoutNavigation";
import Footer from "./Footer";
import Navigation from "./Navigation";
import { StorePageContentFallback } from "./StoreShellFallback";

interface Props {
  children: React.ReactNode;
  lng: string;
  logoUrl?: string;
}

export default function Layout({ children, lng, logoUrl }: Props) {
  const { t } = useT();
  const pathname = usePathname();
  const isHomePath = Boolean(pathname?.match(/^(\/[a-z]{2})$/));
  const isAuthOrMaintenancePath = Boolean(
    pathname?.match(
      /^(\/[a-z]{2}\/auth\/login|\/[a-z]{2}\/auth\/forgot|\/[a-z]{2}\/auth\/register|\/[a-z]{2}\/maintenance)$/,
    ),
  );
  const isCheckoutPath = Boolean(pathname?.match(/^(\/[a-z]{2}\/checkout)$/));
  const contentMaxW = !isHomePath
    ? pathname?.match(
        /^(\/[a-z]{2}\/auth\/login|\/[a-z]{2}\/auth\/forgot|\/[a-z]{2}\/auth\/register)$/,
      )
      ? "100%"
      : "7xl"
    : "100%";
  const homeMainStyle: CSSProperties | undefined = isHomePath
    ? { minHeight: "max(100svh, 39rem)" }
    : undefined;
  const contentPb =
    !isHomePath && !isAuthOrMaintenancePath ? { base: "12", md: "16" } : 0;

  const links = [
    {
      href: STORE_FAQ,
      label: t("ROUTES.faq", { defaultValue: "FAQ", lng }),
      symbol: "quiz",
    },
    {
      href: STORE_REASONS_FOR_REJECTIONS,
      label: t("ROUTES.rejections", {
        defaultValue: "Reasons for Rejections",
        lng,
      }),
      symbol: "file_question_mark",
    },
    {
      href: STORE_PRIVACY_POLICY,
      label: t("ROUTES.privacyPolicy", { defaultValue: "Privacy Policy", lng }),
      symbol: "privacy_tip",
    },
    {
      href: STORE_REGULATIONS,
      label: t("ROUTES.regulations", { defaultValue: "Regulations", lng }),
      symbol: "gavel",
    },
    {
      href: STORE_GENERAL_CONDITIONS_OF_SALE,
      label: t("ROUTES.generalConditionsOfSale", {
        defaultValue: "General Conditions of Sale",
        lng,
      }),
      symbol: "shield_question",
    },
    { Separator: true },
    {
      href: STORE_CONTACT,
      label: t("ROUTES.help", { defaultValue: "Help", lng }),
      symbol: "contact_page",
    },
  ];

  const content = (
    <Container maxW={contentMaxW} pb={contentPb}>
      {pathname?.includes(STORE_HELP) ? (
        <main>
          <Grid templateColumns={"repeat(12, 1fr)"} gap={10}>
            <GridItem colSpan={[12, 12, 12, 4]} alignItems={"start"}>
              <Sidebar sidebar={links} pathname={pathname} lng={lng} />
            </GridItem>
            <GridItem colSpan={[12, 12, 12, 8]} mr={[4, 0]}>
              {children}
            </GridItem>
          </Grid>
        </main>
      ) : (
        <Box
          as="main"
          bg={isHomePath ? { base: "gray.50", _dark: "gray.900" } : undefined}
          minH={isHomePath ? "max(100svh, 39rem)" : undefined}
          style={homeMainStyle}
        >
          {children}
        </Box>
      )}
    </Container>
  );

  const contentFallback = (
    <Container maxW={contentMaxW} pb={contentPb}>
      <Box
        as="main"
        bg={isHomePath ? { base: "gray.50", _dark: "gray.900" } : undefined}
        style={homeMainStyle}
      >
        <StorePageContentFallback
          minH={isHomePath ? "max(100svh, 39rem)" : "100svh"}
        />
      </Box>
    </Container>
  );

  return (
    <>
      {!isAuthOrMaintenancePath && !isCheckoutPath && (
        <Navigation lng={lng} logoUrl={logoUrl} />
      )}
      {isCheckoutPath && (
        <CheckoutNavigation
          checkoutLabel={t("store.cart.checkout", { defaultValue: "Checkout" })}
          lng={lng}
          logoUrl={logoUrl}
        />
      )}
      <Suspense fallback={contentFallback}>
        {content}
        {!isAuthOrMaintenancePath && <Footer lng={lng} logoUrl={logoUrl} />}
      </Suspense>
    </>
  );
}
