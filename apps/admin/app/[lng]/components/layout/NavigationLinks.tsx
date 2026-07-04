"use client";

import { getAdminConfigFlags } from "@/actions";
import { isSocialFeatureEnabled } from "@/lib/social/feature-flag";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { Circle, Float, Heading, Show, Stack } from "@chakra-ui/react";
import { ButtonLink } from "@konfi/components/shared/ButtonLink";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { Tooltip } from "@konfi/components/ui/tooltip";
import {
  ADMIN_CUSTOMERS,
  ADMIN_LOGISTICS,
  ADMIN_NOTES,
  ADMIN_ORDERS,
  ADMIN_PROMOTIONS,
  ADMIN_QUOTES,
  ADMIN_SOCIAL,
} from "@konfi/utils/routes";
import { useNotesCount } from "context/notes";
import { usePathname } from "next/navigation";
import useSWRImmutable from "swr/immutable";

export default function NavigationLinks({
  variants,
  collapsed = false,
}: {
  variants: "foobar" | "navbar" | "sidebar" | undefined;
  collapsed?: boolean;
}) {
  const { t, i18n } = useT();
  const pathname = usePathname();
  const tenantContext = useTenantContext();
  const { notesCount } = useNotesCount();
  const { data: configFlags } = useSWRImmutable(
    [
      "admin-config-flags",
      tenantContext.deploymentMode,
      tenantContext.requireTenantId,
      tenantContext.tenantId ?? "",
    ],
    () => getAdminConfigFlags(),
  );
  const hasPolkurierKey = configFlags?.polkurierApiKeyProvided;

  const hideText = collapsed || variants === "foobar";
  const buttonWidth =
    variants === "sidebar" ? (collapsed ? "40px" : "100%") : undefined;
  const buttonHeight = variants === "sidebar" && collapsed ? "40px" : undefined;
  const buttonBorderRadius =
    variants === "sidebar" && collapsed ? "full" : undefined;
  const buttonJustifyContent =
    variants === "sidebar" ? (collapsed ? "center" : "flex-start") : "center";

  return (
    <Stack
      direction={variants === "sidebar" ? "column" : "row"}
      gap={1}
      w={"100%"}
      justify={variants === "foobar" ? "space-between" : undefined}
      align={
        variants === "sidebar" ? (collapsed ? "center" : "stretch") : undefined
      }
    >
      <Show when={variants !== "foobar"}>
        <Tooltip
          content={t("ROUTES.table", { defaultValue: "Table" })}
          disabled={!hideText}
          positioning={{ placement: "right" }}
        >
          <span>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              w={buttonWidth}
              h={buttonHeight}
              borderRadius={buttonBorderRadius}
              justifyContent={buttonJustifyContent}
              href={"/"}
              ariaLabel={t("ROUTES.table", { defaultValue: "Table" })}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>view_kanban</MaterialSymbol>
              {!hideText && t("ROUTES.table", { defaultValue: "Table" })}
            </ButtonLink>
          </span>
        </Tooltip>
        <Tooltip
          content={t("ROUTES.orders", { defaultValue: "Orders" })}
          disabled={!hideText}
          positioning={{ placement: "right" }}
        >
          <span>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              w={buttonWidth}
              h={buttonHeight}
              borderRadius={buttonBorderRadius}
              justifyContent={buttonJustifyContent}
              href={ADMIN_ORDERS}
              ariaLabel={t("ROUTES.orders", { defaultValue: "Orders" })}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>orders</MaterialSymbol>
              {!hideText && t("ROUTES.orders", { defaultValue: "Orders" })}
            </ButtonLink>
          </span>
        </Tooltip>
        <Tooltip
          content={t("ROUTES.quotes", { defaultValue: "Quotes" })}
          disabled={!hideText}
          positioning={{ placement: "right" }}
        >
          <span>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              w={buttonWidth}
              h={buttonHeight}
              borderRadius={buttonBorderRadius}
              justifyContent={buttonJustifyContent}
              href={ADMIN_QUOTES}
              ariaLabel={t("ROUTES.quotes", { defaultValue: "Quotes" })}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>request_quote</MaterialSymbol>
              {!hideText && t("ROUTES.quotes", { defaultValue: "Quotes" })}
            </ButtonLink>
          </span>
        </Tooltip>
        <Tooltip
          content={t("ROUTES.customers", { defaultValue: "Customers" })}
          disabled={!hideText}
          positioning={{ placement: "right" }}
        >
          <span>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              w={buttonWidth}
              h={buttonHeight}
              borderRadius={buttonBorderRadius}
              justifyContent={buttonJustifyContent}
              href={ADMIN_CUSTOMERS}
              ariaLabel={t("ROUTES.customers", { defaultValue: "Customers" })}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>groups</MaterialSymbol>
              {!hideText &&
                t("ROUTES.customers", { defaultValue: "Customers" })}
            </ButtonLink>
          </span>
        </Tooltip>
        <Tooltip
          content={t("ROUTES.promotions", { defaultValue: "Promotions" })}
          disabled={!hideText}
          positioning={{ placement: "right" }}
        >
          <span>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              w={buttonWidth}
              h={buttonHeight}
              borderRadius={buttonBorderRadius}
              justifyContent={buttonJustifyContent}
              href={ADMIN_PROMOTIONS}
              ariaLabel={t("ROUTES.promotions", { defaultValue: "Promotions" })}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>sell</MaterialSymbol>
              {!hideText &&
                t("ROUTES.promotions", { defaultValue: "Promotions" })}
            </ButtonLink>
          </span>
        </Tooltip>
        {isSocialFeatureEnabled() && (
          <Tooltip
            content={t("ROUTES.social", { defaultValue: "Social media" })}
            disabled={!hideText}
            positioning={{ placement: "right" }}
          >
            <span>
              <ButtonLink
                lng={i18n.resolvedLanguage}
                w={buttonWidth}
                h={buttonHeight}
                borderRadius={buttonBorderRadius}
                justifyContent={buttonJustifyContent}
                href={ADMIN_SOCIAL}
                ariaLabel={t("ROUTES.social", { defaultValue: "Social media" })}
                pathname={pathname}
                colorChangeOnRouteMatch
              >
                <MaterialSymbol>share</MaterialSymbol>
                {!hideText &&
                  t("ROUTES.social", { defaultValue: "Social media" })}
              </ButtonLink>
            </span>
          </Tooltip>
        )}
        <Tooltip
          content={t("ROUTES.notes", { defaultValue: "Notes" })}
          disabled={!hideText}
          positioning={{ placement: "right" }}
        >
          <span>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              w={buttonWidth}
              h={buttonHeight}
              borderRadius={buttonBorderRadius}
              justifyContent={buttonJustifyContent}
              href={ADMIN_NOTES}
              ariaLabel={t("ROUTES.notes", { defaultValue: "Notes" })}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>sticky_note_2</MaterialSymbol>
              {!hideText && t("ROUTES.notes", { defaultValue: "Notes" })}
              <Show when={notesCount > 0 && !collapsed}>
                <Float
                  placement={hideText ? "top-end" : "middle-end"}
                  offset={hideText ? 1 : 4}
                >
                  <Circle
                    size={"5"}
                    bg={{ base: "red.500", _dark: "red.400" }}
                    color={{ base: "white", _dark: "gray.900" }}
                  >
                    {notesCount}
                  </Circle>
                </Float>
              </Show>
            </ButtonLink>
          </span>
        </Tooltip>
        <Show when={hasPolkurierKey}>
          <Tooltip
            content={t("ROUTES.logistics", { defaultValue: "Logistics" })}
            disabled={!hideText}
            positioning={{ placement: "right" }}
          >
            <span>
              <ButtonLink
                lng={i18n.resolvedLanguage}
                w={buttonWidth}
                h={buttonHeight}
                borderRadius={buttonBorderRadius}
                justifyContent={buttonJustifyContent}
                href={ADMIN_LOGISTICS}
                ariaLabel={t("ROUTES.logistics", { defaultValue: "Logistics" })}
                pathname={pathname}
                colorChangeOnRouteMatch
              >
                <MaterialSymbol>local_shipping</MaterialSymbol>
                {!hideText &&
                  t("ROUTES.logistics", { defaultValue: "Logistics" })}
              </ButtonLink>
            </span>
          </Tooltip>
        </Show>
      </Show>
    </Stack>
  );
}
