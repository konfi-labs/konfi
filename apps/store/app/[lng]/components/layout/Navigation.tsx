"use client";

import { useAuth } from "@/context/auth";
import { useCart } from "@/context/cart";
import { auth } from "@/lib/firebase/clientApp";
import {
  Box,
  Circle,
  Drawer,
  Flex,
  Float,
  HStack,
  IconButton,
  Portal,
  Show,
  VStack,
} from "@chakra-ui/react";
import {
  ButtonLink,
  ColorModeButton,
  IconButtonLink,
  LanguageSwitcher,
  LinkOverlay,
  MaterialSymbol,
} from "@konfi/components";
import { AUTH_LOGIN, AUTH_REGISTER, STORE_CART } from "@konfi/utils";
import { useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
// import Search from "../Search";
import { useT } from "@/i18n/client";
import { isEmpty } from "es-toolkit/compat";
import { usePathname, useRouter } from "next/navigation";
import Search from "../Search";
import CartMenu from "./CartMenu";
import { CurrencySwitcher } from "./CurrencySwitcher";
import Links from "./Links";
import NavigationLinks from "./NavigationLinks";
import ProfileMenu from "./ProfileMenu";
import { StorefrontLogo } from "./StorefrontLogo";

const Navigation = ({ lng, logoUrl }: { lng: string; logoUrl?: string }) => {
  const { t } = useT();
  const cartLabel = t("ROUTES.cart", { defaultValue: "Cart", lng });
  const signInLabel = t("store.account.signin", {
    defaultValue: "Sign In",
    lng,
  });
  const signUpLabel = t("store.account.signup", {
    defaultValue: "Sign Up",
    lng,
  });

  return (
    <>
      <Box display={{ base: "none", md: "block" }}>
        <Navbar
          signInLabel={signInLabel}
          signUpLabel={signUpLabel}
          logoUrl={logoUrl}
          lng={lng}
        />
      </Box>
      <Box display={{ base: "block", md: "none" }}>
        <Foobar
          cartLabel={cartLabel}
          signInLabel={signInLabel}
          signUpLabel={signUpLabel}
          logoUrl={logoUrl}
          lng={lng}
        />
      </Box>
    </>
  );
};

const Navbar = ({
  signInLabel,
  signUpLabel,
  logoUrl,
  lng,
}: {
  signInLabel: string;
  signUpLabel: string;
  logoUrl?: string;
  lng: string;
}) => {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { loading, user, logout, customer } = useAuth();
  const { items } = useCart();

  return (
    <Box as={"header"} position={"fixed"} w={"100%"} zIndex={"200"}>
      <Flex
        mt={"4"}
        pt={"0"}
        px={"6"}
        pb={"0"}
        minH={"80px"}
        align={"center"}
        justify={"center"}
        maxW={"1296px"}
        mx={"auto"}
        backgroundColor={{ base: "whiteAlpha.500", _dark: "blackAlpha.500" }}
        borderRadius={"full"}
        border={"1px solid"}
        borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
        justifyContent={"space-between"}
        _before={{
          content: "''",
          position: "absolute",
          width: "100%",
          height: "100%",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          mt: 4,
          backdropFilter: "saturate(125%) blur(10px)",
          zIndex: -1,
          borderRadius: "full",
          h: "80px",
          maxW: "1296px",
        }}
      >
        <NavigationLinks lng={lng} logoUrl={logoUrl} />
        {!loading && (
          <Flex justifyContent="flex-end">
            {user ? (
              <>
                <HStack gap={"2"}>
                  <Search lng={lng} />
                  <CurrencySwitcher lng={lng} />
                  <CartMenu items={items} lng={lng} />
                  {auth.currentUser?.isAnonymous && (
                    <ButtonLink
                      lng={lng}
                      href={AUTH_REGISTER}
                      colorPalette={"primary"}
                      variant={"subtle"}
                      ariaLabel={signUpLabel}
                    >
                      {signUpLabel}
                    </ButtonLink>
                  )}
                  <ProfileMenu
                    email={user.email}
                    customer={customer}
                    logout={logout}
                    lng={lng}
                  />
                </HStack>
              </>
            ) : (
              <>
                <Search lng={lng} />
                <CurrencySwitcher lng={lng} />
                <ButtonLink
                  lng={lng}
                  href={AUTH_LOGIN}
                  colorPalette={"primary"}
                  variant={"subtle"}
                  mx={4}
                  ariaLabel={signInLabel}
                >
                  {signInLabel}
                </ButtonLink>
                <ButtonLink
                  lng={lng}
                  href={AUTH_REGISTER}
                  colorPalette={"primary"}
                  variant={"solid"}
                  ariaLabel={signUpLabel}
                  mr={4}
                >
                  {signUpLabel}
                </ButtonLink>
              </>
            )}
            <Box
              verticalAlign={"middle"}
              display={"inline-block"}
              mr={3}
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
          </Flex>
        )}
      </Flex>
    </Box>
  );
};

const Foobar = ({
  cartLabel,
  signInLabel,
  signUpLabel,
  logoUrl,
  lng,
}: {
  cartLabel: string;
  signInLabel: string;
  signUpLabel: string;
  logoUrl?: string;
  lng: string;
}) => {
  const { loading, user, logout, customer } = useAuth();
  const { items } = useCart();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const navigationHandler = useSwipeable({
    onSwipedLeft: () => setOpen(true),
  });

  const drawerHandler = useSwipeable({
    onSwipedRight: () => setOpen(false),
  });

  return (
    <Box
      as={"footer"}
      position={"fixed"}
      bottom={"0"}
      w={"100%"}
      zIndex={"200"}
      {...navigationHandler}
    >
      <Flex
        mb={"4"}
        pt={"0"}
        px={"6"}
        pb={"0"}
        minH={"80px"}
        align={"center"}
        justify={"center"}
        mx={"4"}
        backgroundColor={{ base: "whiteAlpha.500", _dark: "blackAlpha.500" }}
        borderRadius={"full"}
        border={"1px solid"}
        borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
        justifyContent={"space-between"}
        _before={{
          content: "''",
          position: "absolute",
          width: "calc(100% - 32px)",
          height: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 4,
          backdropFilter: "saturate(125%) blur(10px)",
          zIndex: -1,
          borderRadius: "full",
          h: "80px",
        }}
      >
        <Box>
          <LinkOverlay lng={lng} href={"/"}>
            <Box ml={"2"} w={"80px"} height={"auto"}>
              <StorefrontLogo src={logoUrl} />
            </Box>
          </LinkOverlay>
        </Box>
        <Drawer.Root
          open={open}
          onOpenChange={(details) => setOpen(details.open)}
          placement="bottom"
        >
          <Drawer.Trigger asChild>
            <IconButton ref={btnRef} aria-label={"Menu"}>
              <MaterialSymbol>menu</MaterialSymbol>
            </IconButton>
          </Drawer.Trigger>
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content {...drawerHandler}>
                <Drawer.Header mx={"auto"}>
                  <VStack justify={"space-between"} gap={2}>
                    <Links />
                    <ColorModeButton />
                    <CurrencySwitcher lng={lng} />
                    {!loading && (
                      <Flex justifyContent="flex-end">
                        {user ? (
                          <>
                            <HStack gap={"2"}>
                              <Drawer.ActionTrigger asChild>
                                <Flex pos={"relative"}>
                                  <IconButtonLink
                                    lng={lng}
                                    href={STORE_CART}
                                    icon={"shopping_cart"}
                                    ariaLabel={cartLabel}
                                    tooltipLabel={cartLabel}
                                  />
                                  <Show when={!isEmpty(items)}>
                                    <Float>
                                      <Circle
                                        size={"5"}
                                        bg={"primary.solid"}
                                        color={"white"}
                                      >
                                        {items?.length}
                                      </Circle>
                                    </Float>
                                  </Show>
                                </Flex>
                              </Drawer.ActionTrigger>
                              <Show when={auth.currentUser?.isAnonymous}>
                                <Drawer.ActionTrigger asChild>
                                  <ButtonLink
                                    lng={lng}
                                    href={AUTH_REGISTER}
                                    colorPalette={"primary"}
                                    variant={"subtle"}
                                    ariaLabel={signUpLabel}
                                  >
                                    {signUpLabel}
                                  </ButtonLink>
                                </Drawer.ActionTrigger>
                              </Show>
                              <ProfileMenu
                                email={user.email}
                                customer={customer}
                                logout={logout}
                                lng={lng}
                              />
                            </HStack>
                          </>
                        ) : (
                          <>
                            <ButtonLink
                              lng={lng}
                              href={AUTH_LOGIN}
                              colorPalette={"primary"}
                              variant={"subtle"}
                              mr={4}
                              ariaLabel={signInLabel}
                            >
                              {signInLabel}
                            </ButtonLink>
                            <ButtonLink
                              lng={lng}
                              href={AUTH_REGISTER}
                              colorPalette={"primary"}
                              variant={"solid"}
                              ariaLabel={signUpLabel}
                            >
                              {signUpLabel}
                            </ButtonLink>
                          </>
                        )}
                      </Flex>
                    )}
                  </VStack>
                </Drawer.Header>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
      </Flex>
    </Box>
  );
};

export default Navigation;
