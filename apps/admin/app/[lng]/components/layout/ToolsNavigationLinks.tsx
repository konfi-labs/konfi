"use client";

import { getAdminConfigFlags } from "@/actions";
import { useAuth } from "@/context/auth";
import { useTenantContext } from "@/context/tenant";
import { useTenantModuleAccess } from "@/hooks/useTenantModuleAccess";
import { useT } from "@/i18n/client";
import {
  Avatar,
  Badge,
  Box,
  Button,
  HStack,
  Separator,
  Show,
  VStack,
} from "@chakra-ui/react";
import { ButtonLink } from "@konfi/components/shared/ButtonLink";
import { Image } from "@konfi/components/shared/Image";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { useColorMode } from "@konfi/components/ui/color-mode";
import { Tooltip } from "@konfi/components/ui/tooltip";
import { isElectron } from "@konfi/utils/browser-platform";
import {
  ADMIN_FAKTUROWNIA,
  ADMIN_TOOLS_AI_BENCHMARKS,
  ADMIN_TOOLS_AGENT_MEMORY,
  ADMIN_TOOLS_ALLEGRO,
  ADMIN_TOOLS_ANALYTICS,
  ADMIN_TOOLS_CALCULATORS,
  ADMIN_TOOLS_CHANGES,
  ADMIN_TOOLS_CHAT,
  ADMIN_TOOLS_EMAILS,
  ADMIN_TOOLS_FILE_CONVERT,
  ADMIN_TOOLS_IMAGE_GENERATOR,
  ADMIN_TOOLS_IMPOSE,
  ADMIN_TOOLS_MCP,
  ADMIN_TOOLS_PRZELEWY24,
  ADMIN_TOOLS_RESEND_EMAILS,
  ADMIN_TOOLS_STARTER_TEMPLATES,
  ADMIN_TOOLS_STRIPE,
  ADMIN_TOOLS_TASKS,
} from "@konfi/utils/routes";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import useSWRImmutable from "swr/immutable";

const NewMenu = dynamic(() => import("@/components/layout/NewMenu"));
const IssueReportDialog = dynamic(() =>
  import("@/components/IssueReportDialog").then((mod) => ({
    default: mod.IssueReportDialog,
  })),
);

const IntegrationIcon = ({ icon }: { icon: string }) => (
  <Box
    as="span"
    display="inline-flex"
    alignItems="center"
    justifyContent="center"
    boxSize="24px"
    minW="24px"
    borderRadius="6px"
    bg={{ base: "blackAlpha.100", _dark: "whiteAlpha.200" }}
    color={{ base: "gray.700", _dark: "gray.100" }}
    fontSize="18px"
    aria-hidden
  >
    <MaterialSymbol>{icon}</MaterialSymbol>
  </Box>
);

