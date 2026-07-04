import { useT } from "@/i18n/client";
import {
  Box,
  CloseButton,
  Drawer,
  HStack,
  IconButton,
  Portal,
  Separator,
  Skeleton,
  useBreakpointValue,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { useAuth } from "context/auth";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSwipeable } from "react-swipeable";
import { AppSearch } from "./AppSearch";
const ProfileMenu = dynamic(() => import("./ProfileMenu"), {
  loading: () => <Skeleton height={"40px"} width={"40px"} rounded={"full"} />,
});
const SettingsMenu = dynamic(() => import("./SettingsMenu"), {
  loading: () => <Skeleton height={"40px"} width={"40px"} rounded={"full"} />,
});
const ChannelsSelect = dynamic(() => import("./ChannelsSelect"), {
  loading: () => <Skeleton height={"40px"} width={"40px"} rounded={"full"} />,
  ssr: false,
});
const NavigationLinks = dynamic(() => import("./NavigationLinks"), {
  loading: () => <Skeleton height={"40px"} width={"280px"} rounded={"full"} />,
});
const ToolsNavigationLinks = dynamic(() => import("./ToolsNavigationLinks"), {
  loading: () => <Skeleton height={"40px"} width={"280px"} rounded={"full"} />,
});
const NotificationsMenu = dynamic(() => import("./NotificationsMenu"), {
  loading: () => <Skeleton height={"40px"} width={"40px"} rounded={"full"} />,
});

const Navigation = ({ lng }: { lng: string }) => {
  const variants: "drawer" | "sidebar" =
    useBreakpointValue(
      { base: "drawer", xl: "sidebar" },
      { fallback: "base" },
    ) ?? "drawer";

  switch (variants) {
    case "drawer":
      return <Foobar lng={lng} />;
    default:
      return null;
  }
};

const Foobar = ({ lng }: { lng: string }) => {
  const { t } = useT();
  const { user } = useAuth();
  const { open, onOpen, onClose } = useDisclosure();
  const pathname = usePathname();
  const openNavigationLabel = t("common.openNavigation", {
    defaultValue: "Open navigation",
    lng,
  });
  const navigationHandler = useSwipeable({
    onSwipedLeft: () => onOpen(),
  });

  const drawerHandler = useSwipeable({
    onSwipedRight: () => onClose(),
  });

  const previousPathnameRef = useRef(pathname);
  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;

    previousPathnameRef.current = pathname;
    onClose();
  }, [pathname, onClose]);

  return (
    <Box
      as={"footer"}
      position={"fixed"}
      bottom={8}
      left={8}
      zIndex={"overlay"}
      {...navigationHandler}
    >
      <HStack>
        <IconButton
          aria-label={openNavigationLabel}
          title={openNavigationLabel}
          variant="solid"
          colorPalette="primary"
          borderRadius="full"
          size="lg"
          boxShadow="lg"
          transition="transform 0.2s"
          _hover={{ transform: "scale(1.1)" }}
          onClick={onOpen}
        >
          <MaterialSymbol>menu</MaterialSymbol>
        </IconButton>
        <Drawer.Root
          open={open}
          placement="start"
          onOpenChange={({ open: nextOpen }) =>
            nextOpen ? onOpen() : onClose()
          }
          lazyMount
          unmountOnExit
        >
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content {...drawerHandler}>
                <Drawer.Header>
                  <HStack justify={"space-between"}>
                    <ProfileMenu email={user?.email} />
                  </HStack>
                </Drawer.Header>
                <Drawer.Body>
                  <VStack gap={4} align="stretch">
                    <ChannelsSelect />
                    <Separator />
                    <NavigationLinks variants="sidebar" />
                    <Separator />
                    <ToolsNavigationLinks variants="sidebar" />
                    <AppSearch />
                  </VStack>
                </Drawer.Body>
                <Drawer.Footer>
                  <HStack justify={"space-between"} w={"100%"}>
                    <SettingsMenu />
                    <NotificationsMenu />
                  </HStack>
                </Drawer.Footer>
                <Drawer.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Drawer.CloseTrigger>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
      </HStack>
    </Box>
  );
};

export default Navigation;
