"use client";

import {
  BreadcrumbCurrentLink,
  BreadcrumbLink,
  BreadcrumbRoot,
} from "../../ui/breadcrumb";
import { type ComponentProps, useMemo } from "react";
import NextLink from "next/link";
import { dropRight, last } from "es-toolkit";

type NextLinkHref = ComponentProps<typeof NextLink>["href"];

interface Props {
  pathname?: string;
  title?: string;
  t: (key: string, options?: Record<string, any>) => string;
}

export const Breadcrumbs = ({ pathname, title, t }: Props) => {
  const breadcrumbs = useMemo(
    function generateBreadcrumbs() {
      const asPathNestedRoutes = pathname
        ?.split("/")
        .filter((v) => v.length > 0);

      // Remove the first segment from the routes
      const filteredRoutes = asPathNestedRoutes?.slice(1);
      const crumblist = filteredRoutes?.map((subpath, idx) => {
        // Build href using original routes including the first segment
        const href =
          "/" + (asPathNestedRoutes?.slice(0, idx + 2).join("/") ?? "");
        return {
          href,
          text: t(`ROUTES.${subpath}`, { defaultValue: subpath }),
        };
      });

      if (crumblist) {
        if (title) {
          crumblist[crumblist.length - 1] = {
            href: pathname ?? "",
            text: title,
          };
        }

        return [...crumblist];
      } else {
        return [];
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname],
  );

  return (
    <BreadcrumbRoot
      fontWeight={"600"}
      itemScope
      itemType="https://schema.org/BreadcrumbList"
    >
      <BreadcrumbLink
        asChild
        maxW={["100px", "100px", "200px", "200px"]}
        overflow={"hidden"}
        whiteSpace={"nowrap"}
        textOverflow={"ellipsis"}
        itemProp={"itemListElement"}
        itemScope
        itemType={"https://schema.org/ListItem"}
      >
        <NextLink href={"/"} itemProp={"item"}>
          <span itemProp={"name"}>
            {t("ROUTES.home", { defaultValue: "Home" })}
          </span>
          <meta itemProp={"position"} content={"0"} />
        </NextLink>
      </BreadcrumbLink>
      {dropRight(breadcrumbs, 1).map((crumb, idx) => (
        <BreadcrumbLink
          key={idx}
          asChild
          maxW={["100px", "100px", "200px", "200px"]}
          whiteSpace={"nowrap"}
          textOverflow={"ellipsis"}
          overflow={"hidden"}
          itemProp={"itemListElement"}
          itemScope
          itemType={"https://schema.org/ListItem"}
        >
          <NextLink href={crumb.href as NextLinkHref} itemProp={"item"}>
            <span itemProp={"name"}>{crumb.text}</span>
            <meta itemProp={"position"} content={`${idx}`} />
          </NextLink>
        </BreadcrumbLink>
      ))}
      <BreadcrumbCurrentLink
        color={"primary.solid"}
        itemProp={"itemListElement"}
        itemScope
        itemType={"https://schema.org/ListItem"}
      >
        <span itemProp={"name"}>{last(breadcrumbs)?.text}</span>
        <meta itemProp={"position"} content={`${breadcrumbs.length - 1}`} />
      </BreadcrumbCurrentLink>
    </BreadcrumbRoot>
  );
};
