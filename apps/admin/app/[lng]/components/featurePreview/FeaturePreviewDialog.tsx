"use client";

import { useFeaturePreview } from "@/context/featurePreview";
import type { FeaturePreviewId } from "@/context/featurePreview";
import { isFeaturePreviewAvailable } from "@/context/featurePreview";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  CloseButton,
  Dialog,
  HStack,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Switch } from "@konfi/components";

interface FeatureDefinition {
  id: FeaturePreviewId;
  nameKey: string;
  nameDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
}

const FEATURES: FeatureDefinition[] = [
  {
    id: "spotColorAuthoring",
    nameKey: "featurePreview.features.spotColorAuthoring.name",
    nameDefault: "Spot Color Authoring",
    descriptionKey: "featurePreview.features.spotColorAuthoring.description",
    descriptionDefault:
      "Unlocks spot-color plate authoring and proof preview for artwork " +
      "uploads. Supports WHITE, CUT, VARNISH, generated white underbase, " +
      "layer visibility, and plate/composite proof views.",
  },
  {
    id: "stickersImposition",
    nameKey: "featurePreview.features.stickersImposition.name",
    nameDefault: "Stickers Imposition",
    descriptionKey: "featurePreview.features.stickersImposition.description",
    descriptionDefault:
      "Unlocks the stickers imposition tool, which arranges sticker artwork " +
      "on roll or sheet media for efficient cutting. Supports configurable media " +
      "widths, bleed settings, and multiple packing modes to minimise waste.",
  },
];

export function FeaturePreviewDialog() {
  const { t } = useT();
  const { isDialogOpen, closeDialog, isEnabled, toggle } = useFeaturePreview();

  return (
    <Dialog.Root
      open={isDialogOpen}
      onOpenChange={({ open }) => {
        if (!open) closeDialog();
      }}
      placement="center"
      scrollBehavior="inside"
      size="lg"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner px={{ base: 3, md: 6 }} py={{ base: 3, md: 8 }}>
          <Dialog.Content
            borderRadius="3xl"
            display="flex"
            flexDirection="column"
            maxH={{ base: "calc(100dvh - 2rem)", md: "calc(100dvh - 4rem)" }}
            overflow="hidden"
          >
            <Dialog.Header>
              <HStack gap={2} align="center">
                <Dialog.Title>
                  {t("featurePreview.title", {
                    defaultValue: "Feature Preview",
                  })}
                </Dialog.Title>
                <Badge colorPalette="orange" size="sm" borderRadius="full">
                  {t("featurePreview.betaBadge", { defaultValue: "Beta" })}
                </Badge>
              </HStack>
              <Dialog.CloseTrigger asChild>
                <CloseButton
                  size="sm"
                  aria-label={t("common.close", { defaultValue: "Close" })}
                />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body
              minH={0}
              overflowY="auto"
              overscrollBehavior="contain"
              pb={6}
            >
              <Text
                mb={6}
                fontSize="sm"
                color={{ base: "gray.600", _dark: "gray.400" }}
              >
                {t("featurePreview.description", {
                  defaultValue:
                    "Try out upcoming features before they are released. " +
                    "These settings stay saved in this browser until you turn them off.",
                })}
              </Text>
              <VStack align="stretch" gap={4}>
                {FEATURES.filter((feature) =>
                  isFeaturePreviewAvailable(feature.id),
                ).map((feature) => (
                  <Box
                    key={feature.id}
                    display="grid"
                    gridTemplateColumns={{ base: "1fr", sm: "200px 1fr" }}
                    gap={4}
                    p={4}
                    borderWidth="1px"
                    borderRadius="2xl"
                    bg={{ base: "gray.50", _dark: "gray.900" }}
                  >
                    <VStack align="start" gap={2} justify="start">
                      <HStack gap={2} align="center">
                        <Text fontWeight="semibold" fontSize="sm">
                          {t(feature.nameKey, {
                            defaultValue: feature.nameDefault,
                          })}
                        </Text>
                      </HStack>
                      <Switch
                        size="lg"
                        colorPalette="primary"
                        checked={isEnabled(feature.id)}
                        onCheckedChange={() => toggle(feature.id)}
                      />
                    </VStack>
                    <Text
                      fontSize="sm"
                      color={{ base: "gray.600", _dark: "gray.400" }}
                      lineHeight="tall"
                    >
                      {t(feature.descriptionKey, {
                        defaultValue: feature.descriptionDefault,
                      })}
                    </Text>
                  </Box>
                ))}
              </VStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
