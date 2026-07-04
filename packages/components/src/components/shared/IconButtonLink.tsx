"use client";

import { IconButton, IconButtonProps } from "@chakra-ui/react";
import { isUndefined } from "es-toolkit";
import NextLink from "next/link";
import {
  forwardRef,
  type ComponentProps as ReactComponentProps,
  type ReactNode,
  useMemo,
} from "react";
import { Tooltip } from "../ui/tooltip";
import { getLocalizedHref } from "./localized-href";
import { MaterialSymbol } from "./MaterialSymbol";

type NextLinkHref = ReactComponentProps<typeof NextLink>["href"];

type ComponentProps = IconButtonProps & {
  lng?: string;
  href: string | URL;
  icon: ReactNode;
  ariaLabel?: string;
  pathname?: string;
  colorChangeOnRouteMatch?: boolean;
  tooltipLabel?: string;
  isExternal?: boolean;
  prefetch?: boolean | "auto" | "unstable_forceStale" | null | undefined;
};

export const IconButtonLink = forwardRef<HTMLButtonElement, ComponentProps>(
  (
    {
      lng,
      href,
      icon,
      ariaLabel = "",
      pathname,
      colorChangeOnRouteMatch = false,
      tooltipLabel,
      isExternal = false,
      prefetch = "auto",
      onClickCapture,
      onKeyDownCapture,
      onPointerDownCapture,
      ...rest
    },
    ref,
  ) => {
    const hasTooltip = !isUndefined(tooltipLabel);

    const content = (
      <IconButtonLinkBase
        lng={lng}
        ref={ref}
        href={href}
        icon={icon}
        ariaLabel={ariaLabel}
        pathname={pathname}
        colorChangeOnRouteMatch={colorChangeOnRouteMatch}
        isExternal={isExternal}
        prefetch={prefetch}
        onClickCapture={onClickCapture}
        onKeyDownCapture={onKeyDownCapture}
        onPointerDownCapture={onPointerDownCapture}
        {...rest}
      />
    );

    return hasTooltip ? (
      <Tooltip
        content={tooltipLabel}
        closeOnClick={true}
        closeOnPointerDown={true}
        // Fast App Router navigations in production can outrun the tooltip exit
        // animation and leave the portalled content orphaned in document.body.
        contentProps={{ animationDuration: "0s" }}
      >
        {rest.disabled ? <span>{content}</span> : content}
      </Tooltip>
    ) : (
      content
    );
  },
);

const IconButtonLinkBase = forwardRef<HTMLButtonElement, ComponentProps>(
  (
    {
      lng,
      href,
      icon,
      ariaLabel = "",
      pathname,
      colorChangeOnRouteMatch = false,
      isExternal = false,
      prefetch = "auto",
      disabled = false,
      ...rest
    },
    ref,
  ) => {
    const isActive = useMemo(() => {
      return pathname === (typeof href === "object" ? href.pathname : href);
    }, [pathname, href]);

    const colorPalette = useMemo(() => {
      return isActive && colorChangeOnRouteMatch
        ? "primary"
        : rest.colorPalette || "gray";
    }, [isActive, colorChangeOnRouteMatch]);

    const variant = useMemo(() => {
      return isActive
        ? colorChangeOnRouteMatch
          ? "subtle"
          : rest.variant || "ghost"
        : rest.variant || "ghost";
    }, [isActive, colorChangeOnRouteMatch]);

    const iconFontSize =
      typeof rest.fontSize === "string" || typeof rest.fontSize === "number"
        ? rest.fontSize
        : undefined;
    const nextPrefetch = prefetch === "unstable_forceStale" ? "auto" : prefetch;

    const buttonContent = (
      <MaterialSymbol
        style={{
          fontSize:
            rest.size === "sm" ? (iconFontSize ?? 22) : (iconFontSize ?? 24),
        }}
      >
        {icon}
      </MaterialSymbol>
    );

    if (disabled) {
      return (
        <IconButton
          ref={ref}
          style={{ textDecoration: "none" }}
          colorPalette={colorPalette}
          variant={variant}
          aria-label={ariaLabel}
          disabled={true}
          {...rest}
        >
          {buttonContent}
        </IconButton>
      );
    }

    return (
      <IconButton
        asChild
        ref={ref}
        style={{ textDecoration: "none" }}
        colorPalette={colorPalette}
        variant={variant}
        aria-label={ariaLabel}
        {...rest}
      >
        {isExternal ? (
          <a href={`${href}`} target="_blank" rel="noopener noreferrer">
            {buttonContent}
          </a>
        ) : (
          <NextLink
            href={getLocalizedHref(href, lng) as NextLinkHref}
            prefetch={nextPrefetch}
          >
            {buttonContent}
          </NextLink>
        )}
      </IconButton>
    );
  },
);
