import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Collapsible,
  Flex,
  HStack,
  IconButton,
  ScrollArea,
  Separator,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ButtonLink } from "@konfi/components/shared/ButtonLink";
import { LinkOverlay } from "@konfi/components/shared/LinkOverlay";
import { Logo } from "@konfi/components/shared/Logo";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { ColorModeButton } from "@konfi/components/ui/color-mode";
import { Tooltip } from "@konfi/components/ui/tooltip";
import { isElectron } from "@konfi/utils/browser-platform";
import { SCROLL_MASK_CSS } from "@konfi/utils/constants";
import { ACCOUNT_SETTINGS } from "@konfi/utils/routes";
import { useAuth } from "context/auth";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppSearch } from "./AppSearch";
import NavigationLinks from "./NavigationLinks";
import ToolsNavigationLinks from "./ToolsNavigationLinks";

const NotificationsMenu = dynamic(() => import("./NotificationsMenu"), {
  loading: () => <Skeleton height={"40px"} width={"40px"} rounded={"full"} />,
});
const SettingsMenu = dynamic(() => import("./SettingsMenu"), {
  loading: () => <Skeleton height={"40px"} width={"40px"} rounded={"full"} />,
});
const ChannelsSelect = dynamic(() => import("./ChannelsSelect"), {
  loading: () => <Skeleton height={"40px"} width={"40%"} rounded={"full"} />,
});
const TenantSwitcher = dynamic(() => import("./TenantSwitcher"), {
  loading: () => <Skeleton height={"40px"} width={"100%"} rounded={"full"} />,
});

