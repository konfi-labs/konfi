"use client";

import { LinkBox, LinkBoxProps } from "@chakra-ui/react";
import NextLink from "next/link";
import type { ComponentProps } from "react";
import { getLocalizedHref } from "./localized-href";

type NextLinkHref = ComponentProps<typeof NextLink>["href"];
type NextLinkPrefetch = ComponentProps<typeof NextLink>["prefetch"];

type Props = LinkBoxProps & {
  children: React.ReactNode;
  lng?: string;
  href: string;
  prefetch?: NextLinkPrefetch;
};

export const LinkOverlay = ({
  children,
  lng,
  href,
  prefetch,
  ...rest
}: Props) => (
  <LinkBox {...rest} style={{ textDecoration: "none" }}>
    <NextLink
      href={getLocalizedHref(href, lng) as NextLinkHref}
      prefetch={prefetch}
    >
      {children}
    </NextLink>
  </LinkBox>
);