export default function ToolsNavigationLinks({
  variants,
  collapsed = false,
}: {
  variants: "foobar" | "navbar" | "sidebar" | undefined;
  collapsed?: boolean;
}) {
  const { t, i18n } = useT();
  const pathname = usePathname();
  const { colorMode } = useColorMode();
  const { isSuperAdminClient } = useAuth();
  const tenantContext = useTenantContext();
  const { isAllowed: canUseImageGeneration } = useTenantModuleAccess(
    "aiImage",
    { denyFreePlan: true },
  );
  const { isAllowed: canUseImposition } = useTenantModuleAccess("imposition");
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);

  const { data: configFlags } = useSWRImmutable(
    [
      "admin-config-flags",
      tenantContext.deploymentMode,
      tenantContext.requireTenantId,
      tenantContext.tenantId ?? "",
    ],
    () => getAdminConfigFlags(),
  );
  const hasFakturowniaKey = configFlags?.fakturowniaApiKeyProvided;
  const hasMicrosoftConfig = configFlags?.microsoftConfigured;
  const hasGitHubIssueReporting = configFlags?.githubIssueReportingEnabled;
  const hasResendConfig = configFlags?.resendConfigured;
  const hasAllegroConfig = configFlags?.allegroConfigured;
  const hasStripeConfig = configFlags?.stripeConfigured;
  const hasPrzelewy24Config = configFlags?.przelewy24Configured;
  const hasIntegrationItems = Boolean(
    hasFakturowniaKey ||
    hasMicrosoftConfig ||
    hasAllegroConfig ||
    (hasStripeConfig && isSuperAdminClient) ||
    (hasPrzelewy24Config && isSuperAdminClient) ||
    hasResendConfig,
  );

  const hideText = collapsed || variants === "foobar";
  const imageGeneratorLabel = t("tools.imageGenerator", {
    defaultValue: "Image Generator",
  });
  const emailsLabel = t("tools.emails", { defaultValue: "Emails" });
  const reportIssueLabel = t("tools.reportIssue", {
    defaultValue: "Report Issue",
  });
  const sentEmailsLabel = t("tools.resend", {
    defaultValue: "Resend",
  });
  const allegroLabel = t("tools.allegro", { defaultValue: "Allegro" });
  const stripeLabel = t("tools.stripe", { defaultValue: "Stripe" });
  const przelewy24Label = t("tools.przelewy24", {
    defaultValue: "Przelewy24",
  });
  const fakturowniaLabel = t("ROUTES.fakturownia", {
    defaultValue: "Fakturownia",
  });
  const analyticsLabel = t("tools.analytics", { defaultValue: "Analytics" });
  const aiBenchmarksLabel = t("tools.aiBenchmarks", {
    defaultValue: "AI Benchmarks",
  });
  const agentMemoryLabel = t("tools.agentMemory", {
    defaultValue: "Agent Memory",
  });
  const aiAssistantLabel = t("tools.aiAssistant", {
    defaultValue: "AI Assistant",
  });
  const changesLabel = t("tools.changes", { defaultValue: "Changes" });
  const fileConvertLabel = t("tools.fileConvert", {
    defaultValue: "File Convert",
  });
  const impositionLabel = t("tools.imposition", {
    defaultValue: "Imposition",
  });
  const calculatorsLabel = t("tools.calculators", {
    defaultValue: "Calculators",
  });
  const tasksLabel = t("tools.tasks", { defaultValue: "Tasks" });
  const mcpServerLabel = t("tools.mcpServer", {
    defaultValue: "MCP Server",
  });
  const starterTemplatesLabel = t("tools.starterTemplates", {
    defaultValue: "Templates",
  });
  const withSuperAdminBadge = (label: string) =>
    hideText ? null : (
      <HStack as="span" gap={1.5}>
        <span>{label}</span>
        <Badge colorPalette="red" variant="solid" borderRadius="full" px={1.5}>
          SA
        </Badge>
      </HStack>
    );

  const LayoutStack = variants === "sidebar" ? VStack : HStack;
  const buttonWidth =
    variants === "sidebar" ? (collapsed ? "40px" : "100%") : undefined;
  const buttonHeight = variants === "sidebar" && collapsed ? "40px" : undefined;
  const buttonBorderRadius =
    variants === "sidebar" && collapsed ? "full" : undefined;
  const buttonJustifyContent =
    variants === "sidebar" ? (collapsed ? "center" : "flex-start") : "center";

  const NavigationSection = ({ children }: { children: ReactNode }) => {
    if (variants !== "sidebar") {
      return <>{children}</>;
    }

    return (
      <VStack gap={1} w="100%" align={collapsed ? "center" : "stretch"}>
        {children}
      </VStack>
    );
  };

  const integrationsItems = (
    <>
      <Show when={hasFakturowniaKey}>
        <Tooltip
          content={fakturowniaLabel}
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
              href={ADMIN_FAKTUROWNIA}
              ariaLabel={fakturowniaLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <IntegrationIcon icon="receipt_long" />
              {!hideText && fakturowniaLabel}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
      <Show when={hasMicrosoftConfig}>
        <Tooltip
          content={emailsLabel}
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
              href={ADMIN_TOOLS_EMAILS}
              ariaLabel={emailsLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <IntegrationIcon icon="mail" />
              {!hideText && emailsLabel}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
      <Show when={hasAllegroConfig}>
        <Tooltip
          content={allegroLabel}
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
              href={ADMIN_TOOLS_ALLEGRO}
              ariaLabel={allegroLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <IntegrationIcon icon="storefront" />
              {!hideText && allegroLabel}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
      <Show when={hasStripeConfig && isSuperAdminClient}>
        <Tooltip
          content={stripeLabel}
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
              href={ADMIN_TOOLS_STRIPE}
              ariaLabel={stripeLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <IntegrationIcon icon="credit_card" />
              {withSuperAdminBadge(stripeLabel)}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
      <Show when={hasPrzelewy24Config && isSuperAdminClient}>
        <Tooltip
          content={przelewy24Label}
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
              href={ADMIN_TOOLS_PRZELEWY24}
              ariaLabel={przelewy24Label}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <IntegrationIcon icon="account_balance_wallet" />
              {withSuperAdminBadge(przelewy24Label)}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
      <Show when={hasResendConfig}>
        <Tooltip
          content={sentEmailsLabel}
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
              href={ADMIN_TOOLS_RESEND_EMAILS}
              ariaLabel={sentEmailsLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <IntegrationIcon
                icon={colorMode === "dark" ? "outgoing_mail" : "drafts"}
              />
              {!hideText && sentEmailsLabel}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
    </>
  );

  const aiToolsItems = (
    <>
      <Tooltip
        content={aiAssistantLabel}
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
            href={ADMIN_TOOLS_CHAT}
            ariaLabel={aiAssistantLabel}
            pathname={pathname}
            colorChangeOnRouteMatch
          >
            <Avatar.Root size={"2xs"}>
              <Avatar.Image src="/assets/avatar_agent.avif" />
              <Avatar.Fallback name={"Konfi"} />
            </Avatar.Root>
            {!hideText && aiAssistantLabel}
          </ButtonLink>
        </span>
      </Tooltip>
      <Tooltip
        content={tasksLabel}
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
            href={ADMIN_TOOLS_TASKS}
            ariaLabel={tasksLabel}
            pathname={pathname}
            colorChangeOnRouteMatch
          >
            <MaterialSymbol>workflow</MaterialSymbol>
            {!hideText && tasksLabel}
          </ButtonLink>
        </span>
      </Tooltip>
      <Tooltip
        content={agentMemoryLabel}
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
            href={ADMIN_TOOLS_AGENT_MEMORY}
            ariaLabel={agentMemoryLabel}
            pathname={pathname}
            colorChangeOnRouteMatch
          >
            <MaterialSymbol>psychology_alt</MaterialSymbol>
            {!hideText && agentMemoryLabel}
          </ButtonLink>
        </span>
      </Tooltip>
      <Show when={isSuperAdminClient}>
        <Tooltip
          content={aiBenchmarksLabel}
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
              href={ADMIN_TOOLS_AI_BENCHMARKS}
              ariaLabel={aiBenchmarksLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>science</MaterialSymbol>
              {withSuperAdminBadge(aiBenchmarksLabel)}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
      <Tooltip
        content={mcpServerLabel}
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
            href={ADMIN_TOOLS_MCP}
            ariaLabel={mcpServerLabel}
            pathname={pathname}
            colorChangeOnRouteMatch
          >
            <Image
              src="/assets/integrations/model-context-protocol-favicon.svg"
              alt={mcpServerLabel}
              ratio={1}
              width={24}
              height={24}
              priority={false}
              boxSize="24px"
              minW="24px"
              objectFit="contain"
              borderRadius="4px"
            />
            {!hideText && mcpServerLabel}
          </ButtonLink>
        </span>
      </Tooltip>
      <Show when={canUseImageGeneration}>
        <Tooltip
          content={imageGeneratorLabel}
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
              href={ADMIN_TOOLS_IMAGE_GENERATOR}
              ariaLabel={imageGeneratorLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>auto_awesome</MaterialSymbol>
              {!hideText && imageGeneratorLabel}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
      <Show when={canUseImposition}>
        <Tooltip
          content={impositionLabel}
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
              href={ADMIN_TOOLS_IMPOSE}
              ariaLabel={impositionLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>layers</MaterialSymbol>
              {!hideText && impositionLabel}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
      <Tooltip
        content={calculatorsLabel}
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
            href={ADMIN_TOOLS_CALCULATORS}
            ariaLabel={calculatorsLabel}
            pathname={pathname}
            colorChangeOnRouteMatch
          >
            <MaterialSymbol>calculate</MaterialSymbol>
            {!hideText && calculatorsLabel}
          </ButtonLink>
        </span>
      </Tooltip>
      {isElectron() && (
        <Tooltip
          content={fileConvertLabel}
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
              href={ADMIN_TOOLS_FILE_CONVERT}
              ariaLabel={fileConvertLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>transform</MaterialSymbol>
              {!hideText && fileConvertLabel}
            </ButtonLink>
          </span>
        </Tooltip>
      )}
    </>
  );

  const utilsItems = (
    <>
      <Tooltip
        content={analyticsLabel}
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
            href={ADMIN_TOOLS_ANALYTICS}
            prefetch={true}
            ariaLabel={analyticsLabel}
            pathname={pathname}
            colorChangeOnRouteMatch
          >
            <MaterialSymbol>analytics</MaterialSymbol>
            {!hideText && analyticsLabel}
          </ButtonLink>
        </span>
      </Tooltip>
      <Show when={hasGitHubIssueReporting}>
        <Tooltip
          content={reportIssueLabel}
          disabled={!hideText}
          positioning={{ placement: "right" }}
        >
          <span>
            <Button
              w={buttonWidth}
              h={buttonHeight}
              borderRadius={buttonBorderRadius}
              justifyContent={buttonJustifyContent}
              variant="ghost"
              onClick={() => setIsIssueDialogOpen(true)}
              aria-label={reportIssueLabel}
            >
              <MaterialSymbol>bug_report</MaterialSymbol>
              {!hideText && reportIssueLabel}
            </Button>
          </span>
        </Tooltip>
        <IssueReportDialog
          open={isIssueDialogOpen}
          setOpenAction={setIsIssueDialogOpen}
        />
      </Show>
      <Tooltip
        content={changesLabel}
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
            href={ADMIN_TOOLS_CHANGES}
            ariaLabel={changesLabel}
            pathname={pathname}
            colorChangeOnRouteMatch
          >
            <MaterialSymbol>history</MaterialSymbol>
            {!hideText && changesLabel}
          </ButtonLink>
        </span>
      </Tooltip>
      <Show when={isSuperAdminClient}>
        <Tooltip
          content={starterTemplatesLabel}
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
              href={ADMIN_TOOLS_STARTER_TEMPLATES}
              ariaLabel={starterTemplatesLabel}
              pathname={pathname}
              colorChangeOnRouteMatch
            >
              <MaterialSymbol>inventory_2</MaterialSymbol>
              {withSuperAdminBadge(starterTemplatesLabel)}
            </ButtonLink>
          </span>
        </Tooltip>
      </Show>
    </>
  );

  return (
    <LayoutStack
      gap={1}
      w={"100%"}
      justify={variants === "foobar" ? "space-between" : undefined}
      align={
        variants === "sidebar" ? (collapsed ? "center" : "stretch") : undefined
      }
    >
      {variants === "foobar" && <NewMenu />}
      {variants === "sidebar" ? (
        <>
          {hasIntegrationItems && (
            <>
              <NavigationSection>{integrationsItems}</NavigationSection>
              <Separator my={2} />
            </>
          )}
          <NavigationSection>{aiToolsItems}</NavigationSection>
          <Separator my={2} />
          <NavigationSection>{utilsItems}</NavigationSection>
        </>
      ) : (
        <>
          {hasIntegrationItems && integrationsItems}
          {aiToolsItems}
          {utilsItems}
        </>
      )}
    </LayoutStack>
  );
}
