"use client";

import {
  backfillProductSearchIndexAction,
  type ProductSearchIndexBackfillActionResult,
} from "@/actions/product-search-index";
import AddAdminForm from "@/components/account/AddAdminForm";
import AddCourierForm from "@/components/account/AddCourierForm";
import PasswordChangeForm from "@/components/account/PasswordChangeForm";
import RegisterDeveloperForm from "@/components/account/RegisterDeveloperForm";
import RemoveAdminForm from "@/components/account/RemoveAdminForm";
import RemoveCourierForm from "@/components/account/RemoveCourierForm";
import TotpMfaForm from "@/components/account/TotpMfaForm";
import UpdateAdminForm from "@/components/account/UpdateAdminForm";
import { useAuth } from "@/context/auth";
import { useChannels } from "@/context/channels";
import { useT } from "@/i18n/client";
import { auth } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  HStack,
  Separator,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CustomHeading, toaster } from "@konfi/components";
import { useState, useTransition } from "react";

const SettingsPage = () => {
  const { t } = useT();
  const { isSuperAdminClient } = useAuth();
  const { channel } = useChannels();
  const [isBackfillPending, startBackfillTransition] = useTransition();
  const [lastBackfillResult, setLastBackfillResult] =
    useState<ProductSearchIndexBackfillActionResult | null>(null);

  const borderColor = "gray.muted";

  const handleProductSearchIndexBackfill = () => {
    if (!channel?.id) {
      toaster.error({
        title: t("account.productSearchIndex.missingChannelTitle", {
          defaultValue: "Channel is required",
        }),
        description: t("account.productSearchIndex.missingChannelDescription", {
          defaultValue:
            "Select a channel before rebuilding the product search index.",
        }),
      });
      return;
    }

    startBackfillTransition(async () => {
      const result = await backfillProductSearchIndexAction({
        channelId: channel.id,
      });
      setLastBackfillResult(result);

      if (result.ok) {
        toaster.success({
          title: t("account.productSearchIndex.backfillSuccessTitle", {
            defaultValue: "Product search index rebuilt",
          }),
          description: t(
            "account.productSearchIndex.backfillSuccessDescription",
            {
              defaultValue:
                "Indexed {{indexed}} products, skipped {{skipped}}, and removed {{deleted}} stale entries.",
              indexed: result.indexed,
              skipped: result.skipped,
              deleted: result.deleted,
            },
          ),
        });
        return;
      }

      toaster.error({
        title: t("account.productSearchIndex.backfillErrorTitle", {
          defaultValue: "Index rebuild failed",
        }),
        description: t("account.productSearchIndex.backfillErrorDescription", {
          defaultValue: "{{error}}",
          error: result.error,
        }),
      });
    });
  };

  return (
    <>
      <CustomHeading
        heading={t("account.settings")}
        mb={8}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Tabs.Root defaultValue={"basic"}>
        <Tabs.List>
          <Tabs.Trigger value={"basic"}>
            {t("account.basic", { defaultValue: "Basic" })}
          </Tabs.Trigger>
          {isSuperAdminClient && (
            <Tabs.Trigger value={"superAdmin"}>
              <HStack as="span" gap={1.5}>
                <span>
                  {t("account.superAdmin", { defaultValue: "Super Admin" })}
                </span>
                <Badge
                  colorPalette="red"
                  variant="solid"
                  borderRadius="full"
                  px={1.5}
                >
                  SA
                </Badge>
              </HStack>
            </Tabs.Trigger>
          )}
          <Tabs.Indicator />
        </Tabs.List>
        <Tabs.Content value={"basic"}>
          {auth.currentUser && !auth.currentUser.isAnonymous && (
            <>
              <Box
                px={6}
                py={4}
                border={"1px solid"}
                borderColor={borderColor}
                borderRadius="3xl"
              >
                <Text fontSize={"xl"} fontWeight={600}>
                  {t("account.changePassword", {
                    defaultValue: "Change Password",
                  })}
                </Text>
                <Text>
                  {t("account.changePasswordDescription", {
                    defaultValue:
                      "Easily and securely change your account password.",
                  })}
                </Text>
                <PasswordChangeForm />
              </Box>
              <Separator my={6} />
              <Box
                px={6}
                py={4}
                border={"1px solid"}
                borderColor={borderColor}
                borderRadius="3xl"
              >
                <Text fontSize={"xl"} fontWeight={600}>
                  {t("mfa.sectionTitle", {
                    defaultValue: "Security",
                  })}
                </Text>
                <Text>
                  {t("mfa.sectionDescription", {
                    defaultValue:
                      "Manage two-factor authentication for your account.",
                  })}
                </Text>
                <TotpMfaForm />
              </Box>
            </>
          )}
        </Tabs.Content>
        <Tabs.Content value={"superAdmin"}>
          <Box
            px={6}
            py={4}
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius="3xl"
          >
            <Text fontSize={"xl"} fontWeight={600}>
              {t("account.manageAdministrators", {
                defaultValue: "Manage Administrators",
              })}
            </Text>
            <Text>
              {t("account.superAdminSettingsDescription", {
                defaultValue: "Settings available only for Super Admin.",
              })}
            </Text>
            <AddAdminForm />
            <RemoveAdminForm />
            <UpdateAdminForm />
            <AddCourierForm />
            <RemoveCourierForm />
            <RegisterDeveloperForm />
          </Box>
          <Separator my={6} />
          <Box
            px={6}
            py={4}
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius="3xl"
          >
            <VStack align="stretch" gap={4}>
              <Box>
                <Text fontSize={"xl"} fontWeight={600}>
                  {t("account.productSearchIndex.title", {
                    defaultValue: "Product semantic search index",
                  })}
                </Text>
                <Text color="fg.muted">
                  {t("account.productSearchIndex.description", {
                    defaultValue:
                      "Rebuild embeddings for searchable products in the selected channel, including linked products.",
                  })}
                </Text>
              </Box>
              <HStack
                justify="space-between"
                align="center"
                gap={4}
                wrap="wrap"
              >
                <Text color="fg.muted" fontSize="sm">
                  {t("account.productSearchIndex.model", {
                    defaultValue:
                      "Model: {{model}} · {{dimensions}} dimensions",
                    model: "gemini-embedding-2",
                    dimensions: 768,
                  })}
                </Text>
                <Button
                  colorPalette="primary"
                  loading={isBackfillPending}
                  disabled={!channel?.id}
                  onClick={handleProductSearchIndexBackfill}
                >
                  {t("account.productSearchIndex.backfillAction", {
                    defaultValue: "Rebuild index",
                  })}
                </Button>
              </HStack>
              {lastBackfillResult?.ok ? (
                <Text fontSize="sm" color="fg.muted">
                  {t("account.productSearchIndex.lastResult", {
                    defaultValue:
                      "Last run: {{indexed}} indexed, {{skipped}} unchanged, {{deleted}} deleted out of {{total}} indexable products.",
                    indexed: lastBackfillResult.indexed,
                    skipped: lastBackfillResult.skipped,
                    deleted: lastBackfillResult.deleted,
                    total: lastBackfillResult.indexableProducts,
                  })}
                </Text>
              ) : null}
            </VStack>
          </Box>
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
};

export default SettingsPage;
