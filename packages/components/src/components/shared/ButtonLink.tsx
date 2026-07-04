"use client";

import { Button, ButtonProps } from "@chakra-ui/react";
import NextLink from "next/link";
import { forwardRef, type ComponentProps, useMemo } from "react";
import { getLocalizedHref } from "./localized-href";

type NextLinkHref = ComponentProps<typeof NextLink>["href"];
type NextLinkPrefetch = ComponentProps<typeof NextLink>["prefetch"];

type ButtonLinkProps = ButtonProps & {
  lng?: string;
  href: string | URL;
  ariaLabel: string;
  pathname?: string;
  colorChangeOnRouteMatch?: boolean;
  isExternal?: boolean;
  prefetch?: NextLinkPrefetch;
};

export const ButtonLink = forwardRef<HTMLButtonElement, ButtonLinkProps>(
  (props, ref) => {
    const {
      children,
      lng,
      href,
      ariaLabel,
      pathname,
      colorChangeOnRouteMatch,
      prefetch,
      ...rest
    } = props;

    const isActive = useMemo(() => {
      if (!pathname) return false;

      const hrefPath = typeof href === "object" ? href.pathname : href;
      const normalizedPathname = lng
        ? pathname.replace(`/${lng}`, "")
        : pathname;

      // Exact match for home page
      if (hrefPath === "/") {
        return normalizedPathname === "/" || normalizedPathname === "";
      }

      // For other paths, check if pathname starts with the href
      return (
        normalizedPathname === hrefPath ||
        normalizedPathname.startsWith(hrefPath + "/")
      );
    }, [pathname, href, lng]);

    const variant = useMemo(() => {
      return isActive && colorChangeOnRouteMatch
        ? "subtle"
        : rest.variant || "ghost";
    }, [isActive, colorChangeOnRouteMatch, rest.variant]);

    const nextHref = (
      props.isExternal
        ? `${href}`
        : !rest.disabled
          ? getLocalizedHref(href, lng)
          : ""
    ) as NextLinkHref;

    return (
      <NextLink
        href={nextHref}
        target={props.isExternal ? "_blank" : undefined}
        rel={props.isExternal ? "noopener noreferrer" : undefined}
        prefetch={props.isExternal || rest.disabled ? false : prefetch}
        tabIndex={-1}
      >
        <Button
          ref={ref}
          variant={variant}
          aria-label={ariaLabel}
          style={{ textDecoration: "none" }}
          {...rest}
        >
          {children}
        </Button>
      </NextLink>
    );
  },
);
