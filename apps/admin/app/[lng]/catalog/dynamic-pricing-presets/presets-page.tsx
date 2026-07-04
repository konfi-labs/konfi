"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useChannels } from "@/context/channels";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  Dialog,
  HStack,
  Portal,
  Separator,
  Skeleton,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  deleteDynamicPricingPreset,
  getDynamicPricingPresets,
} from "@konfi/firebase";
import { DynamicPricingPreset } from "@konfi/types";
import { CustomHeading, EmptyState, MaterialSymbol, toaster } from "@konfi/components";
import { useState } from "react";
import useSWR from "swr";

export default function PresetsPage() {
  const { t } = useT();
  const { channel } = useChannels();
  const [pendingDeletion, setPendingDeletion] = useState<DynamicPricingPreset | null>(
    null,
  );

  const { data, isLoading, mutate } = useSWR(
    channel?.id ? ["dynamic-pricing-presets", channel.id] : null,
    () => getDynamicPricingPresets(firestore, channel?.id ?? ""),
  );

  const presets = data ?? [];

  async function handleDelete() {
    if (!pendingDeletion || !channel?.id) return;
    const success = await deleteDynamicPricingPreset(
      firestore,
      channel.id,
      pendingDeletion.id,
    );
    if (success) {
      toaster.create({
        type: "success",
        title: t("admin.dynamicPricing.presetToasts.deleted", {
          defaultValue: "Preset deleted",
        }),
      });
      await mutate();
    } else {
      toaster.create({
        type: "error",
        title: t("admin.dynamicPricing.presetToasts.deleteFailed", {
          defaultValue: "Failed to delete preset",
        }),
      });
    }
    setPendingDeletion(null);
  }

  return (
    <>
      <CustomHeading
        heading={t("admin.dynamicPricing.title", {
          defaultValue: "Dynamic pricing",
        })}
        mb="4"
        color="primary.solid"
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Text color="fg.muted" mb="4">
        {t("admin.dynamicPricing.presetsPageHelper", {
          defaultValue:
            "Reusable dynamic pricing presets scoped to the selected channel. Create or edit presets from a product's dynamic pricing configuration.",
        })}
      </Text>
      <Separator mb="6" />

      {isLoading ? (
        <VStack align="stretch">
          <Skeleton height="48px" />
          <Skeleton height="48px" />
          <Skeleton height="48px" />
        </VStack>
      ) : presets.length === 0 ? (
        <EmptyState
          icon={<MaterialSymbol>tune</MaterialSymbol>}
          title={t("admin.dynamicPricing.noPresetsTitle", {
            defaultValue: "No presets yet",
          })}
          description={t("admin.dynamicPricing.noPresetsDescription", {
            defaultValue:
              "Open a product's dynamic pricing configuration and use 'Save as preset' to create one.",
          })}
        />
      ) : (
        <Table.Root variant="line" size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>
                {t("admin.dynamicPricing.label", { defaultValue: "Label" })}
              </Table.ColumnHeader>
              <Table.ColumnHeader>
                {t("admin.dynamicPricing.presetKindColumn", {
                  defaultValue: "Kind",
                })}
              </Table.ColumnHeader>
              <Table.ColumnHeader>
                {t("admin.dynamicPricing.description", {
                  defaultValue: "Description",
                })}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("admin.dynamicPricing.actions", {
                  defaultValue: "Actions",
                })}
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {presets.map((preset) => (
              <Table.Row key={preset.id}>
                <Table.Cell>
                  <Text fontWeight="medium">{preset.label || preset.id}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    colorPalette={preset.kind === "global" ? "blue" : "purple"}
                  >
                    {preset.kind === "global"
                      ? t("admin.dynamicPricing.presetKind.global", {
                          defaultValue: "Global",
                        })
                      : t("admin.dynamicPricing.presetKind.attribute", {
                          defaultValue: "Attribute",
                        })}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Text color="fg.muted">
                    {preset.description ??
                      (preset.kind === "attribute" && preset.attributeRule
                        ? t("admin.dynamicPricing.presetDescription.attribute", {
                            attributeId: preset.attributeRule.attributeId,
                            defaultValue: "Attribute preset for {{attributeId}}",
                          })
                        : preset.kind === "global" && preset.globalRule
                          ? t("admin.dynamicPricing.presetDescription.global", {
                              calculator: preset.globalRule.calculator,
                              metric:
                                preset.globalRule.metric ??
                                preset.globalRule.inputId ??
                                "fixed",
                              target: preset.globalRule.target,
                              defaultValue: "{{target}} · {{calculator}} · {{metric}}",
                            })
                          : "")}
                  </Text>
                </Table.Cell>
                <Table.Cell textAlign="end">
                  <HStack justify="flex-end">
                    <Button
                      size="xs"
                      variant="outline"
                      colorPalette="red"
                      onClick={() => setPendingDeletion(preset)}
                    >
                      {t("admin.dynamicPricing.delete", {
                        defaultValue: "Delete",
                      })}
                    </Button>
                  </HStack>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}

      <Dialog.Root
        open={pendingDeletion !== null}
        onOpenChange={(details) => {
          if (!details.open) setPendingDeletion(null);
        }}
        placement="center"
        role="alertdialog"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  {t("admin.dynamicPricing.deletePresetTitle", {
                    defaultValue: "Delete preset?",
                  })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Box>
                  {t("admin.dynamicPricing.deletePresetDescription", {
                    defaultValue:
                      "This action cannot be undone. Products still linking this preset will fall back to their inline rules.",
                  })}
                  {pendingDeletion && (
                    <Text mt="2" fontWeight="medium">
                      {pendingDeletion.label || pendingDeletion.id}
                    </Text>
                  )}
                </Box>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="ghost" onClick={() => setPendingDeletion(null)}>
                  {t("admin.dynamicPricing.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button colorPalette="red" onClick={handleDelete}>
                  {t("admin.dynamicPricing.delete", { defaultValue: "Delete" })}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
