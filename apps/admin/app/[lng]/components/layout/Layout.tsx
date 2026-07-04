"use client";

import { useAuth } from "@/context/auth";
import { useChannels } from "@/context/channels";
import { useFeaturePreview } from "@/context/featurePreview";
import { useWhatsNew } from "@/context/whatsNew";
import { useT } from "@/i18n/client";
import { Box, Container, HStack, Text } from "@chakra-ui/react";
import { ButtonLink } from "@konfi/components/shared/ButtonLink";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { isElectron } from "@konfi/utils/browser-platform";
import { ADMIN_DESKTOP_SETTINGS_CHANNELS } from "@konfi/utils/routes";
import dynamic from "next/dynamic";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import KonfiSwitchLoader from "./KonfiSwitchLoader";
import SideNavigation from "./SideNavigation";
const ChatPanel = dynamic(() => import("./ChatDrawer"), { ssr: false });
const DesktopUpdaterMenu = dynamic(() => import("./DesktopUpdaterMenu"), {
  ssr: false,
});
const Footer = dynamic(() => import("./Footer"), { ssr: false });
const Navigation = dynamic(() => import("./Navigation"), { ssr: false });
const WhatsNewButton = dynamic(() => import("../whatsNew/WhatsNewButton"), {
  ssr: false,
});
const WhatsNewDialog = dynamic(() => import("../whatsNew/WhatsNewDialog"), {
  ssr: false,
});
const VisualOnboarding = dynamic(
  () => import("../onboarding/VisualOnboarding"),
  { ssr: false },
);

const Layout = ({
  children,
  lng,
}: {
  children: React.ReactNode;
  lng: string;
}) => {
  const { t } = useT();
  const { initialLoading, isAdminClient } = useAuth();
  const { isDefaultComputerChannelSetupOpen } = useChannels();
  const { isDialogOpen: isFeaturePreviewDialogOpen } = useFeaturePreview();
  const { isDialogOpen: isWhatsNewDialogOpen } = useWhatsNew();
  const pathname = usePathname();
  const params = useParams<{ lng?: string }>();
  const lngParam = params?.lng;

  // Normalize pathname by stripping the i18n prefix so route checks work for all languages
  const normalizedPathname = useMemo(() => {
    if (!pathname) return "/";
    if (lngParam) {
      const withoutLng = pathname.replace(
        new RegExp(`^/${lngParam}(?=/|$)`),
        "",
      );
      return withoutLng === "" ? "/" : withoutLng;
    }
    return pathname;
  }, [pathname, lngParam]);

  const showNavigation = useMemo(() => {
    // Hide nav on auth and delivery routes regardless of language prefix
    const hideOnRoutes = /^(?:\/auth\/(?:login|forgot)|\/delivery)\/?$/;
    return !hideOnRoutes.test(normalizedPathname) && isAdminClient;
  }, [normalizedPathname, isAdminClient]);

  const [isCollapsedSidebar, setIsCollapsedSidebar] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("admin.sidebar.collapsed") === "1";
      } catch {
        return false;
      }
    }
    return false;
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        "admin.sidebar.collapsed",
        isCollapsedSidebar ? "1" : "0",
      );
    } catch {
      /* ignore persistence errors */
    }
  }, [isCollapsedSidebar]);

  const shellBackground = { base: "gray.50", _dark: "gray.900" };
  const surfaceBackground = { base: "white", _dark: "gray.950" };
  const sidebarContainerWidth = isCollapsedSidebar ? "104px" : "250px";
  const isOnboardingPaused =
    isDefaultComputerChannelSetupOpen ||
    isFeaturePreviewDialogOpen ||
    isWhatsNewDialogOpen;

  const loadingOverlay = (
    <Container
      maxW="full"
      position="fixed"
      top={isElectron() ? "30px" : 0}
      left={0}
      right={0}
      bottom={0}
      zIndex={2000}
      bg={{ base: "white/50", _dark: "black/80" }}
      display="flex"
      alignItems="center"
      justifyContent="center"
      backdropFilter="blur(10px)"
    >
      <KonfiSwitchLoader
        width={240}
        height={136}
        padding={8}
        durationMs={300}
        label={t("common.loading", { defaultValue: "Loading...", lng })}
      />
    </Container>
  );

  return (
    <>
      {initialLoading && loadingOverlay}
      {isElectron() && (
        <Box
          w="100%"
          position="fixed"
          top={0}
          left={0}
          right={0}
          zIndex={2001}
          bgColor={{ base: "white", _dark: "gray.950" }}
          className="titleBar"
          display="flex"
          alignItems="center"
          justifyContent="center"
          h="30px"
        >
          <Text fontSize="sm" fontWeight="600">
            {document.title}
          </Text>
          <Box
            position="absolute"
            right={navigator?.userAgent?.includes("Mac") ? "16px" : undefined}
            left={navigator?.userAgent?.includes("Mac") ? undefined : "16px"}
            style={{
              // @ts-expect-error - desktop app specific
              appRegion: "no-drag",
            }}
          >
            <HStack gap={1}>
              <ButtonLink
                href={ADMIN_DESKTOP_SETTINGS_CHANNELS}
                size="xs"
                variant="ghost"
                ariaLabel={t("common.settings", { defaultValue: "Settings" })}
                h={5}
              >
                <MaterialSymbol>settings</MaterialSymbol>
                {t("common.settings", { defaultValue: "Settings" })}
              </ButtonLink>
              <DesktopUpdaterMenu />
            </HStack>
          </Box>
        </Box>
      )}
      {showNavigation && <Navigation lng={lng} />}
      <HStack
        minH="100dvh"
        align="stretch"
        bgColor={showNavigation ? shellBackground : surfaceBackground}
        gap={0}
      >
        {showNavigation && (
          <Container
            position={"sticky"}
            top={isElectron() ? 12 : 4}
            px={4}
            display={["none", "none", "none", "none", "block"]}
            w={sidebarContainerWidth}
            maxW={sidebarContainerWidth}
            flexShrink={0}
            mb={"auto"}
            zIndex={1000}
          >
            <SideNavigation
              lng={lng}
              isCollapsedSidebar={isCollapsedSidebar}
              setIsCollapsedSidebar={setIsCollapsedSidebar}
            />
          </Container>
        )}
        <Container
          maxW={"full"}
          minH={{ base: "100vh", md: "calc(100vh - 32px)" }}
          bgColor={surfaceBackground}
          my={{ base: 0, md: isElectron() ? 6 : 4 }}
          mb={{ base: 0, md: isElectron() ? 4 : 0 }}
          mr={{ base: 0, md: 4 }}
          pb={{ base: showNavigation ? 24 : 0, md: 0 }}
          px={4}
          borderRadius={{ base: "none", md: "3xl" }}
        >
          <main>{children}</main>
          {showNavigation && <Footer lng={lng} />}
        </Container>
        {showNavigation && <ChatPanel />}
      </HStack>
      {showNavigation && (
        <>
          {!initialLoading && <VisualOnboarding paused={isOnboardingPaused} />}
          <WhatsNewButton />
          <WhatsNewDialog />
        </>
      )}
    </>
  );
};

export default Layout;
