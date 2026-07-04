"use client";

import { Link as ChakraLink, LinkProps, MenuItemProps } from "@chakra-ui/react";
import NextLink from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { MenuItem } from "../ui/menu";
import { getLocalizedHref } from "./localized-href";

type NextLinkHref = ComponentProps<typeof NextLink>["href"];
type NextLinkPrefetch = ComponentProps<typeof NextLink>["prefetch"];

interface Props extends LinkProps {
  lng?: string;
  href: string;
  hasColor?: boolean;
  prefetch?: NextLinkPrefetch;
  children: React.ReactNode;
}

export const Link = forwardRef<HTMLAnchorElement, Props>((props, ref) => {
  const { lng, href, prefetch, children, ...rest } = props;
  return (
    <ChakraLink asChild ref={ref} {...rest}>
      <NextLink
        href={getLocalizedHref(href, lng) as NextLinkHref}
        prefetch={prefetch}
      >
        {children}
      </NextLink>
    </ChakraLink>
  );
});

interface MenuItemLinkProps extends MenuItemProps {
  lng?: string;
  href: string;
  prefetch?: NextLinkPrefetch;
  children: React.ReactNode;
}

export const MenuItemLink = forwardRef<HTMLDivElement, MenuItemLinkProps>(
  (props, ref) => {
    const { lng, href, prefetch, children, ...rest } = props;
    return (
      <MenuItem asChild ref={ref} {...rest}>
        <Link lng={lng} href={href} prefetch={prefetch} textDecoration={"none"}>
          {children}
        </Link>
      </MenuItem>
    );
  },
);