export default function SideNavigation({
  lng,
  isCollapsedSidebar,
  setIsCollapsedSidebar,
}: {
  lng: string;
  isCollapsedSidebar: boolean;
  setIsCollapsedSidebar: Dispatch<SetStateAction<boolean>>;
}) {
  const { t } = useT();
  const { user, logout, authExpiration } = useAuth();
  const pathname = usePathname();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [hasScroll, setHasScroll] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const isExpanded = !isCollapsedSidebar;

  const toggleCollapsed = () => setIsCollapsedSidebar((prev) => !prev);

  // Force refresh every minute to ensure badge color stays current
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, []);

  // Check if content is scrollable
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const checkScroll = () => {
      const isScrollable = viewport.scrollHeight > viewport.clientHeight;
      setHasScroll(isScrollable);
    };

    checkScroll();

    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(viewport);

    return () => resizeObserver.disconnect();
  }, [isCollapsedSidebar]);

  const expirationColorPalette = useMemo(() => {
    if (!authExpiration) return undefined;

    const minutesRemaining =
      (new Date(authExpiration).getTime() - Date.now()) / (1000 * 60);

    if (minutesRemaining <= 5) return "red";
    if (minutesRemaining <= 10) return "orange";
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authExpiration, refreshTrigger]);

  return (
    <Flex
      data-state={isExpanded ? "expanded" : "collapsed"}
      p={4}
      direction="column"
      w={isExpanded ? "full" : "72px"}
      h={isElectron() ? "calc(100vh - 62px)" : "calc(100vh - 32px)"}
      bgColor={{ base: "white", _dark: "gray.950" }}
      borderRadius={"3xl"}
      transitionProperty={"width, background-color, box-shadow, padding"}
      transitionDuration={"normal"}
      transitionTimingFunction={"ease-in-out"}
    >
      <Stack h={"100%"} gap={4} overflow={"visible"} cursor="default">
        <HStack
          gap={isExpanded ? 4 : 0}
          ml={0}
          pt={0.5}
          justify={isExpanded ? "space-between" : "center"}
          flexShrink={0}
        >
          {isExpanded && (
            <LinkOverlay lng={lng} href={"/"}>
              <Logo />
            </LinkOverlay>
          )}
          <Tooltip
            content={
              isCollapsedSidebar
                ? t("common.expand", { defaultValue: "Expand", lng })
                : t("common.collapse", { defaultValue: "Collapse", lng })
            }
            positioning={{ placement: "right" }}
          >
            <span>
              <IconButton
                aria-label={
                  isCollapsedSidebar
                    ? t("common.expand", { defaultValue: "Expand" })
                    : t("common.collapse", { defaultValue: "Collapse" })
                }
                variant={"ghost"}
                onClick={toggleCollapsed}
              >
                <MaterialSymbol>
                  {isCollapsedSidebar ? "left_panel_open" : "left_panel_close"}
                </MaterialSymbol>
              </IconButton>
            </span>
          </Tooltip>
        </HStack>
        {/* Scrollable Navigation Area */}
        <ScrollArea.Root flex={1}>
          <ScrollArea.Viewport
            ref={viewportRef}
            css={hasScroll ? SCROLL_MASK_CSS : undefined}
          >
            <ScrollArea.Content>
              <Box py={isExpanded ? 1.5 : 0} px={0}>
                <NavigationLinks
                  variants={"sidebar"}
                  collapsed={isCollapsedSidebar}
                />
                <Separator my={2} />
                <ToolsNavigationLinks
                  variants={"sidebar"}
                  collapsed={isCollapsedSidebar}
                />
                <Separator my={2} />
              </Box>
            </ScrollArea.Content>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar />
        </ScrollArea.Root>
        <Flex direction={"column"} gap={"2"} flexShrink={0}>
          {isExpanded && <TenantSwitcher />}
          {isExpanded && <ChannelsSelect />}
          {isExpanded && <AppSearch />}
          {authExpiration && isExpanded && (
            <Badge px={4} py={2} colorPalette={expirationColorPalette}>
              {t("account.sessionRefresh", {
                defaultValue: "Session refresh at",
                lng,
              })}{" "}
              {new Date(authExpiration).toLocaleTimeString("pl-PL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Badge>
          )}
          {isExpanded && (
            <Collapsible.Root>
              <Box
                mb={4}
                bgColor={{ base: "gray.50", _dark: "black" }}
                p={2}
                borderRadius="3xl"
              >
                <Collapsible.Trigger borderRadius="3xl" asChild>
                  <HStack
                    w={"full"}
                    px={2}
                    py={1.5}
                    justify={"space-between"}
                    rounded="xl"
                    cursor="pointer"
                    _hover={{ bg: { base: "gray.100", _dark: "gray.800" } }}
                  >
                    <Text
                      fontWeight={"bold"}
                      fontSize={"sm"}
                      textOverflow={"ellipsis"}
                      whiteSpace={"nowrap"}
                      overflow={"hidden"}
                    >
                      {user?.email}
                    </Text>
                  </HStack>
                </Collapsible.Trigger>
                <Collapsible.Content>
                  <ButtonLink
                    lng={lng}
                    mb={1}
                    w={"100%"}
                    justifyContent={"flex-start"}
                    size={"sm"}
                    href={ACCOUNT_SETTINGS}
                    ariaLabel={t("account.settingsShort", {
                      defaultValue: "Settings",
                      lng,
                    })}
                    pathname={pathname}
                    colorChangeOnRouteMatch
                  >
                    <MaterialSymbol>settings</MaterialSymbol>
                    {isExpanded &&
                      t("account.settingsShort", {
                        defaultValue: "Settings",
                        lng,
                      })}
                  </ButtonLink>
                  <Button
                    w={"100%"}
                    justifyContent={"flex-start"}
                    size={"sm"}
                    aria-label={t("account.logout", {
                      defaultValue: "Logout",
                      lng,
                    })}
                    variant={"ghost"}
                    onClick={logout}
                  >
                    <MaterialSymbol>logout</MaterialSymbol>
                    {isExpanded &&
                      t("account.logout", { defaultValue: "Logout", lng })}
                  </Button>
                </Collapsible.Content>
              </Box>
            </Collapsible.Root>
          )}
          <Stack
            direction={isExpanded ? "row" : "column"}
            justify={"space-between"}
          >
            <SettingsMenu />
            <ColorModeButton
              electronToggleColorMode={
                typeof window !== "undefined"
                  ? window.konfiDesktop?.appearance.toggleDarkMode
                  : undefined
              }
            />
            <NotificationsMenu />
          </Stack>
        </Flex>
      </Stack>
    </Flex>
  );
}
