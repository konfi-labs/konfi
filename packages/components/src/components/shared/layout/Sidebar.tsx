"use client";

import {
  Button,
  MenuItem,
  Separator,
  useBreakpointValue,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import type { ComponentProps } from "react";
import { MaterialSymbol } from "..";
import { MenuContent, MenuRoot, MenuTrigger } from "../../ui/menu";
import { ButtonLink } from "../ButtonLink";

type NextLinkHref = ComponentProps<typeof NextLink>["href"];

export const Sidebar = ({
  sidebar,
  pathname,
  lng,
}: {
  sidebar: {
    href?: string;
    label?: string;
    symbol?: string;
    Separator?: boolean;
  }[];
  pathname: string;
  lng: string;
}) => {
  const variants: "mobile" | "desktop" =
    useBreakpointValue(
      {
        base: "mobile",
        lg: "desktop",
      },
      { fallback: "base" },
    ) ?? "mobile";

  if (variants === "desktop") {
    return (
      <VStack
        position={"sticky"}
        top={32}
        border={"1px solid"}
        bgColor={{ base: "whiteAlpha.500", _dark: "blackAlpha.500" }}
        borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
        p={6}
        mr={[4, 0]}
        borderRadius="3xl"
        gap={"1"}
        alignItems={"flex-start"}
      >
        {sidebar.map((item, index) =>
          !item.Separator ? (
            <ButtonLink
              lng={lng}
              key={index}
              href={item.href ?? ""}
              variant={"ghost"}
              alignSelf={"flex-start"}
              ariaLabel={item.label ?? ""}
              pathname={pathname}
            >
              <MaterialSymbol>{item.symbol}</MaterialSymbol>
              {item.label}
            </ButtonLink>
          ) : (
            <Separator key={index} />
          ),
        )}
      </VStack>
    );
  } else {
    // mobile case
    return (
      <MenuRoot lazyMount>
        <MenuTrigger asChild>
          <Button colorPalette={"primary"}>
            <MaterialSymbol>
              {sidebar.find((item) => item.href === pathname)?.symbol || "link"}
            </MaterialSymbol>
            {sidebar.find((item) => item.href === pathname)?.label}
            <MaterialSymbol>keyboard_arrow_down</MaterialSymbol>
          </Button>
        </MenuTrigger>
        <MenuContent>
          {sidebar.map((item, index) => (
            <MenuItem
              value={item.label ?? ""}
              key={index}
              asChild
              style={{ textDecoration: "none" }}
              alignSelf={"flex-start"}
            >
              <NextLink href={(item.href ?? "#") as NextLinkHref}>
                <MaterialSymbol>{item.symbol}</MaterialSymbol>
                {item.label}
              </NextLink>
            </MenuItem>
          ))}
        </MenuContent>
      </MenuRoot>
    );
  }
};
