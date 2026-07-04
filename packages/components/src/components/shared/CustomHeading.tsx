"use client";

import {
  Breadcrumb,
  Heading,
  HeadingProps,
  HStack,
  IconButton,
} from "@chakra-ui/react";
import { isRouteNavigable } from "@konfi/utils";
import { TFunction } from "i18next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { MaterialSymbol } from "./MaterialSymbol";

type NextLinkHref = React.ComponentProps<typeof Link>["href"];

interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
}

interface Props extends HeadingProps {
  heading: string;
  top?: number | number[];
  goBack?: boolean;
  /** Enable breadcrumb mode; items are auto-computed from the current pathname. */
  breadcrumb?: boolean;
  /** Optional channel switch React node to render as the first breadcrumb item. */
  channelsSwitch?: ReactNode;
  t?: TFunction;
}

export const CustomHeading = React.forwardRef<HTMLHeadingElement, Props>(
  (
    { heading, top, goBack = true, breadcrumb, channelsSwitch, t, ...rest },
    ref,
  ) => {
    const router = useRouter();
    const pathname = usePathname() ?? "";
    const [canGoBack, setCanGoBack] = useState(false);

    useEffect(() => {
      if (!goBack) return;
      if (typeof window !== "undefined") {
        setCanGoBack(window.history.length > 1);
      }
    }, [goBack]);

    const items = useMemo(() => {
      if (!breadcrumb) return heading ? [{ label: heading }] : [];

      // Derive segments from pathname and skip locale segment like /en or /pl
      const parts = pathname.split("?")[0].split("/").filter(Boolean);
      const localeRe = /^[a-z]{2}(?:-[A-Za-z]{2})?$/; // e.g., en, pl, en-US
      const hasLocale = parts[0] && localeRe.test(parts[0]);
      const localeSeg = hasLocale ? parts[0] : undefined;
      const routeSegs = parts.slice(hasLocale ? 1 : 0);

      // Heuristic: detect "ID-like" segments (numbers, UUIDs, long alphanumerics)
      const isLikelyId = (s: string) => {
        if (!s) return false;
        if (/^\d{4,}$/.test(s)) return true; // long number (e.g., 123456)
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            s,
          )
        )
          return true; // uuid
        if (/^[0-9a-f]{8,}$/i.test(s)) return true; // long hex-ish
        if (/^[A-Za-z0-9_-]{16,}$/.test(s)) return true; // long base64/Firestore-like id
        return false;
      };

      // Build breadcrumb items from route segments, only including navigable paths
      const crumbs: BreadcrumbItem[] = [];
      for (let idx = 0; idx < routeSegs.length; idx++) {
        const seg = routeSegs[idx];
        const isLastSeg = idx === routeSegs.length - 1;

        if (!isLastSeg) {
          const upTo = routeSegs.slice(0, idx + 1);
          const hrefSegs = [localeSeg, ...upTo].filter(Boolean) as string[];
          const href = `/${hrefSegs.join("/")}`;

          // Only add breadcrumb item if route is navigable
          if (isRouteNavigable(href)) {
            const label = isLikelyId(seg) ? seg : `ROUTES.${seg}`;
            crumbs.push({ label, href });
          }
        } else {
          const hasHeading =
            typeof heading === "string" && heading.trim().length > 0;
          const lastLabel = hasHeading
            ? heading
            : isLikelyId(seg)
              ? seg
              : `ROUTES.${seg}`;
          crumbs.push({ label: lastLabel });
        }
      } // If there are no route segments but heading exists, use heading as the only crumb
      if (
        crumbs.length === 0 &&
        typeof heading === "string" &&
        heading.trim().length > 0
      ) {
        return [{ label: heading }];
      }

      return crumbs;
    }, [breadcrumb, heading, pathname]);

    const renderChannelCrumb = () => {
      if (!channelsSwitch) return null;
      return <Breadcrumb.Item minW="100px">{channelsSwitch}</Breadcrumb.Item>;
    };

    const renderHomeAfterChannel = () => {
      if (!breadcrumb) return null;

      const parts = pathname.split("?")[0].split("/").filter(Boolean);
      const localeRe = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;
      const hasLocale = parts[0] && localeRe.test(parts[0]);
      const localeSeg = hasLocale ? parts[0] : undefined;
      const homeHref = `/${[localeSeg].filter(Boolean).join("/")}` || "/";

      const homeLabel = t ? t("ROUTES.home") : "ROUTES.home";

      return (
        <>
          {channelsSwitch && <Breadcrumb.Separator>/</Breadcrumb.Separator>}
          <Breadcrumb.Item>
            <Breadcrumb.Link asChild>
              <Link href={homeHref as NextLinkHref}>{homeLabel}</Link>
            </Breadcrumb.Link>
          </Breadcrumb.Item>
        </>
      );
    };

    return (
      <HStack alignItems="center" w="full">
        {canGoBack && !breadcrumb && (
          <IconButton
            className="noprint"
            alignSelf={"flex-start"}
            variant="ghost"
            onClick={() => router.back()}
            aria-label={"Go back"}
            mr={2}
          >
            <MaterialSymbol pt={0.5}>arrow_back</MaterialSymbol>
          </IconButton>
        )}
        {breadcrumb ? (
          <HStack
            bg={{ base: "gray.50", _dark: "black" }}
            p={1.5}
            borderRadius={"full"}
            pr={4}
            pl={channelsSwitch || goBack ? undefined : 4}
            mb={8}
            gap={1.5}
          >
            {canGoBack && (
              <IconButton
                className="noprint"
                alignSelf={"flex-start"}
                variant="ghost"
                onClick={() => router.back()}
                aria-label={"Go back"}
                size={"xs"}
              >
                <MaterialSymbol pt={0.5}>arrow_back</MaterialSymbol>
              </IconButton>
            )}
            <Breadcrumb.Root size="md">
              <Breadcrumb.List gap="2">
                {renderChannelCrumb()}
                {renderHomeAfterChannel()}
                {items.length > 0 && (
                  <Breadcrumb.Separator>/</Breadcrumb.Separator>
                )}
                {items.map((item, idx) => {
                  const isLast = idx === items.length - 1;
                  const label =
                    typeof item.label === "string" &&
                    item.label.startsWith("ROUTES.")
                      ? t
                        ? t(item.label)
                        : item.label
                      : item.label;

                  return (
                    <React.Fragment key={idx}>
                      {!isLast ? (
                        <Breadcrumb.Item>
                          <Breadcrumb.Link asChild>
                            <Link href={item.href! as NextLinkHref}>
                              {label}
                            </Link>
                          </Breadcrumb.Link>
                        </Breadcrumb.Item>
                      ) : (
                        <Breadcrumb.Item>
                          <Breadcrumb.CurrentLink color={"primary.solid"}>
                            {label}
                          </Breadcrumb.CurrentLink>
                        </Breadcrumb.Item>
                      )}
                      {!isLast && (
                        <Breadcrumb.Separator>/</Breadcrumb.Separator>
                      )}
                    </React.Fragment>
                  );
                })}
              </Breadcrumb.List>
            </Breadcrumb.Root>
          </HStack>
        ) : (
          // Fallback to simple heading
          <Heading size={"4xl"} ref={ref} {...rest} position={"relative"}>
            {heading}
          </Heading>
        )}
      </HStack>
    );
  },
);

CustomHeading.displayName = "CustomHeading";
