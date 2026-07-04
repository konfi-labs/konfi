"use client";

import { useT } from "@/i18n/client";
import { storefrontRadiusCssVar } from "@/lib/storefront-editor/theme-vars";
import { Box, Grid, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { themeGradients } from "@konfi/components/theme";
import type { StorefrontHomeBlockVariant } from "@konfi/types";

type HowItWorksVariant = Extract<
  StorefrontHomeBlockVariant,
  "compact" | "default" | "timeline"
>;

const steps = [
  { key: "choose", icon: "category", number: 1 },
  { key: "configure", icon: "tune", number: 2 },
  { key: "upload", icon: "upload_file", number: 3 },
  { key: "proof", icon: "preview", number: 4 },
  { key: "pay", icon: "payments", number: 5 },
  { key: "receive", icon: "local_shipping", number: 6 },
] as const;

const WORKFLOW_PANEL = { _dark: "blackAlpha.300", _light: "blackAlpha.300" };
const WORKFLOW_BORDER = { _dark: "primary.solid", _light: "primary.solid" };
const WORKFLOW_TEXT = { _dark: "gray.50", _light: "gray.50" };
const WORKFLOW_MUTED = { _dark: "gray.200", _light: "gray.200" };

export function HowItWorks({
  lng,
  description,
  title,
  variant = "default",
}: {
  description?: string;
  lng: string;
  title?: string;
  variant?: HowItWorksVariant;
}) {
  const { t } = useT();
  const isCompact = variant === "compact";
  const isTimeline = variant === "timeline";

  return (
    <Box
      as="section"
      bg={isTimeline ? "bg.panel" : "gray.950"}
      bgImage={isTimeline ? undefined : themeGradients.workflowSection}
      color={isTimeline ? undefined : WORKFLOW_TEXT}
      borderRadius={storefrontRadiusCssVar.block}
      border={isTimeline ? "1px solid" : undefined}
      borderColor={isTimeline ? "border.muted" : undefined}
      px={isCompact ? [4, 5, 6] : [5, 8, 10]}
      py={isCompact ? [5, 6, 8] : [8, 10, 12]}
      overflow="hidden"
      position="relative"
    >
      {!isTimeline ? (
        <Box
          aria-hidden="true"
          position="absolute"
          top="-20%"
          right="-6%"
          h={[180, 240, 320]}
          w={[180, 240, 320]}
          borderRadius="full"
          bg="primary.solid"
          opacity={0.22}
          filter="blur(120px)"
        />
      ) : null}

      <Grid
        templateColumns={{
          base: "1fr",
          xl: isCompact ? "1fr" : "minmax(0, 0.8fr) minmax(0, 1.2fr)",
        }}
        gap={isCompact ? [5, 6] : [8, 10]}
        position="relative"
      >
        <VStack
          align={isCompact ? "center" : "start"}
          gap={isCompact ? 3 : 4}
          maxW={isCompact ? "3xl" : "lg"}
          textAlign={isCompact ? "center" : "start"}
          mx={isCompact ? "auto" : undefined}
        >
          <Heading
            as="h2"
            size={{ base: "2xl", md: "3xl" }}
            textWrap="balance"
            className={isTimeline ? undefined : "dark"}
          >
            {title ??
              t("store.home.howItWorks.title", {
                defaultValue: "How it works",
                lng,
              })}
          </Heading>
          <Text
            fontSize={{ base: "md", md: isCompact ? "md" : "lg" }}
            color={isTimeline ? "fg.muted" : WORKFLOW_MUTED}
          >
            {description ??
              t("store.home.howItWorks.description", {
                defaultValue:
                  "A short six-step flow from brief to doorstep — with file verification in the middle, where it matters.",
                lng,
              })}
          </Text>
        </VStack>

        <Grid
          templateColumns={{
            base: "1fr",
            md: isTimeline ? "1fr" : "repeat(2, 1fr)",
            xl: isCompact
              ? "repeat(6, 1fr)"
              : isTimeline
                ? "repeat(6, 1fr)"
                : "repeat(3, 1fr)",
          }}
          gap={isCompact ? [3, 4] : [4, 5, 6]}
        >
          {steps.map((step) => (
            <VStack
              key={step.key}
              align={isCompact ? "center" : "start"}
              gap={isCompact ? 2 : 3}
              pt={isTimeline ? 5 : 4}
              borderTop="1px solid"
              borderColor={isTimeline ? "primary.solid" : WORKFLOW_BORDER}
              bg={isTimeline ? "transparent" : WORKFLOW_PANEL}
              borderRadius={isTimeline ? "none" : storefrontRadiusCssVar.card}
              px={isCompact ? 3 : 4}
              pb={isCompact ? 3 : 4}
              backdropFilter={isTimeline ? undefined : "blur(12px)"}
              textAlign={isCompact ? "center" : "start"}
            >
              <HStack
                justify={isCompact ? "center" : "space-between"}
                align="center"
                w="full"
              >
                <Text
                  fontSize="xs"
                  letterSpacing="0.24em"
                  textTransform="uppercase"
                  fontFamily="mono"
                  color={isTimeline ? "fg.muted" : undefined}
                >
                  {String(step.number).padStart(2, "0")}
                </Text>
                <HStack
                  justify="center"
                  align="center"
                  w={["34px", "38px"]}
                  h={["34px", "38px"]}
                  borderRadius={storefrontRadiusCssVar.button}
                  bg="primary.solid"
                  color="primary.contrast"
                >
                  <MaterialSymbol aria-hidden="true">
                    {step.icon}
                  </MaterialSymbol>
                </HStack>
              </HStack>
              <Text
                fontWeight="semibold"
                fontSize={{ base: "md", md: isCompact ? "md" : "lg" }}
              >
                {t(`store.home.howItWorks.steps.${step.key}`, {
                  defaultValue: step.key,
                  lng,
                })}
              </Text>
              <Text
                fontSize="sm"
                color={isTimeline ? "fg.muted" : WORKFLOW_MUTED}
                display={isCompact ? "none" : undefined}
              >
                {t(`store.home.howItWorks.steps.${step.key}`, {
                  defaultValue: step.key,
                  lng,
                })}
              </Text>
            </VStack>
          ))}
        </Grid>
      </Grid>
    </Box>
  );
}
