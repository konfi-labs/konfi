"use client";

import { useT } from "@/i18n/client";
import { useTenantContext } from "@/context/tenant";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import {
  Box,
  Link as ChakraLink,
  Container,
  Flex,
  Stack,
  Text,
  useBreakpointValue,
  VStack,
} from "@chakra-ui/react";
import { LanguageSwitcher } from "@konfi/components/shared/LanguageSwitcher";
import { Link } from "@konfi/components/shared/Link";
import { Logo } from "@konfi/components/shared/Logo";
import {
  ADMIN_CATALOG,
  ADMIN_CONFIG_ATTRIBUTES,
  ADMIN_CONFIG_CMS,
  ADMIN_CONFIG_PRODUCT_TYPES,
  ADMIN_CONFIG_STORE,
  ADMIN_CUSTOMERS,
  ADMIN_LOGISTICS,
  ADMIN_ORDERS,
  ADMIN_QUOTES,
  ADMIN_TOOLS_CHAT,
} from "@konfi/utils/routes";
import { usePathname, useRouter } from "next/navigation";

const ListHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <Text fontWeight={"600"} fontSize={"lg"} mb={2}>
      {children}
    </Text>
  );
};

export default function Footer({ lng }: { lng: string }) {
  const variants: "SmallWithLogo" | "LargeWithLogoLeft" =
    useBreakpointValue(
      { base: "SmallWithLogo", md: "LargeWithLogoLeft" },
      { fallback: "base" },
    ) ?? "SmallWithLogo";

  switch (variants) {
    case "SmallWithLogo":
      return null;
    case "LargeWithLogoLeft":
      return <LargeWithLogoLeft lng={lng} />;
    default:
      return null;
  }
}

function LargeWithLogoLeft({ lng }: { lng: string }) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const tenantContext = useTenantContext();
  const isSharedSaasRuntime = isSharedSaasTenantRuntime(tenantContext);

  return (
    <Flex
      bg={{ base: "gray.50", _dark: "black" }}
      color={{ base: "gray.700", _dark: "gray.200" }}
      position={"absolute"}
      mr={"auto"}
      bottom={4}
      borderRadius="3xl"
      p={8}
      h={"300px"}
      w={"calc(100% - 32px)"}
      justify={"space-between"}
    >
      <Stack align={"flex-start"}>
        <ListHeader>Konfi</ListHeader>
        <Link lng={lng} href={"/"}>
          {t("ROUTES.home", { defaultValue: "Home", lng })}
        </Link>
        <Link lng={lng} href={ADMIN_ORDERS}>
          {t("ROUTES.orders", { defaultValue: "Orders", lng })}
        </Link>
        <Link lng={lng} href={ADMIN_QUOTES}>
          {t("ROUTES.quotes", { defaultValue: "Quotes", lng })}
        </Link>
        <Link lng={lng} href={ADMIN_CUSTOMERS}>
          {t("ROUTES.customers", { defaultValue: "Customers", lng })}
        </Link>
        <Link lng={lng} href={ADMIN_CATALOG}>
          {t("ROUTES.catalog", { defaultValue: "Catalog", lng })}
        </Link>
        <Link lng={lng} href={ADMIN_LOGISTICS}>
          {t("ROUTES.logistics", { defaultValue: "Logistics", lng })}
        </Link>
      </Stack>
      <Stack align={""}>
        <ListHeader>
          {t("ROUTES.config", { defaultValue: "Configuration", lng })}
        </ListHeader>
        <Link lng={lng} href={ADMIN_CONFIG_ATTRIBUTES}>
          {t("ROUTES.attributes", { defaultValue: "Attributes", lng })}
        </Link>
        <Link lng={lng} href={ADMIN_CONFIG_PRODUCT_TYPES}>
          {t("ROUTES.productTypes", { defaultValue: "Product Types", lng })}
        </Link>
        {!isSharedSaasRuntime && (
          <Link lng={lng} href={ADMIN_CONFIG_CMS}>
            {t("ROUTES.configCms", {
              defaultValue: "Content Management System",
              lng,
            })}
          </Link>
        )}
        <Link lng={lng} href={ADMIN_CONFIG_STORE}>
          {t("ROUTES.store", { defaultValue: "Store", lng })}
        </Link>
      </Stack>
      <Stack>
        <ListHeader>
          {t("ROUTES.help", { defaultValue: "Help", lng })}
        </ListHeader>
        <Link lng={lng} href={ADMIN_TOOLS_CHAT}>
          {t("ROUTES.aiAssistant", { defaultValue: "AI Assistant", lng })}
        </Link>
        <ChakraLink
          href="/api/desktop-updater/download"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("tools.downloadForDesktop", {
            defaultValue: "Download for Desktop",
            lng,
          })}
        </ChakraLink>
      </Stack>
      <Stack justifyContent={"space-between"} alignItems={"end"}>
        <Logo />
        <LanguageSwitcher lng={lng} t={t} router={router} pathname={pathname} />
      </Stack>
    </Flex>
  );
}

function SmallWithLogo({ lng }: { lng: string }) {
  const { t } = useT();

  return (
    <Box
      bg={{ base: "gray.50", _dark: "black" }}
      color={{ base: "gray.700", _dark: "gray.200" }}
      position={"absolute"}
      bottom={"0"}
      w={"100%"}
      h={"400px"}
      shadow={"xs"}
    >
      <Container as={Stack} maxW={"7xl"} pt={4} pb={"96px"}>
        <VStack gap={"2"}>
          <VStack>
            <ListHeader>
              {t("ROUTES.config", { defaultValue: "Configuration", lng })}
            </ListHeader>
            <Link lng={lng} href={ADMIN_CONFIG_ATTRIBUTES}>
              {t("ROUTES.attributes", { defaultValue: "Attributes", lng })}
            </Link>
            <Link lng={lng} href={ADMIN_CONFIG_PRODUCT_TYPES}>
              {t("ROUTES.productTypes", { defaultValue: "Product Types", lng })}
            </Link>
          </VStack>
        </VStack>
      </Container>
    </Box>
  );
}
